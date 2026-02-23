// JWT Extractor — reusable Axum extractor
#[derive(Debug, Clone, Deserialize)]
pub struct JwtClaims {
    pub user_id: Uuid,
    pub tenant_id: Uuid,
    pub role: Role,
    pub exp: usize,
}

#[async_trait]
impl<S> FromRequestParts<S> for JwtClaims
where S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts, _: &S,
    ) -> Result<Self, AppError> {
        let bearer = parts.headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;

        decode_jwt(bearer)
            .map_err(|_| AppError::Unauthorized)
    }
}

// Tenant middleware — set RLS context
pub async fn tenant_middleware(
    State(pool): State<PgPool>,
    Extension(claims): Extension<JwtClaims>,
    req: Request,
    next: Next,
) -> Response {
    // Set PostgreSQL RLS variable
    sqlx::query("SET app.tenant_id = $1")
        .bind(claims.tenant_id)
        .execute(&pool).await.ok();

    next.run(req).await
}
