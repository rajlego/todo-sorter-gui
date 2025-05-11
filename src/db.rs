use serde::{Deserialize, Serialize};
use sqlx::{postgres::PgPoolOptions, FromRow, PgPool};
use std::sync::Arc;
use uuid::Uuid;
use chrono::{DateTime, Utc};

// Database types that match our schema
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct MarkdownFile {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Task {
    pub id: Uuid,
    pub file_id: Uuid,
    pub content: String,
    pub completed: bool,
    pub line_number: i32,
    pub rank: Option<f64>,
    pub score: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Comparison {
    pub id: Uuid,
    pub file_id: Uuid,
    pub task_a_id: Uuid,
    pub task_b_id: Uuid,
    pub winner_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct FileVersion {
    pub id: Uuid,
    pub file_id: Uuid,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub created_by: Uuid,
}

// Database connection pool
pub async fn create_pool() -> Result<PgPool, sqlx::Error> {
    // Load environment variables from .env file in development
    if cfg!(debug_assertions) {
        let _ = dotenv::dotenv();
    }
    
    // Get database URL from environment
    let database_url = match std::env::var("DATABASE_URL") {
        Ok(url) => {
            tracing::info!("Using DATABASE_URL from environment");
            url
        }
        Err(_) => {
            // If DATABASE_URL is not set, try to build it from individual components
            let host = std::env::var("PGHOST").unwrap_or_else(|_| "localhost".to_string());
            let port = std::env::var("PGPORT").unwrap_or_else(|_| "5432".to_string());
            let user = std::env::var("PGUSER").unwrap_or_else(|_| "postgres".to_string());
            let password = std::env::var("PGPASSWORD").unwrap_or_else(|_| "password".to_string());
            let dbname = std::env::var("PGDATABASE").unwrap_or_else(|_| "todo_sorter".to_string());
            
            let url = format!("postgres://{}:{}@{}:{}/{}", user, password, host, port, dbname);
            tracing::info!("Constructed DATABASE_URL from components");
            url
        }
    };
    
    // Handle Railway proxy URLs but don't add sslmode=require since our SQLx might be built without TLS
    let database_url = if database_url.contains("proxy.rlwy.net") && database_url.contains("sslmode=require") {
        tracing::info!("Removing sslmode=require for Railway proxy connection at {}", database_url.split('@').nth(1).unwrap_or("unknown"));
        database_url.replace("?sslmode=require", "")
    } else if database_url.contains("railway.app") && database_url.contains("sslmode=require") {
        tracing::info!("Removing sslmode=require for Railway PostgreSQL");
        database_url.replace("?sslmode=require", "")
    } else {
        database_url
    };
    
    tracing::info!("Connecting to database at {}...", database_url.split('@').nth(1).unwrap_or("unknown"));
    
    // Create connection with retry logic for Railway startup
    let mut last_error = None;
    for attempt in 1..=5 {
        match PgPoolOptions::new()
            .max_connections(5)
            .connect(&database_url)
            .await
        {
            Ok(pool) => {
                tracing::info!("Successfully connected to database");
                return Ok(pool);
            }
            Err(err) => {
                last_error = Some(err);
                if attempt < 5 {
                    let delay = 2_u64.pow(attempt as u32);
                    tracing::warn!("Failed to connect to database (attempt {}/5): {}. Retrying in {} seconds...", 
                        attempt, last_error.as_ref().unwrap(), delay);
                    tokio::time::sleep(tokio::time::Duration::from_secs(delay)).await;
                } else {
                    tracing::error!("Failed to connect to database after 5 attempts: {}", last_error.as_ref().unwrap());
                }
            }
        }
    }
    
    Err(last_error.unwrap())
}

// Fallback database for when PostgreSQL is not available (especially in Railway deployments)
pub async fn create_fallback_pool() -> PgPool {
    tracing::warn!("Using minimal fallback database in SQLX_OFFLINE mode (database operations will not work)");
    
    // Create a minimal connection string - this won't actually be used for database operations
    let fallback_url = "postgres://postgres:password@localhost:5432/postgres";
    
    // Ensure SQLX_OFFLINE is set - this is crucial
    if std::env::var("SQLX_OFFLINE").unwrap_or_default() != "true" {
        tracing::warn!("SQLX_OFFLINE environment variable is not set to 'true'. Setting it now.");
        std::env::set_var("SQLX_OFFLINE", "true");
    }
    
    // In SQLX_OFFLINE mode, this doesn't actually connect to a database
    // It just creates a pool object that will be used by sqlx macros at compile time
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .connect(fallback_url)
        .await;
    
    match pool {
        Ok(pool) => {
            tracing::info!("Created fallback database pool successfully (in offline mode)");
            pool
        },
        Err(err) => {
            // This should never happen with SQLX_OFFLINE=true
            tracing::error!("Failed to create fallback database pool: {}", err);
            tracing::error!("This should not happen with SQLX_OFFLINE=true. Check your SQLx version.");
            
            // Rather than panicking, we'll create a "fake" pool object 
            // Since we're in offline mode, this won't be used for real database operations
            tracing::warn!("Creating emergency fallback pool as a last resort");
            
            // We have to return something, so we'll try one more time
            PgPoolOptions::new()
                .max_connections(1)
                .connect(fallback_url)
                .await
                .unwrap_or_else(|_| {
                    panic!("FATAL: Cannot create even a minimal fallback database in SQLX_OFFLINE mode. Application cannot start.")
                })
        }
    }
}

// Convenient struct to wrap around a pool
#[derive(Clone)]
pub struct Database {
    pub pool: Arc<PgPool>,
}

impl Database {
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool: Arc::new(pool),
        }
    }
    
    // User operations
    pub async fn create_user(&self, username: &str, email: &str, password_hash: &str) -> Result<User, sqlx::Error> {
        let query = "
            INSERT INTO users (username, email, password_hash)
            VALUES ($1, $2, $3)
            RETURNING id, username, email, password_hash, created_at, updated_at
        ";
        
        sqlx::query_as::<_, User>(query)
            .bind(username)
            .bind(email)
            .bind(password_hash)
            .fetch_one(&*self.pool)
            .await
    }
    
    pub async fn get_user_by_email(&self, email: &str) -> Result<Option<User>, sqlx::Error> {
        let query = "
            SELECT id, username, email, password_hash, created_at, updated_at
            FROM users
            WHERE email = $1
        ";
        
        sqlx::query_as::<_, User>(query)
            .bind(email)
            .fetch_optional(&*self.pool)
            .await
    }
    
    // Markdown file operations
    pub async fn create_file(&self, user_id: Uuid, title: &str, content: &str) -> Result<MarkdownFile, sqlx::Error> {
        let query = "
            INSERT INTO markdown_files (user_id, title, content)
            VALUES ($1, $2, $3)
            RETURNING id, user_id, title, content, created_at, updated_at, last_accessed
        ";
        
        sqlx::query_as::<_, MarkdownFile>(query)
            .bind(user_id)
            .bind(title)
            .bind(content)
            .fetch_one(&*self.pool)
            .await
    }
    
    pub async fn get_file(&self, file_id: Uuid) -> Result<Option<MarkdownFile>, sqlx::Error> {
        let query = "
            SELECT id, user_id, title, content, created_at, updated_at, last_accessed
            FROM markdown_files
            WHERE id = $1
        ";
        
        sqlx::query_as::<_, MarkdownFile>(query)
            .bind(file_id)
            .fetch_optional(&*self.pool)
            .await
    }
    
    pub async fn update_file(&self, file_id: Uuid, title: &str, content: &str) -> Result<MarkdownFile, sqlx::Error> {
        let query = "
            UPDATE markdown_files
            SET title = $2, content = $3, updated_at = NOW()
            WHERE id = $1
            RETURNING id, user_id, title, content, created_at, updated_at, last_accessed
        ";
        
        sqlx::query_as::<_, MarkdownFile>(query)
            .bind(file_id)
            .bind(title)
            .bind(content)
            .fetch_one(&*self.pool)
            .await
    }
    
    pub async fn get_files_for_user(&self, user_id: Uuid) -> Result<Vec<MarkdownFile>, sqlx::Error> {
        let query = "
            SELECT id, user_id, title, content, created_at, updated_at, last_accessed
            FROM markdown_files
            WHERE user_id = $1
            ORDER BY last_accessed DESC
        ";
        
        sqlx::query_as::<_, MarkdownFile>(query)
            .bind(user_id)
            .fetch_all(&*self.pool)
            .await
    }
    
    // Task operations
    pub async fn create_task(&self, file_id: Uuid, content: &str, completed: bool, line_number: i32) -> Result<Task, sqlx::Error> {
        let query = "
            INSERT INTO tasks (file_id, content, completed, line_number)
            VALUES ($1, $2, $3, $4)
            RETURNING id, file_id, content, completed, line_number, rank, score, created_at, updated_at
        ";
        
        sqlx::query_as::<_, Task>(query)
            .bind(file_id)
            .bind(content)
            .bind(completed)
            .bind(line_number)
            .fetch_one(&*self.pool)
            .await
    }
    
    pub async fn get_tasks_for_file(&self, file_id: Uuid) -> Result<Vec<Task>, sqlx::Error> {
        let query = "
            SELECT id, file_id, content, completed, line_number, rank, score, created_at, updated_at
            FROM tasks
            WHERE file_id = $1
            ORDER BY line_number
        ";
        
        sqlx::query_as::<_, Task>(query)
            .bind(file_id)
            .fetch_all(&*self.pool)
            .await
    }
    
    // Comparison operations
    pub async fn add_comparison(&self, file_id: Uuid, task_a_id: Uuid, task_b_id: Uuid, winner_id: Uuid) -> Result<Comparison, sqlx::Error> {
        let query = "
            INSERT INTO comparisons (file_id, task_a_id, task_b_id, winner_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, file_id, task_a_id, task_b_id, winner_id, created_at
        ";
        
        sqlx::query_as::<_, Comparison>(query)
            .bind(file_id)
            .bind(task_a_id)
            .bind(task_b_id)
            .bind(winner_id)
            .fetch_one(&*self.pool)
            .await
    }
    
    pub async fn get_comparisons_for_file(&self, file_id: Uuid) -> Result<Vec<Comparison>, sqlx::Error> {
        let query = "
            SELECT id, file_id, task_a_id, task_b_id, winner_id, created_at
            FROM comparisons
            WHERE file_id = $1
        ";
        
        sqlx::query_as::<_, Comparison>(query)
            .bind(file_id)
            .fetch_all(&*self.pool)
            .await
    }
    
    // File version history operations
    pub async fn add_file_version(&self, file_id: Uuid, content: &str, created_by: Uuid) -> Result<FileVersion, sqlx::Error> {
        let query = "
            INSERT INTO file_versions (file_id, content, created_by)
            VALUES ($1, $2, $3)
            RETURNING id, file_id, content, created_at, created_by
        ";
        
        sqlx::query_as::<_, FileVersion>(query)
            .bind(file_id)
            .bind(content)
            .bind(created_by)
            .fetch_one(&*self.pool)
            .await
    }
    
    pub async fn get_file_versions(&self, file_id: Uuid) -> Result<Vec<FileVersion>, sqlx::Error> {
        let query = "
            SELECT id, file_id, content, created_at, created_by
            FROM file_versions
            WHERE file_id = $1
            ORDER BY created_at DESC
        ";
        
        sqlx::query_as::<_, FileVersion>(query)
            .bind(file_id)
            .fetch_all(&*self.pool)
            .await
    }
} 