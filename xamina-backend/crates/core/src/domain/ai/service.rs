use std::{collections::HashMap, env, time::Instant};

use async_openai::{
    config::OpenAIConfig,
    types::{
        ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestUserMessageArgs,
        ChatCompletionStreamOptions, CompletionUsage, CreateChatCompletionRequest,
        CreateChatCompletionRequestArgs,
    },
    Client,
};
use futures_util::StreamExt;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::json;
use tracing::warn;
use uuid::Uuid;

use super::{
    dto::{
        ExtractPdfResponse, GenerateQuestionRequest, GenerateQuestionResponse, GradeEssayRequest,
        GradeEssayResponse,
    },
    models::{AiUsageLogCreate, AiUsageSummary},
    repository::AiRepository,
};
use crate::{domain::tenant::repository::TenantRepository, error::CoreError};

#[derive(Debug, Clone, Deserialize)]
struct ModelPricing {
    prompt_per_1k_usd: f64,
    completion_per_1k_usd: f64,
}

#[derive(Clone)]
pub struct AiService {
    client: Client<OpenAIConfig>,
    model: String,
    provider: String,
    mock_mode: bool,
    tenant_repo: TenantRepository,
    ai_repo: AiRepository,
    pricing_by_model: HashMap<String, ModelPricing>,
}

impl AiService {
    pub fn new(tenant_repo: TenantRepository, ai_repo: AiRepository) -> Self {
        let openai_api_key = env::var("OPENAI_API_KEY").ok().and_then(|v| {
            if v.trim().is_empty() {
                None
            } else {
                Some(v)
            }
        });
        let groq_api_key = env::var("GROQ_API_KEY").ok().and_then(|v| {
            if v.trim().is_empty() {
                None
            } else {
                Some(v)
            }
        });

        let (api_key, default_base_url, default_model, provider) = if let Some(key) = openai_api_key
        {
            (key, None, "gpt-4o-mini", "openai")
        } else if let Some(key) = groq_api_key {
            (
                key,
                Some("https://api.groq.com/openai/v1"),
                "llama-3.1-8b-instant",
                "groq",
            )
        } else {
            (
                "dummy_key_for_ollama".to_string(),
                None,
                "gpt-4o-mini",
                "ollama",
            )
        };

        let mut config = OpenAIConfig::new().with_api_key(api_key);
        if let Ok(base_url) = env::var("OPENAI_BASE_URL").or_else(|_| env::var("GROQ_BASE_URL")) {
            if !base_url.trim().is_empty() {
                config = config.with_api_base(base_url);
            }
        } else if let Some(base_url) = default_base_url {
            config = config.with_api_base(base_url.to_string());
        }

        let model = env::var("OPENAI_MODEL")
            .or_else(|_| env::var("GROQ_MODEL"))
            .ok()
            .and_then(|v| if v.trim().is_empty() { None } else { Some(v) })
            .unwrap_or_else(|| default_model.to_string());

        Self {
            client: Client::with_config(config),
            model,
            provider: provider.to_string(),
            mock_mode: Self::read_bool_env("AI_MOCK_MODE"),
            tenant_repo,
            ai_repo,
            pricing_by_model: Self::load_pricing_map(),
        }
    }

