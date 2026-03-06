# Staging Stability Checklist

## Deployment
- [ ] Build image API/frontend sukses
- [ ] Migration 0001..0008 sukses
- [ ] Service restart tanpa crash loop

## Functional Smoke
- [ ] Auth flow login/refresh/logout
- [ ] User/classes CRUD basic
- [ ] Question CRUD + upload image
- [ ] Exam publish workflow
- [ ] Submission flow end-to-end
- [ ] Dashboard/report/notification

## Performance Baseline
- [ ] p95 latency dashboard/report < 500ms
- [ ] 5xx rate < 1%
- [ ] Redis timer path stabil

## Sign-off
- [ ] QA sign-off
- [ ] Product sign-off
- [ ] Ready for pilot
