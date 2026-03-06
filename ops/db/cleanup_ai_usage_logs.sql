-- Cleanup AI usage logs older than the retention window.
-- Default retention is 90 days (align with AI_USAGE_RETENTION_DAYS).
DELETE FROM ai_usage_logs
WHERE created_at < NOW() - INTERVAL '90 days';
