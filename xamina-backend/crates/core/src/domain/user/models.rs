use super::dto::{PageMeta, UserDto};

#[derive(Debug, Clone)]
pub struct ListUsersResult {
    pub rows: Vec<UserDto>,
    pub meta: PageMeta,
}
