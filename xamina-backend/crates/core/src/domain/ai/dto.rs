use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
pub struct ExtractPdfRequest {
    // This will be handled via multipart, but we might want a structured dto for other uses
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractPdfResponse {
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GenerateQuestionRequest {
    pub topic: String,
    pub context: Option<String>,
    pub question_type: String, // "multiple_choice", "true_false", "essay"
    pub count: u32,
    pub difficulty: String, // "easy", "medium", "hard"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiGeneratedOption {
    pub text: String,
    pub is_correct: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiGeneratedQuestion {
    pub question_text: String,
    pub question_type: String,
    pub options: Option<Vec<AiGeneratedOption>>, // for multiple choice
    pub correct_answer_bool: Option<bool>,       // for true_false
    pub explanation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateQuestionResponse {
    pub questions: Vec<AiGeneratedQuestion>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GradeEssayRequest {
    pub question_text: String,
    pub student_answer: String,
    pub rubric: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GradeEssayResponse {
    pub score: f32, // e.g. 0.0 to 100.0
    pub feedback: String,
}
