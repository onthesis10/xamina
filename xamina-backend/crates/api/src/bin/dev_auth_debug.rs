use anyhow::{Context, Result};
use dotenvy::dotenv;
use sqlx::{postgres::PgPoolOptions, Row};

fn extract_otp(body: &str) -> Option<String> {
    let otp_section = body
        .split("Kode OTP login Anda adalah:")
        .nth(1)
        .unwrap_or(body);
    let digits: Vec<char> = otp_section.chars().collect();
    for window in digits.windows(6) {
        if window.iter().all(|ch| ch.is_ascii_digit()) {
            return Some(window.iter().collect());
        }
    }
    None
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();

    let database_url =
        std::env::var("DATABASE_URL").context("DATABASE_URL is missing from environment")?;
    let email = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "admin@xamina.local".to_string())
        .trim()
        .to_ascii_lowercase();

    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(&database_url)
        .await
        .context("failed to connect to postgres")?;

    println!("== Auth Challenge ==");
    let challenge_rows = sqlx::query(
        "SELECT email, challenge_token, expires_at, consumed_at, created_at
         FROM auth_login_challenges
         WHERE email = $1
         ORDER BY created_at DESC
         LIMIT 3",
    )
    .bind(&email)
    .fetch_all(&pool)
    .await
    .context("failed to query auth_login_challenges")?;

    if challenge_rows.is_empty() {
        println!("Tidak ada challenge login untuk {email}");
    } else {
        for row in challenge_rows {
            let challenge_token: String = row.try_get("challenge_token")?;
            let expires_at: chrono::DateTime<chrono::Utc> = row.try_get("expires_at")?;
            let consumed_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("consumed_at")?;
            let created_at: chrono::DateTime<chrono::Utc> = row.try_get("created_at")?;
            println!(
                "- challenge={} created_at={} expires_at={} consumed_at={}",
                challenge_token,
                created_at,
                expires_at,
                consumed_at
                    .map(|value| value.to_string())
                    .unwrap_or_else(|| "-".to_string())
            );
        }
    }

    println!();
    println!("== Email Jobs ==");
    let job_rows = sqlx::query(
        "SELECT to_email, subject, body, status, attempts, last_error, sent_at, created_at
         FROM email_jobs
         WHERE LOWER(to_email) = $1
           AND subject = 'Kode verifikasi login Xamina'
         ORDER BY created_at DESC
         LIMIT 5",
    )
    .bind(&email)
    .fetch_all(&pool)
    .await
    .context("failed to query email_jobs")?;

    if job_rows.is_empty() {
        println!("Tidak ada email job untuk {email}");
        return Ok(());
    }

    for (index, row) in job_rows.iter().enumerate() {
        let subject: String = row.try_get("subject")?;
        let body: String = row.try_get("body")?;
        let status: String = row.try_get("status")?;
        let attempts: i32 = row.try_get("attempts")?;
        let last_error: Option<String> = row.try_get("last_error")?;
        let sent_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("sent_at")?;
        let created_at: chrono::DateTime<chrono::Utc> = row.try_get("created_at")?;
        let otp = extract_otp(&body);

        println!(
            "- [{index}] status={status} attempts={attempts} created_at={created_at} sent_at={}",
            sent_at
                .map(|value| value.to_string())
                .unwrap_or_else(|| "-".to_string())
        );
        println!("  subject={subject}");
        if let Some(code) = otp {
            println!("  otp={code}");
        }
        if let Some(error) = last_error {
            println!("  last_error={error}");
        }
    }

    Ok(())
}
