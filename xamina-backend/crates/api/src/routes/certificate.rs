use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use uuid::Uuid;
use xamina_core::domain::certificate::dto::{
    CertificateDto, CertificateListMeta, ListCertificatesQuery,
};

use crate::{
    app::{ApiError, ApiResult, SharedState, SuccessResponse, SuccessWithMeta},
    middleware::auth::AuthUser,
};

pub fn routes() -> Router<SharedState> {
    Router::new()
        .route("/certificates/my", get(list_my_certificates))
        .route(
            "/submissions/:id/certificate",
            get(get_submission_certificate),
        )
        .route("/certificates/:id/download", get(download_certificate))
}

fn ensure_student(auth: &AuthUser) -> Result<(), ApiError> {
    if auth.0.role != "siswa" {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "FORBIDDEN",
            "Siswa role required",
        ));
    }
    Ok(())
}

async fn list_my_certificates(
    State(state): State<SharedState>,
    auth: AuthUser,
    Query(query): Query<ListCertificatesQuery>,
) -> ApiResult<SuccessWithMeta<Vec<CertificateDto>, CertificateListMeta>> {
    ensure_student(&auth)?;
    let result = state
        .services
        .certificate
        .list_my_certificates(auth.0.tenant_id, auth.0.sub, query)
        .await?;
    Ok(Json(SuccessWithMeta {
        success: true,
        data: result.rows,
        meta: result.meta,
    }))
}

async fn get_submission_certificate(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(submission_id): Path<Uuid>,
) -> ApiResult<SuccessResponse<CertificateDto>> {
    ensure_student(&auth)?;
    let cert = state
        .services
        .certificate
        .get_my_certificate_by_submission(auth.0.tenant_id, auth.0.sub, submission_id)
        .await?
        .ok_or_else(|| {
            ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Certificate not found")
        })?;
    Ok(Json(SuccessResponse {
        success: true,
        data: cert,
    }))
}

async fn download_certificate(
    State(state): State<SharedState>,
    auth: AuthUser,
    Path(certificate_id): Path<Uuid>,
) -> Result<impl IntoResponse, ApiError> {
    ensure_student(&auth)?;
    let cert = state
        .services
        .certificate
        .get_my_certificate_by_id(auth.0.tenant_id, auth.0.sub, certificate_id)
        .await?
        .ok_or_else(|| {
            ApiError::new(StatusCode::NOT_FOUND, "NOT_FOUND", "Certificate not found")
        })?;

    let mut headers = HeaderMap::new();
    headers.insert(
        header::LOCATION,
        cert.file_url.parse().map_err(|_| {
            ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "INTERNAL_ERROR",
                "Invalid certificate URL",
            )
        })?,
    );
    Ok((StatusCode::FOUND, headers))
}
