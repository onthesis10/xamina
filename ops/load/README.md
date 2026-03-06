# Sprint 5 Load & Timer Test

## Prerequisites
- API running (`http://localhost:8080/api/v1` by default)
- Valid student `ACCESS_TOKEN`
- Active `SUBMISSION_ID`

## 1) 100 concurrent students (answers endpoint)

```powershell
docker run --rm -i `
  -e API_BASE_URL=http://host.docker.internal:8080/api/v1 `
  -e ACCESS_TOKEN="<bearer-token>" `
  -e SUBMISSION_ID="<submission-id>" `
  -e QUESTION_ID="<question-id>" `
  -e VUS=100 `
  -e DURATION=60s `
  -v "${PWD}/ops/load:/scripts" `
  grafana/k6 run /scripts/sprint5_exam_session_100vu.js
```

## 2) Timer sync accuracy

```powershell
docker run --rm -i `
  -e API_BASE_URL=http://host.docker.internal:8080/api/v1 `
  -e ACCESS_TOKEN="<bearer-token>" `
  -e SUBMISSION_ID="<submission-id>" `
  -e ITERATIONS=20 `
  -e TIMER_DRIFT_MAX=2 `
  -v "${PWD}/ops/load:/scripts" `
  grafana/k6 run /scripts/sprint5_timer_accuracy.js
```

## Output Artifacts
- Capture stdout results to file for evidence:

```powershell
docker run ... grafana/k6 run /scripts/sprint5_exam_session_100vu.js *>&1 | Tee-Object -FilePath ops/load/reports/sprint5_100vu.log
docker run ... grafana/k6 run /scripts/sprint5_timer_accuracy.js *>&1 | Tee-Object -FilePath ops/load/reports/sprint5_timer.log
```

## 3) AI baseline + rate-limit load test (Sprint 9)

Run combined runner (auto host `k6` or docker fallback):

```powershell
./ops/loadtest/run_ai_loadtests.ps1 `
  -ApiUrl "http://localhost:8080/api/v1" `
  -TenantSlug "default" `
  -Email "guru@xamina.local" `
  -Password "Guru123!"
```

Generated artifacts:
- `ops/load/reports/ai-load-meta-*.txt`
- `ops/load/reports/k6-ai-baseline-summary-*.json`
- `ops/load/reports/k6-ai-baseline-*.log`
- `ops/load/reports/k6-ai-rate-limit-summary-*.json`
- `ops/load/reports/k6-ai-rate-limit-*.log`
