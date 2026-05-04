use sqlx::postgres::PgPoolOptions;
use std::env;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/xamina".to_string());
    let pool = PgPoolOptions::new().connect(&database_url).await?;

    let tables: Vec<(String,)> = sqlx::query_as("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
        .fetch_all(&pool)
        .await?;

    println!("Tables in database:");
    for t in tables {
        println!(" - {}", t.0);
    }

    let cols: Vec<(String, String)> = sqlx::query_as("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'student_profiles'")
        .fetch_all(&pool)
        .await?;
    
    println!("\nColumns in student_profiles:");
    for c in cols {
        println!(" - {} ({})", c.0, c.1);
    }

    Ok(())
}
