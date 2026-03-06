use argon2::{
    password_hash::{rand_core::OsRng, PasswordHasher, SaltString},
    Argon2,
};
use tracing::warn;
use uuid::Uuid;

use crate::error::CoreError;

use super::{
    dto::{
        CreateUserPayload, CsvImportError, CsvImportResult, ListUsersQuery, PageMeta,
        UpdateUserPayload, UserDto,
    },
    models::ListUsersResult,
    repository::UserRepository,
};

#[derive(Debug, Clone)]
pub struct UserService {
    repo: UserRepository,
}

impl UserService {
    pub fn new(repo: UserRepository) -> Self {
        Self { repo }
    }

    pub async fn list_users(
        &self,
        tenant_id: Uuid,
        query: ListUsersQuery,
    ) -> Result<ListUsersResult, CoreError> {
        let page = query.page.unwrap_or(1).max(1);
        let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
        let offset = (page - 1) * page_size;

        let total = self
            .repo
            .count_users(
                tenant_id,
                query.search.clone(),
                query.role.clone(),
                query.is_active,
                query.class_id,
            )
            .await?;
        let rows = self
            .repo
            .list_users(
                tenant_id,
                query.search,
                query.role,
                query.is_active,
                query.class_id,
                page_size,
                offset,
            )
            .await?;

        Ok(ListUsersResult {
            rows,
            meta: PageMeta {
                page,
                page_size,
                total,
            },
        })
    }

    pub async fn create_user(
        &self,
        tenant_id: Uuid,
        body: CreateUserPayload,
    ) -> Result<UserDto, CoreError> {
        Self::validate_role(&body.role)?;
        self.ensure_user_quota(tenant_id, 1).await?;
        let password = body
            .password
            .clone()
            .unwrap_or_else(|| "Password123!".to_string());
        let password_hash = Self::hash_password(&password)?;
        self.repo
            .create_user(tenant_id, &body, &password_hash)
            .await
    }

    pub async fn get_user(&self, tenant_id: Uuid, user_id: Uuid) -> Result<UserDto, CoreError> {
        self.repo
            .get_user(tenant_id, user_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "User not found"))
    }

    pub async fn update_user(
        &self,
        tenant_id: Uuid,
        user_id: Uuid,
        body: UpdateUserPayload,
    ) -> Result<UserDto, CoreError> {
        if let Some(role) = &body.role {
            Self::validate_role(role)?;
        }

        let existing = self
            .repo
            .get_user(tenant_id, user_id)
            .await?
            .ok_or_else(|| CoreError::not_found("NOT_FOUND", "User not found"))?;

        self.repo
            .update_user(tenant_id, user_id, &body, &existing)
            .await
    }

    pub async fn delete_user(&self, tenant_id: Uuid, user_id: Uuid) -> Result<(), CoreError> {
        self.repo.delete_user(tenant_id, user_id).await?;
        Ok(())
    }

    pub async fn import_users_csv(
        &self,
        tenant_id: Uuid,
        body: &str,
    ) -> Result<CsvImportResult, CoreError> {
        let (users_quota, current_users) = self.repo.get_user_quota_usage(tenant_id).await?;
        let mut projected_users = current_users;
        let mut inserted = 0usize;
        let mut errors = Vec::new();

        for (index, raw) in body.lines().enumerate() {
            let line = index + 1;
            let row = raw.trim();
            if row.is_empty() {
                continue;
            }
            if line == 1 && row.to_ascii_lowercase().contains("email") {
                continue;
            }

            let cols: Vec<&str> = row.split(',').map(|v| v.trim()).collect();
            if cols.len() < 3 {
                errors.push(CsvImportError {
                    line,
                    reason: "Expected columns: name,email,class_name[,password]".to_string(),
                });
                continue;
            }

            let name = cols[0].to_string();
            let email = cols[1].to_lowercase();
            let class_name = cols[2].to_string();
            let password = cols
                .get(3)
                .map_or_else(|| "Password123!".to_string(), |v| v.to_string());

            let class_id = match self
                .repo
                .find_class_id_by_name(tenant_id, &class_name)
                .await
            {
                Ok(Some(existing_id)) => existing_id,
                Ok(None) => match self.repo.create_class(tenant_id, &class_name).await {
                    Ok(new_id) => new_id,
                    Err(err) => {
                        errors.push(CsvImportError {
                            line,
                            reason: format!("Class insert failed: {}", err.message),
                        });
                        continue;
                    }
                },
                Err(err) => {
                    errors.push(CsvImportError {
                        line,
                        reason: format!("Class lookup failed: {}", err.message),
                    });
                    continue;
                }
            };

            let password_hash = match Self::hash_password(&password) {
                Ok(v) => v,
                Err(_) => {
                    errors.push(CsvImportError {
                        line,
                        reason: "Password hashing failed".to_string(),
                    });
                    continue;
                }
            };

            if projected_users >= i64::from(users_quota) {
                errors.push(CsvImportError {
                    line,
                    reason: format!("User quota exceeded ({users_quota})"),
                });
                continue;
            }

            match self
                .repo
                .insert_student_from_csv(tenant_id, &email, &password_hash, &name, class_id)
                .await
            {
                Ok(affected) if affected == 1 => {
                    inserted += 1;
                    projected_users += 1;
                }
                Ok(_) => errors.push(CsvImportError {
                    line,
                    reason: "Email already exists".to_string(),
                }),
                Err(err) => errors.push(CsvImportError {
                    line,
                    reason: format!("Insert failed: {}", err.message),
                }),
            }
        }

        if !errors.is_empty() {
            warn!(
                code = "CSV_IMPORT_PARTIAL",
                failed = errors.len(),
                inserted,
                "CSV import completed with row-level failures"
            );
        }

        Ok(CsvImportResult {
            inserted,
            failed: errors.len(),
            errors,
        })
    }

    async fn ensure_user_quota(&self, tenant_id: Uuid, additional: i64) -> Result<(), CoreError> {
        let (users_quota, current_users) = self.repo.get_user_quota_usage(tenant_id).await?;
        let target = current_users + additional.max(0);
        if target > i64::from(users_quota) {
            return Err(CoreError::bad_request(
                "TENANT_QUOTA_EXCEEDED",
                format!("User quota exceeded ({users_quota})"),
            ));
        }
        Ok(())
    }

    fn validate_role(role: &str) -> Result<(), CoreError> {
        match role {
            "admin" | "guru" | "siswa" => Ok(()),
            _ => Err(CoreError::bad_request(
                "INVALID_ROLE",
                "Role must be one of admin|guru|siswa",
            )),
        }
    }

    fn hash_password(password: &str) -> Result<String, CoreError> {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|p| p.to_string())
            .map_err(|_| CoreError::internal("HASH_FAILED", "Failed to hash password"))
    }
}

#[cfg(test)]
mod tests {
    use super::UserService;

    #[test]
    fn validate_role_should_accept_known_roles() {
        assert!(UserService::validate_role("admin").is_ok());
        assert!(UserService::validate_role("guru").is_ok());
        assert!(UserService::validate_role("siswa").is_ok());
    }

    #[test]
    fn validate_role_should_reject_unknown_roles() {
        let err = UserService::validate_role("super_admin").expect_err("must fail");
        assert_eq!(err.code, "INVALID_ROLE");
    }

    #[test]
    fn hash_password_should_generate_argon2_hash() {
        let hash = UserService::hash_password("Password123!").expect("hash");
        assert!(hash.starts_with("$argon2"));
        assert_ne!(hash, "Password123!");
    }
}
