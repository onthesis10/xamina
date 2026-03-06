use super::dto::{NotificationDto, NotificationListMeta};

#[derive(Debug, Clone)]
pub struct NotificationListResult {
    pub rows: Vec<NotificationDto>,
    pub meta: NotificationListMeta,
}
