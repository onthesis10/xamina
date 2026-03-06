# Exam API Reference (Sprint 4)

Base URL: `http://localhost:8080/api/v1`  
Auth: `Authorization: Bearer <access_token>`  
Roles: `admin|guru` for exam management.

## Endpoints

### `GET /exams`
- Query:
  - `page` (optional, default `1`)
  - `page_size` (optional, default `20`, max `100`)
  - `status` (`draft|published`, optional)
  - `search` (optional)
- Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "tenant_id": "uuid",
      "created_by": "uuid",
      "title": "Exam title",
      "description": "optional",
      "duration_minutes": 90,
      "pass_score": 70,
      "status": "draft",
      "shuffle_questions": false,
      "shuffle_options": false,
      "start_at": "2026-03-01T09:00:00Z",
      "end_at": "2026-03-01T10:00:00Z"
    }
  ],
  "meta": { "page": 1, "page_size": 20, "total": 1 }
}
```

### `POST /exams`
- Body:
```json
{
  "title": "Ujian Harian",
  "description": "optional",
  "duration_minutes": 90,
  "pass_score": 70,
  "shuffle_questions": false,
  "shuffle_options": false,
  "start_at": "2026-03-01T09:00:00Z",
  "end_at": "2026-03-01T10:00:00Z"
}
```
- Validation rules:
  - `title` required.
  - `duration_minutes > 0`.
  - `pass_score` clamped `0..100`.
  - `start_at` and `end_at` must be provided as a pair.
  - `start_at < end_at`.

### `GET /exams/:id`
- Returns exam detail and attached questions order.

### `PATCH /exams/:id`
- Same body as create.
- Only allowed when exam status is `draft`.

### `DELETE /exams/:id`
- Only allowed when exam status is `draft`.

### `POST /exams/:id/questions`
- Body:
```json
{
  "question_ids": ["uuid-1", "uuid-2"]
}
```
- Rules:
  - `question_ids` not empty.
  - Question must belong to current tenant.
  - Exam must be `draft`.

### `PATCH /exams/:id/questions/reorder`
- Body:
```json
{
  "question_ids": ["uuid-2", "uuid-1"]
}
```
- Rules:
  - Must contain exact attached set (no missing, no extra, no duplicate).
  - Exam must be `draft`.

### `DELETE /exams/:id/questions/:question_id`
- Detach question from draft exam.
- Error `VALIDATION_ERROR` when question not attached.

### `GET /exams/:id/publish-precheck`
- Response:
```json
{
  "success": true,
  "data": {
    "exam_id": "uuid",
    "publishable": false,
    "status": "draft",
    "question_count": 0,
    "issues": [
      { "code": "NO_QUESTIONS", "message": "Exam must have at least one question" }
    ]
  }
}
```

### `POST /exams/:id/publish`
- Publishes exam when precheck passes.
- Error code:
  - `PUBLISH_FAILED` (with `details.precheck`) when blocked by issues.

### `POST /exams/:id/unpublish`
- Moves published exam back to draft.

## Known Error Codes
- `VALIDATION_ERROR`
- `ATTACH_FAILED`
- `PUBLISH_FAILED`
- `FORBIDDEN`
- `NOT_FOUND`
- `DB_ERROR`

## Regression Coverage
- `xamina-backend/crates/api/tests/exam_publish_integration.rs`
- `xamina-backend/scripts/run_sprint4_regression.ps1`
