# AI Monitoring Runbook (Sprint 9)

## Scope
- Monitor AI request volume, tokens, cost estimate, and rate-limit hits.
- Verify AI usage logs persisted in PostgreSQL.

## Metrics Endpoint
- URL: `/metrics`
- AI metrics exposed:
  - `xamina_ai_requests_total`
  - `xamina_ai_tokens_total`
  - `xamina_ai_cost_usd_total`
  - `xamina_ai_rate_limit_hits_total`

Quick check:

```powershell
curl http://localhost:8080/metrics | Select-String "xamina_ai_"
```

## Database Usage Logs
- Table: `ai_usage_logs`
- Important columns:
  - `tenant_id`, `user_id`, `endpoint`
  - `provider`, `model`
  - `prompt_tokens`, `completion_tokens`, `total_tokens`
  - `estimated_cost_usd`
  - `status` (`success|error|rate_limited`)
  - `error_code`
  - `latency_ms`
  - `created_at`

Sample queries:

```sql
-- Usage summary for last 24h
SELECT
  endpoint,
  status,
  COUNT(*) AS requests,
  SUM(total_tokens) AS tokens,
  SUM(estimated_cost_usd) AS estimated_cost_usd
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY endpoint, status
ORDER BY endpoint, status;

-- Latest AI errors / rate limits
SELECT created_at, endpoint, status, error_code, metadata
FROM ai_usage_logs
WHERE status IN ('error', 'rate_limited')
ORDER BY created_at DESC
LIMIT 100;
```

## Rate-Limit Verification
- Default limits:
  - `AI_RATE_LIMIT_GENERATE_PER_MIN=12`
  - `AI_RATE_LIMIT_GRADE_PER_MIN=30`
  - `AI_RATE_LIMIT_EXTRACT_PER_MIN=10`
- Rejections return `429` with code `RATE_LIMITED`.

## Load-Test Evidence
Run:

```powershell
./ops/loadtest/run_ai_loadtests.ps1
```

Store artifacts from `ops/load/reports` as Sprint 9 evidence.

## Retention
- Default retention policy: 90 hari.
- Cleanup SQL: `ops/db/cleanup_ai_usage_logs.sql`
