# Monitoring MVP (Sprint 6)

## Scope
- HTTP metrics endpoint: `GET /metrics`.
- Prometheus scrape + Grafana dashboard via compose profile `monitoring`.

## Run
1. Start core stack: `docker compose up -d postgres redis api frontend`
2. Start monitoring stack: `docker compose --profile monitoring up -d prometheus grafana`
3. Check metrics: `http://localhost:8080/metrics`
4. Prometheus: `http://localhost:9090`
5. Grafana: `http://localhost:3001` (`admin/admin`)

## MVP SLO
- API availability >= 99.5% (staging)
- p95 latency <= 500 ms for core endpoints
- Error rate 5xx <= 1%

## Alert Minimum
- Service down: no scrape target for 2 minutes.
- Error spike: 5xx rate > 1% for 5 minutes.
- Latency spike: p95 > 500 ms for 10 minutes.

## Incident First Response
1. Confirm `/health` and `/metrics` status.
2. Check 5xx and latency on Grafana dashboard.
3. Correlate with latest deployment/logs.
4. Trigger rollback if sustained degradation > 10 minutes.
5. Log incident summary and follow-up action items.