    pub async fn extract_pdf_bytes(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        pdf_bytes: &[u8],
    ) -> Result<(ExtractPdfResponse, AiUsageSummary), CoreError> {
        let started_at = Instant::now();
        let result = pdf_extract::extract_text_from_mem(pdf_bytes)
            .map(|text| ExtractPdfResponse { text })
            .map_err(|_| {
                CoreError::internal("AI_EXTRACT_FAILED", "Failed to extract text from PDF")
            });

        match result {
            Ok(payload) => {
                let summary = AiUsageSummary {
                    latency_ms: Self::latency_ms(started_at),
                    ..AiUsageSummary::default()
                };
                self.ai_repo
                    .insert_usage_log(&AiUsageLogCreate {
                        tenant_id,
                        user_id: Some(user_id),
                        endpoint: endpoint.to_string(),
                        provider: "pdf-extract".to_string(),
                        model: "pdf-extract".to_string(),
                        prompt_tokens: 0,
                        completion_tokens: 0,
                        total_tokens: 0,
                        estimated_cost_usd: 0.0,
                        status: "success".to_string(),
                        error_code: None,
                        latency_ms: summary.latency_ms,
                        metadata: json!({
                            "pdf_bytes": pdf_bytes.len(),
                            "text_length": payload.text.len(),
                        }),
                    })
                    .await?;
                Ok((payload, summary))
            }
            Err(error) => {
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: "pdf-extract".to_string(),
                    model: "pdf-extract".to_string(),
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    estimated_cost_usd: 0.0,
                    status: "error".to_string(),
                    error_code: Some(error.code.to_string()),
                    latency_ms: Self::latency_ms(started_at),
                    metadata: json!({ "pdf_bytes": pdf_bytes.len() }),
                })
                .await;
                Err(error)
            }
        }
    }

    pub async fn generate_questions(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        req: GenerateQuestionRequest,
    ) -> Result<(GenerateQuestionResponse, AiUsageSummary), CoreError> {
        let started_at = Instant::now();
        let (system_prompt, user_prompt) = Self::build_generate_prompts(&req);
        if self.mock_mode {
            let content = Self::mock_generate_content(&req).map_err(|_| {
                CoreError::internal("AI_MOCK_ERROR", "Failed to generate mock AI content")
            })?;
            let parsed: GenerateQuestionResponse = Self::parse_json_response(&content)?;
            let usage = Self::derive_usage(
                None,
                &format!("{system_prompt}\n{user_prompt}"),
                &content,
                Self::latency_ms(started_at),
                |prompt_tokens, completion_tokens| {
                    self.estimate_cost_usd(prompt_tokens, completion_tokens)
                },
            );

            let credits_to_deduct = parsed.questions.len() as i32;
            if credits_to_deduct > 0 {
                if let Err(err) = self
                    .tenant_repo
                    .check_and_deduct_ai_credits(tenant_id, credits_to_deduct)
                    .await
                {
                    self.try_log_error(AiUsageLogCreate {
                        tenant_id,
                        user_id: Some(user_id),
                        endpoint: endpoint.to_string(),
                        provider: "mock".to_string(),
                        model: self.model.clone(),
                        prompt_tokens: usage.prompt_tokens as i32,
                        completion_tokens: usage.completion_tokens as i32,
                        total_tokens: usage.total_tokens as i32,
                        estimated_cost_usd: usage.estimated_cost_usd,
                        status: "error".to_string(),
                        error_code: Some(err.code.to_string()),
                        latency_ms: usage.latency_ms,
                        metadata: json!({
                            "stage": "deduct_credits",
                            "requested_credits": credits_to_deduct,
                            "mock": true,
                        }),
                    })
                    .await;
                    return Err(err);
                }
            }

            self.ai_repo
                .insert_usage_log(&AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: "mock".to_string(),
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens as i32,
                    completion_tokens: usage.completion_tokens as i32,
                    total_tokens: usage.total_tokens as i32,
                    estimated_cost_usd: usage.estimated_cost_usd,
                    status: "success".to_string(),
                    error_code: None,
                    latency_ms: usage.latency_ms,
                    metadata: json!({
                        "question_count": parsed.questions.len(),
                        "question_type": req.question_type,
                        "difficulty": req.difficulty,
                        "mock": true,
                    }),
                })
                .await?;

            return Ok((parsed, usage));
        }

        let request = self.build_chat_request(system_prompt, &user_prompt)?;

        let response = match self.client.chat().create(request).await {
            Ok(data) => data,
            Err(_) => {
                let error = CoreError::internal("AI_PROVIDER_ERROR", "AI provider request failed");
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    estimated_cost_usd: 0.0,
                    status: "error".to_string(),
                    error_code: Some(error.code.to_string()),
                    latency_ms: Self::latency_ms(started_at),
                    metadata: json!({ "stage": "provider_request" }),
                })
                .await;
                return Err(error);
            }
        };

        let content = response
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_else(|| "{}".to_string());

        let parsed: GenerateQuestionResponse = match Self::parse_json_response(&content) {
            Ok(data) => data,
            Err(error) => {
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: 0,
                    completion_tokens: Self::estimate_tokens(&content) as i32,
                    total_tokens: Self::estimate_tokens(&content) as i32,
                    estimated_cost_usd: 0.0,
                    status: "error".to_string(),
                    error_code: Some(error.code.to_string()),
                    latency_ms: Self::latency_ms(started_at),
                    metadata: json!({ "stage": "parse_json" }),
                })
                .await;
                return Err(error);
            }
        };

        let usage = Self::derive_usage(
            response.usage,
            &format!("{system_prompt}\n{user_prompt}"),
            &content,
            Self::latency_ms(started_at),
            |prompt_tokens, completion_tokens| {
                self.estimate_cost_usd(prompt_tokens, completion_tokens)
            },
        );

        let credits_to_deduct = parsed.questions.len() as i32;
        if credits_to_deduct > 0 {
            if let Err(err) = self
                .tenant_repo
                .check_and_deduct_ai_credits(tenant_id, credits_to_deduct)
                .await
            {
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens as i32,
                    completion_tokens: usage.completion_tokens as i32,
                    total_tokens: usage.total_tokens as i32,
                    estimated_cost_usd: usage.estimated_cost_usd,
                    status: "error".to_string(),
                    error_code: Some(err.code.to_string()),
                    latency_ms: usage.latency_ms,
                    metadata: json!({
                        "stage": "deduct_credits",
                        "requested_credits": credits_to_deduct,
                    }),
                })
                .await;
                return Err(err);
            }
        }

        self.ai_repo
            .insert_usage_log(&AiUsageLogCreate {
                tenant_id,
                user_id: Some(user_id),
                endpoint: endpoint.to_string(),
                provider: self.provider.clone(),
                model: self.model.clone(),
                prompt_tokens: usage.prompt_tokens as i32,
                completion_tokens: usage.completion_tokens as i32,
                total_tokens: usage.total_tokens as i32,
                estimated_cost_usd: usage.estimated_cost_usd,
                status: "success".to_string(),
                error_code: None,
                latency_ms: usage.latency_ms,
                metadata: json!({
                    "question_count": parsed.questions.len(),
                    "question_type": req.question_type,
                    "difficulty": req.difficulty,
                }),
            })
            .await?;

        Ok((parsed, usage))
    }

    pub async fn generate_questions_stream<F>(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        req: GenerateQuestionRequest,
        mut on_chunk: F,
    ) -> Result<(GenerateQuestionResponse, AiUsageSummary), CoreError>
    where
        F: FnMut(&str),
    {
        let started_at = Instant::now();
        let (system_prompt, user_prompt) = Self::build_generate_prompts(&req);
        if self.mock_mode {
            let content = Self::mock_generate_content(&req).map_err(|_| {
                CoreError::internal("AI_MOCK_ERROR", "Failed to generate mock AI content")
            })?;
            for chunk in content.as_bytes().chunks(48) {
                let text = String::from_utf8_lossy(chunk);
                on_chunk(&text);
            }

            let parsed: GenerateQuestionResponse = Self::parse_json_response(&content)?;
            let usage = Self::derive_usage(
                None,
                &format!("{system_prompt}\n{user_prompt}"),
                &content,
                Self::latency_ms(started_at),
                |prompt_tokens, completion_tokens| {
                    self.estimate_cost_usd(prompt_tokens, completion_tokens)
                },
            );

            let credits_to_deduct = parsed.questions.len() as i32;
            if credits_to_deduct > 0 {
                if let Err(err) = self
                    .tenant_repo
                    .check_and_deduct_ai_credits(tenant_id, credits_to_deduct)
                    .await
                {
                    self.try_log_error(AiUsageLogCreate {
                        tenant_id,
                        user_id: Some(user_id),
                        endpoint: endpoint.to_string(),
                        provider: "mock".to_string(),
                        model: self.model.clone(),
                        prompt_tokens: usage.prompt_tokens as i32,
                        completion_tokens: usage.completion_tokens as i32,
                        total_tokens: usage.total_tokens as i32,
                        estimated_cost_usd: usage.estimated_cost_usd,
                        status: "error".to_string(),
                        error_code: Some(err.code.to_string()),
                        latency_ms: usage.latency_ms,
                        metadata: json!({
                            "stage": "deduct_credits",
                            "requested_credits": credits_to_deduct,
                            "streaming": true,
                            "mock": true,
                        }),
                    })
                    .await;
                    return Err(err);
                }
            }

            self.ai_repo
                .insert_usage_log(&AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: "mock".to_string(),
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens as i32,
                    completion_tokens: usage.completion_tokens as i32,
                    total_tokens: usage.total_tokens as i32,
                    estimated_cost_usd: usage.estimated_cost_usd,
                    status: "success".to_string(),
                    error_code: None,
                    latency_ms: usage.latency_ms,
                    metadata: json!({
                        "question_count": parsed.questions.len(),
                        "question_type": req.question_type,
                        "difficulty": req.difficulty,
                        "streaming": true,
                        "mock": true,
                    }),
                })
                .await?;

            return Ok((parsed, usage));
        }

        let request = self.build_stream_chat_request(system_prompt, &user_prompt)?;
        let mut stream = match self.client.chat().create_stream(request).await {
            Ok(stream) => stream,
            Err(_) => {
                let error =
                    CoreError::internal("AI_PROVIDER_ERROR", "AI provider stream request failed");
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    estimated_cost_usd: 0.0,
                    status: "error".to_string(),
                    error_code: Some(error.code.to_string()),
                    latency_ms: Self::latency_ms(started_at),
                    metadata: json!({ "stage": "provider_stream_request" }),
                })
                .await;
                return Err(error);
            }
        };

        let mut aggregated_content = String::new();
        let mut usage: Option<CompletionUsage> = None;
        while let Some(item) = stream.next().await {
            let chunk = match item {
                Ok(chunk) => chunk,
                Err(_) => {
                    let error =
                        CoreError::internal("AI_PROVIDER_ERROR", "AI provider stream interrupted");
                    self.try_log_error(AiUsageLogCreate {
                        tenant_id,
                        user_id: Some(user_id),
                        endpoint: endpoint.to_string(),
                        provider: self.provider.clone(),
                        model: self.model.clone(),
                        prompt_tokens: 0,
                        completion_tokens: Self::estimate_tokens(&aggregated_content) as i32,
                        total_tokens: Self::estimate_tokens(&aggregated_content) as i32,
                        estimated_cost_usd: 0.0,
                        status: "error".to_string(),
                        error_code: Some(error.code.to_string()),
                        latency_ms: Self::latency_ms(started_at),
                        metadata: json!({ "stage": "stream_consume" }),
                    })
                    .await;
                    return Err(error);
                }
            };

            if let Some(chunk_usage) = chunk.usage {
                usage = Some(chunk_usage);
            }

            for choice in chunk.choices {
                if let Some(delta_text) = choice.delta.content {
                    aggregated_content.push_str(&delta_text);
                    on_chunk(&delta_text);
                }
            }
        }

        let parsed: GenerateQuestionResponse = match Self::parse_json_response(&aggregated_content)
        {
            Ok(data) => data,
            Err(error) => {
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: 0,
                    completion_tokens: Self::estimate_tokens(&aggregated_content) as i32,
                    total_tokens: Self::estimate_tokens(&aggregated_content) as i32,
                    estimated_cost_usd: 0.0,
                    status: "error".to_string(),
                    error_code: Some(error.code.to_string()),
                    latency_ms: Self::latency_ms(started_at),
                    metadata: json!({ "stage": "parse_stream_json" }),
                })
                .await;
                return Err(error);
            }
        };

        let usage = Self::derive_usage(
            usage,
            &format!("{system_prompt}\n{user_prompt}"),
            &aggregated_content,
            Self::latency_ms(started_at),
            |prompt_tokens, completion_tokens| {
                self.estimate_cost_usd(prompt_tokens, completion_tokens)
            },
        );

        let credits_to_deduct = parsed.questions.len() as i32;
        if credits_to_deduct > 0 {
            if let Err(err) = self
                .tenant_repo
                .check_and_deduct_ai_credits(tenant_id, credits_to_deduct)
                .await
            {
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens as i32,
                    completion_tokens: usage.completion_tokens as i32,
                    total_tokens: usage.total_tokens as i32,
                    estimated_cost_usd: usage.estimated_cost_usd,
                    status: "error".to_string(),
                    error_code: Some(err.code.to_string()),
                    latency_ms: usage.latency_ms,
                    metadata: json!({
                        "stage": "deduct_credits",
                        "requested_credits": credits_to_deduct,
                        "streaming": true,
                    }),
                })
                .await;
                return Err(err);
            }
        }

        self.ai_repo
            .insert_usage_log(&AiUsageLogCreate {
                tenant_id,
                user_id: Some(user_id),
                endpoint: endpoint.to_string(),
                provider: self.provider.clone(),
                model: self.model.clone(),
                prompt_tokens: usage.prompt_tokens as i32,
                completion_tokens: usage.completion_tokens as i32,
                total_tokens: usage.total_tokens as i32,
                estimated_cost_usd: usage.estimated_cost_usd,
                status: "success".to_string(),
                error_code: None,
                latency_ms: usage.latency_ms,
                metadata: json!({
                    "question_count": parsed.questions.len(),
                    "question_type": req.question_type,
                    "difficulty": req.difficulty,
                    "streaming": true,
                }),
            })
            .await?;

        Ok((parsed, usage))
    }

    pub async fn grade_essay(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        req: GradeEssayRequest,
    ) -> Result<(GradeEssayResponse, AiUsageSummary), CoreError> {
        let started_at = Instant::now();
        let system_prompt = "You are an expert grader. Evaluate the student's answer based on the question and rubric. Output valid JSON with schema: { \"score\": 85, \"feedback\": \"Detailed feedback here\" }.";
        let user_prompt = format!(
            "Question: {}\nRubric: {}\nStudent Answer: {}\nPlease grade this essay and return JSON.",
            req.question_text,
            req.rubric.as_deref().unwrap_or("None provided"),
            req.student_answer
        );
        if self.mock_mode {
            let content = Self::mock_grade_content(&req).map_err(|_| {
                CoreError::internal("AI_MOCK_ERROR", "Failed to generate mock AI grading")
            })?;
            let parsed: GradeEssayResponse = Self::parse_json_response(&content)?;
            let usage = Self::derive_usage(
                None,
                &format!("{system_prompt}\n{user_prompt}"),
                &content,
                Self::latency_ms(started_at),
                |prompt_tokens, completion_tokens| {
                    self.estimate_cost_usd(prompt_tokens, completion_tokens)
                },
            );

            if let Err(err) = self
                .tenant_repo
                .check_and_deduct_ai_credits(tenant_id, 1)
                .await
            {
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: "mock".to_string(),
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens as i32,
                    completion_tokens: usage.completion_tokens as i32,
                    total_tokens: usage.total_tokens as i32,
                    estimated_cost_usd: usage.estimated_cost_usd,
                    status: "error".to_string(),
                    error_code: Some(err.code.to_string()),
                    latency_ms: usage.latency_ms,
                    metadata: json!({
                        "stage": "deduct_credits",
                        "requested_credits": 1,
                        "mock": true,
                    }),
                })
                .await;
                return Err(err);
            }

            self.ai_repo
                .insert_usage_log(&AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: "mock".to_string(),
                    model: self.model.clone(),
                    prompt_tokens: usage.prompt_tokens as i32,
                    completion_tokens: usage.completion_tokens as i32,
                    total_tokens: usage.total_tokens as i32,
                    estimated_cost_usd: usage.estimated_cost_usd,
                    status: "success".to_string(),
                    error_code: None,
                    latency_ms: usage.latency_ms,
                    metadata: json!({
                        "essay_length": req.student_answer.len(),
                        "score": parsed.score,
                        "mock": true,
                    }),
                })
                .await?;

            return Ok((parsed, usage));
        }

        let request = self.build_chat_request(system_prompt, &user_prompt)?;

        let response = match self.client.chat().create(request).await {
            Ok(data) => data,
            Err(_) => {
                let error = CoreError::internal("AI_PROVIDER_ERROR", "AI provider request failed");
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: 0,
                    completion_tokens: 0,
                    total_tokens: 0,
                    estimated_cost_usd: 0.0,
                    status: "error".to_string(),
                    error_code: Some(error.code.to_string()),
                    latency_ms: Self::latency_ms(started_at),
                    metadata: json!({ "stage": "provider_request" }),
                })
                .await;
                return Err(error);
            }
        };

        let content = response
            .choices
            .first()
            .and_then(|c| c.message.content.clone())
            .unwrap_or_else(|| "{}".to_string());

        let parsed: GradeEssayResponse = match Self::parse_json_response(&content) {
            Ok(data) => data,
            Err(error) => {
                self.try_log_error(AiUsageLogCreate {
                    tenant_id,
                    user_id: Some(user_id),
                    endpoint: endpoint.to_string(),
                    provider: self.provider.clone(),
                    model: self.model.clone(),
                    prompt_tokens: 0,
                    completion_tokens: Self::estimate_tokens(&content) as i32,
                    total_tokens: Self::estimate_tokens(&content) as i32,
                    estimated_cost_usd: 0.0,
                    status: "error".to_string(),
                    error_code: Some(error.code.to_string()),
                    latency_ms: Self::latency_ms(started_at),
                    metadata: json!({ "stage": "parse_json" }),
                })
                .await;
                return Err(error);
            }
        };

        let usage = Self::derive_usage(
            response.usage,
            &format!("{system_prompt}\n{user_prompt}"),
            &content,
            Self::latency_ms(started_at),
            |prompt_tokens, completion_tokens| {
                self.estimate_cost_usd(prompt_tokens, completion_tokens)
            },
        );

        if let Err(err) = self
            .tenant_repo
            .check_and_deduct_ai_credits(tenant_id, 1)
            .await
        {
            self.try_log_error(AiUsageLogCreate {
                tenant_id,
                user_id: Some(user_id),
                endpoint: endpoint.to_string(),
                provider: self.provider.clone(),
                model: self.model.clone(),
                prompt_tokens: usage.prompt_tokens as i32,
                completion_tokens: usage.completion_tokens as i32,
                total_tokens: usage.total_tokens as i32,
                estimated_cost_usd: usage.estimated_cost_usd,
                status: "error".to_string(),
                error_code: Some(err.code.to_string()),
                latency_ms: usage.latency_ms,
                metadata: json!({
                    "stage": "deduct_credits",
                    "requested_credits": 1,
                }),
            })
            .await;
            return Err(err);
        }

        self.ai_repo
            .insert_usage_log(&AiUsageLogCreate {
                tenant_id,
                user_id: Some(user_id),
                endpoint: endpoint.to_string(),
                provider: self.provider.clone(),
                model: self.model.clone(),
                prompt_tokens: usage.prompt_tokens as i32,
                completion_tokens: usage.completion_tokens as i32,
                total_tokens: usage.total_tokens as i32,
                estimated_cost_usd: usage.estimated_cost_usd,
                status: "success".to_string(),
                error_code: None,
                latency_ms: usage.latency_ms,
                metadata: json!({
                    "essay_length": req.student_answer.len(),
                    "score": parsed.score,
                }),
            })
            .await?;

        Ok((parsed, usage))
    }

    pub async fn log_rate_limited(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        endpoint: &str,
        error_code: &str,
        details: serde_json::Value,
    ) -> Result<(), CoreError> {
        self.ai_repo
            .insert_usage_log(&AiUsageLogCreate {
                tenant_id,
                user_id: Some(user_id),
                endpoint: endpoint.to_string(),
                provider: self.provider.clone(),
                model: self.model.clone(),
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
                estimated_cost_usd: 0.0,
                status: "rate_limited".to_string(),
                error_code: Some(error_code.to_string()),
                latency_ms: 0,
                metadata: details,
            })
            .await
    }

    fn build_chat_request(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<CreateChatCompletionRequest, CoreError> {
        CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .messages([
                ChatCompletionRequestSystemMessageArgs::default()
                    .content(system_prompt)
                    .build()
                    .map_err(|_| {
                        CoreError::bad_request(
                            "AI_REQUEST_BUILD_ERROR",
                            "Failed to build system prompt",
                        )
                    })?
                    .into(),
                ChatCompletionRequestUserMessageArgs::default()
                    .content(user_prompt)
                    .build()
                    .map_err(|_| {
                        CoreError::bad_request(
                            "AI_REQUEST_BUILD_ERROR",
                            "Failed to build user prompt",
                        )
                    })?
                    .into(),
            ])
            .build()
            .map_err(|_| {
                CoreError::bad_request(
                    "AI_REQUEST_BUILD_ERROR",
                    "Failed to build AI completion request",
                )
            })
    }

    fn build_stream_chat_request(
        &self,
        system_prompt: &str,
        user_prompt: &str,
    ) -> Result<CreateChatCompletionRequest, CoreError> {
        CreateChatCompletionRequestArgs::default()
            .model(&self.model)
            .stream(true)
            .stream_options(ChatCompletionStreamOptions {
                include_usage: true,
            })
            .messages([
                ChatCompletionRequestSystemMessageArgs::default()
                    .content(system_prompt)
                    .build()
                    .map_err(|_| {
                        CoreError::bad_request(
                            "AI_REQUEST_BUILD_ERROR",
                            "Failed to build system prompt",
                        )
                    })?
                    .into(),
                ChatCompletionRequestUserMessageArgs::default()
                    .content(user_prompt)
                    .build()
                    .map_err(|_| {
                        CoreError::bad_request(
                            "AI_REQUEST_BUILD_ERROR",
                            "Failed to build user prompt",
                        )
                    })?
                    .into(),
            ])
            .build()
            .map_err(|_| {
                CoreError::bad_request(
                    "AI_REQUEST_BUILD_ERROR",
                    "Failed to build AI stream request",
                )
            })
    }

    fn build_generate_prompts(req: &GenerateQuestionRequest) -> (&'static str, String) {
        let system_prompt = match req.question_type.as_str() {
            "multiple_choice" => "You are an expert teacher creating multiple-choice questions. Generate questions based on the provided topic and context. The output must be valid JSON matching this schema: { \"questions\": [ { \"question_text\": \"...\", \"question_type\": \"multiple_choice\", \"options\": [ { \"text\": \"...\", \"is_correct\": true/false } ], \"explanation\": \"...\" } ] }.",
            "true_false" => "You are an expert teacher creating true/false questions. Generate questions based on the provided topic and context. The output must be valid JSON matching this schema: { \"questions\": [ { \"question_text\": \"...\", \"question_type\": \"true_false\", \"correct_answer_bool\": true/false, \"explanation\": \"...\" } ] }.",
            "essay" | "short_answer" => "You are an expert teacher creating essay questions. Generate questions based on the provided topic and context. The output must be valid JSON matching this schema: { \"questions\": [ { \"question_text\": \"...\", \"question_type\": \"essay\", \"explanation\": \"Suggested rubric: ...\" } ] }.",
            _ => "You are an expert teacher generating questions. Output in valid JSON: { \"questions\": [] }.",
        };
        let user_prompt = format!(
            "Topic: {}\nContext: {}\nDifficulty: {}\nCount: {}\nPlease generate {} {} questions in JSON format.",
            req.topic,
            req.context.as_deref().unwrap_or("None provided"),
            req.difficulty,
            req.count,
            req.count,
            req.question_type
        );
        (system_prompt, user_prompt)
    }

    fn parse_json_response<T: DeserializeOwned>(content: &str) -> Result<T, CoreError> {
        if let Ok(parsed) = serde_json::from_str::<T>(content) {
            return Ok(parsed);
        }

        let trimmed = content.trim();
        if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
            let candidate = &trimmed[start..=end];
            return serde_json::from_str::<T>(candidate).map_err(|_| {
                CoreError::bad_request(
                    "AI_RESPONSE_INVALID",
                    "AI response does not contain valid JSON payload",
                )
            });
        }

        Err(CoreError::bad_request(
            "AI_RESPONSE_INVALID",
            "AI response does not contain valid JSON payload",
        ))
    }

    fn derive_usage<F>(
        usage: Option<CompletionUsage>,
        prompt_text: &str,
        completion_text: &str,
        latency_ms: i32,
        estimate_cost: F,
    ) -> AiUsageSummary
    where
        F: Fn(u32, u32) -> f64,
    {
        let (prompt_tokens, completion_tokens, total_tokens) = if let Some(usage) = usage {
            (
                usage.prompt_tokens,
                usage.completion_tokens,
                usage.total_tokens,
            )
        } else {
            let prompt_tokens = Self::estimate_tokens(prompt_text);
            let completion_tokens = Self::estimate_tokens(completion_text);
            (
                prompt_tokens,
                completion_tokens,
                prompt_tokens + completion_tokens,
            )
        };

        AiUsageSummary {
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost_usd: estimate_cost(prompt_tokens, completion_tokens),
            latency_ms,
        }
    }

    fn load_pricing_map() -> HashMap<String, ModelPricing> {
        let defaults = Self::default_pricing_map();
        let Ok(raw) = env::var("AI_PRICING_JSON") else {
            return defaults;
        };
        let Ok(parsed) = serde_json::from_str::<HashMap<String, ModelPricing>>(&raw) else {
            return defaults;
        };
        if parsed.is_empty() {
            return defaults;
        }
        parsed
    }

    fn default_pricing_map() -> HashMap<String, ModelPricing> {
        let mut map = HashMap::new();
        map.insert(
            "gpt-4o-mini".to_string(),
            ModelPricing {
                prompt_per_1k_usd: 0.00015,
                completion_per_1k_usd: 0.0006,
            },
        );
        map.insert(
            "llama-3.1-8b-instant".to_string(),
            ModelPricing {
                prompt_per_1k_usd: 0.00005,
                completion_per_1k_usd: 0.00008,
            },
        );
        map
    }

    fn estimate_cost_usd(&self, prompt_tokens: u32, completion_tokens: u32) -> f64 {
        let Some(pricing) = self.pricing_by_model.get(&self.model) else {
            return 0.0;
        };
        (f64::from(prompt_tokens) / 1000.0) * pricing.prompt_per_1k_usd
            + (f64::from(completion_tokens) / 1000.0) * pricing.completion_per_1k_usd
    }

    fn estimate_tokens(text: &str) -> u32 {
        // Simple fallback estimation when provider usage is not available.
        let chars = text.chars().count() as f64;
        (chars / 4.0).ceil().max(1.0) as u32
    }

    fn mock_generate_content(req: &GenerateQuestionRequest) -> Result<String, serde_json::Error> {
        let questions = (0..req.count)
            .map(|idx| {
                let seq = idx + 1;
                match req.question_type.as_str() {
                    "multiple_choice" => json!({
                        "question_text": format!("[Mock] {} - Question {}", req.topic, seq),
                        "question_type": "multiple_choice",
                        "options": [
                            { "text": "Option A", "is_correct": true },
                            { "text": "Option B", "is_correct": false }
                        ],
                        "explanation": format!("Mock explanation {}", seq),
                    }),
                    "true_false" => json!({
                        "question_text": format!("[Mock] {} - Question {}", req.topic, seq),
                        "question_type": "true_false",
                        "correct_answer_bool": true,
                        "explanation": format!("Mock explanation {}", seq),
                    }),
                    _ => json!({
                        "question_text": format!("[Mock] {} - Question {}", req.topic, seq),
                        "question_type": "essay",
                        "explanation": format!("Mock rubric {}", seq),
                    }),
                }
            })
            .collect::<Vec<_>>();

        serde_json::to_string(&json!({ "questions": questions }))
    }

    fn mock_grade_content(req: &GradeEssayRequest) -> Result<String, serde_json::Error> {
        serde_json::to_string(&json!({
            "score": 88.0,
            "feedback": format!(
                "Mock grading feedback for answer length {} characters.",
                req.student_answer.len()
            ),
        }))
    }

    fn read_bool_env(key: &str) -> bool {
        std::env::var(key)
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    }

    fn latency_ms(started_at: Instant) -> i32 {
        started_at.elapsed().as_millis().min(i32::MAX as u128) as i32
    }

    async fn try_log_error(&self, payload: AiUsageLogCreate) {
        if let Err(err) = self.ai_repo.insert_usage_log(&payload).await {
            warn!(
                code = err.code,
                message = %err.message,
                endpoint = payload.endpoint,
                "failed to persist ai error log"
            );
        }
    }
}
