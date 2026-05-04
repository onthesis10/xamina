# Xamina Production Runbook

> Last updated: 2026-05-02 | Sprint 16 — Launch Preparation

---

## 1. Production Startup Sequence

Start services in order. Each must be healthy before starting the next.

| Step | Service          | Command / Action                                    | Health Check                    |
|------|------------------|----------------------------------------------------|---------------------------------|
| 1    | PostgreSQL       | Start database container or cloud instance          | `pg_isready -h <host> -p 5432` |
| 2    | Redis            | Start Redis container or managed Redis              | `redis-cli -h <host> ping`     |
| 3    | Backend API      | `cargo run -p api --release` or Docker image        | `curl http://<host>:8080/health`|
| 4    | Frontend CDN     | Deploy to Cloudflare Pages / Vercel / static host   | HTTP 200 on root URL            |

### Backend Binary Start
```bash
export DATABASE_URL="postgres://user:pass@host:5432/xamina"
export REDIS_URL="redis://host:6379"
export JWT_SECRET="<your-secret>"
export RUST_LOG="info,api=debug"

cargo run -p api --release --bin api
```

---

## 2. Health Checks

### API Health
```bash
curl -f http://localhost:8080/health
# Expected: "OK" (HTTP 200)
```

### Prometheus Metrics
```bash
curl http://localhost:8080/metrics
# Expected: Prometheus text output with axum_http_requests_total
```

### Redis Connectivity
```bash
redis-cli -u $REDIS_URL PING
# Expected: PONG
```

### Database Connectivity
```bash
psql $DATABASE_URL -c "SELECT 1"
# Expected: returns 1
```

---

## 3. Environment Variables Reference

| Variable                    | Required | Description                                      | Example                         |
|-----------------------------|----------|--------------------------------------------------|---------------------------------|
| `DATABASE_URL`              | Yes      | PostgreSQL connection string                      | `postgres://u:p@h:5432/xamina`  |
| `REDIS_URL`                 | Yes      | Redis connection string                           | `redis://localhost:6379`         |
| `JWT_SECRET`                | Yes      | Secret for signing JWT access tokens              | Random 64+ char string          |
| `RUST_LOG`                  | No       | Log level filter                                  | `info,api=debug`                |
| `XAMINA_ACCESS_TTL_MINUTES` | No       | Access token lifetime (default: 30)               | `60`                            |
| `XAMINA_REFRESH_TTL_DAYS`   | No       | Refresh token lifetime (default: 7)               | `14`                            |
| `XAMINA_UPLOADS_DIR`        | No       | Upload file storage directory                     | `/data/uploads`                 |
| `XAMINA_DISABLE_METRICS`    | No       | Disable Prometheus metrics (test mode)            | `1`                             |
| `VITE_API_URL`              | No       | Frontend API base URL (for production builds)     | `https://api.xamina.id/api/v1`  |
| `VITE_PUBLIC_ANALYTICS_ID`  | No       | Google Analytics / GTM measurement ID             | `G-XXXXXXXXXX`                  |

---

## 4. Rollback Procedure

### Application Rollback
1. **Identify last known good version** — check deployment tags/commits
2. **Redeploy previous image/build**:
   ```bash
   # Docker
   docker stop xamina-api
   docker run -d --name xamina-api <registry>/xamina-api:<previous-tag>
   
   # Or rebuild from git
   git checkout <previous-tag>
   cargo build -p api --release
   ```
3. **Verify health** — run health check endpoints
4. **Notify team** — update incident channel

### Database Rollback
> ⚠️ Only for schema migrations. Data rollbacks require manual SQL.

```bash
# List applied migrations
sqlx migrate info --source xamina-backend/migrations

# Revert last migration (if reversible)
sqlx migrate revert --source xamina-backend/migrations
```

### Redis Cache Flush
```bash
# Flush all cached data (safe — app rebuilds cache on demand)
redis-cli -u $REDIS_URL FLUSHDB
```

---

## 5. Disaster Recovery

### Database Backup & Restore
```bash
# Create backup
pg_dump $DATABASE_URL --format=custom -f backup_$(date +%Y%m%d_%H%M%S).dump

# Restore from backup
pg_restore --clean --if-exists -d $DATABASE_URL backup_YYYYMMDD_HHMMSS.dump
```

### Scheduled Backups
- **Frequency**: Daily at 02:00 UTC
- **Retention**: 30 days
- **Storage**: Cloud object storage (S3/GCS/R2)

### DNS Failover
1. Log into Cloudflare dashboard
2. Switch A/CNAME record to backup server IP
3. Reduce TTL to 60s during incident
4. Restore original TTL after resolution

---

## 6. Key Monitoring Metrics

| Metric | Alert Threshold | Description |
|--------|----------------|-------------|
| `axum_http_requests_total` (5xx) | > 10/min | Server error rate |
| `axum_http_request_duration_seconds` (p99) | > 2s | API latency |
| PostgreSQL active connections | > 80% of pool | Connection pool exhaustion |
| Redis memory usage | > 80% of maxmemory | Memory pressure |
| Disk usage | > 85% | Storage capacity |
| CPU usage | > 90% sustained 5min | Compute capacity |

### Grafana Dashboard URLs
- API metrics: `<grafana-host>/d/xamina-api`
- Database: `<grafana-host>/d/xamina-pg`
- Redis: `<grafana-host>/d/xamina-redis`

---

## 7. Common Issues & Solutions

### Connection Pool Exhaustion
**Symptom**: Intermittent 500 errors, slow responses  
**Fix**: Increase pool size in `DATABASE_URL` or reduce `pool_max_connections`
```
DATABASE_URL="postgres://...?max_connections=50"
```

### JWT Secret Rotation
1. Set new `JWT_SECRET` environment variable
2. Restart API server — all existing tokens are invalidated
3. Users will need to re-login

### Tenant Slug Conflicts (Registration)
**Symptom**: 409 CONFLICT on `/public/register`  
**Fix**: Either use a different tenant name, or manually update the slug in the DB:
```sql
UPDATE tenants SET slug = 'new-unique-slug' WHERE slug = 'conflicting-slug';
```

### High Memory Usage
1. Check for large uploads: `du -sh $XAMINA_UPLOADS_DIR`
2. Flush Redis if needed: `redis-cli FLUSHDB`
3. Check for connection leaks: `SELECT count(*) FROM pg_stat_activity`

---

## 8. Cloudflare DNS/CDN Setup (GO LIVE)

### DNS Records
| Type  | Name            | Content           | Proxy |
|-------|-----------------|-------------------|-------|
| A     | `xamina.id`     | `<server-ip>`     | Yes   |
| CNAME | `api.xamina.id` | `<server-host>`   | Yes   |
| CNAME | `www`           | `xamina.id`       | Yes   |

### Page Rules
- `api.xamina.id/*` → Cache Level: Bypass, SSL: Full (Strict)
- `xamina.id/uploads/*` → Cache Level: Standard, Edge TTL: 1 month
- `xamina.id/*` → Always Use HTTPS

### SSL
- Mode: Full (Strict)
- Edge certificate: Cloudflare Universal
- Origin certificate: Generate from Cloudflare → install on server

---

## 9. GO LIVE Checklist

- [ ] DNS propagation verified (`dig xamina.id`)
- [ ] SSL certificate active (no mixed content warnings)
- [ ] Health check returns OK
- [ ] Login with seed admin credentials works
- [ ] Self-serve registration creates tenant
- [ ] Exam session timer auto-submits at zero
- [ ] Frontend analytics firing (check GA real-time)
- [ ] Error monitoring active (Sentry/logging)
- [ ] Database backup job scheduled
- [ ] Team notified of go-live status
