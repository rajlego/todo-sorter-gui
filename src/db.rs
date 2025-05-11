use sqlx::{postgres::PgPoolOptions, PgPool, Error as SqlxError, postgres::PgRow, Row};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use std::sync::Arc;

// Task model - simplified version for better compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub content: String,
    pub completed: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

// Comparison model - simplified version for better compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comparison {
    pub id: String,
    pub task_a_id: String,
    pub task_b_id: String,
    pub winner_id: String,
    pub timestamp: DateTime<Utc>,
}

// Response with just task content for backward compatibility
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskContent {
    pub content: String,
    pub completed: bool,
}

// Database connection pool
pub struct Database {
    pool: Option<PgPool>,
    memory_mode: bool,
}

impl Database {
    // Initialize database connection
    pub async fn connect() -> Result<Arc<Self>, SqlxError> {
        // Load from environment variables (.env file in development)
        dotenv::dotenv().ok();
        
        // Check if DATABASE_URL is set
        match std::env::var("DATABASE_URL") {
            Ok(database_url) => {
                // Connect to the database
                let pool = PgPoolOptions::new()
                    .max_connections(5)
                    .connect(&database_url).await?;
                    
                // Create tables if they don't exist
                Self::initialize_tables(&pool).await?;
                
                tracing::info!("Connected to PostgreSQL database");
                Ok(Arc::new(Self { pool: Some(pool), memory_mode: false }))
            },
            Err(_) => {
                // If DATABASE_URL is not set, operate in memory-only mode
                tracing::warn!("DATABASE_URL not set! Running in memory-only mode. Data will not be persisted!");
                Ok(Arc::new(Self { pool: None, memory_mode: true }))
            }
        }
    }
    
    // Create database tables if they don't exist
    async fn initialize_tables(pool: &PgPool) -> Result<(), SqlxError> {
        // Create tasks table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS tasks (
                id UUID PRIMARY KEY,
                content TEXT NOT NULL,
                completed BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        "#).execute(pool).await?;
        
        // Create comparisons table
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS comparisons (
                id UUID PRIMARY KEY,
                task_a_id UUID NOT NULL REFERENCES tasks(id),
                task_b_id UUID NOT NULL REFERENCES tasks(id),
                winner_id UUID NOT NULL REFERENCES tasks(id),
                timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        "#).execute(pool).await?;
        
        Ok(())
    }
    
    // Task operations
    pub async fn get_tasks(&self) -> Result<Vec<Task>, SqlxError> {
        if self.memory_mode {
            // Return empty list in memory mode
            return Ok(Vec::new());
        }
        
        let pool = self.pool.as_ref().unwrap();
        let rows = sqlx::query(
            "SELECT id::text, content, completed, created_at, updated_at FROM tasks ORDER BY created_at DESC"
        )
        .fetch_all(pool)
        .await?;
        
        Ok(rows.into_iter().map(|row: PgRow| Task {
            id: row.get("id"),
            content: row.get("content"),
            completed: row.get("completed"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }).collect())
    }
    
    pub async fn get_task_by_content(&self, content: &str) -> Result<Option<Task>, SqlxError> {
        if self.memory_mode {
            // Return None in memory mode
            return Ok(None);
        }
        
        let pool = self.pool.as_ref().unwrap();
        let row = sqlx::query(
            "SELECT id::text, content, completed, created_at, updated_at FROM tasks WHERE content = $1"
        )
        .bind(content)
        .fetch_optional(pool)
        .await?;
        
        Ok(row.map(|row: PgRow| Task {
            id: row.get("id"),
            content: row.get("content"),
            completed: row.get("completed"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        }))
    }

    pub async fn create_task(&self, content: String) -> Result<Task, SqlxError> {
        // In memory mode, create a dummy task
        if self.memory_mode {
            let id = Uuid::new_v4();
            let now = Utc::now();
            return Ok(Task {
                id: id.to_string(),
                content,
                completed: false,
                created_at: now,
                updated_at: now,
            });
        }
        
        // Check if task with this content already exists
        if let Some(task) = self.get_task_by_content(&content).await? {
            return Ok(task);
        }
        
        let pool = self.pool.as_ref().unwrap();
        let id = Uuid::new_v4();
        let now = Utc::now();
        
        let row = sqlx::query(
            "INSERT INTO tasks (id, content, completed, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5) 
             RETURNING id::text, content, completed, created_at, updated_at"
        )
        .bind(id)
        .bind(&content)
        .bind(false)
        .bind(now)
        .bind(now)
        .fetch_one(pool)
        .await?;
        
        Ok(Task {
            id: row.get("id"),
            content: row.get("content"),
            completed: row.get("completed"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }
    
    pub async fn delete_task(&self, content: &str) -> Result<bool, SqlxError> {
        // In memory mode, pretend to succeed
        if self.memory_mode {
            return Ok(true);
        }
        
        let pool = self.pool.as_ref().unwrap();
        
        // Get the task first to find its ID
        let task = match self.get_task_by_content(content).await? {
            Some(t) => t,
            None => return Ok(false),
        };
        
        let uuid_id = Uuid::parse_str(&task.id).unwrap();
        
        // Delete related comparisons first (to satisfy foreign key constraints)
        sqlx::query(
            "DELETE FROM comparisons 
             WHERE task_a_id = $1 OR task_b_id = $1 OR winner_id = $1"
        )
        .bind(uuid_id)
        .execute(pool)
        .await?;
        
        // Now delete the task
        let result = sqlx::query(
            "DELETE FROM tasks WHERE id = $1"
        )
        .bind(uuid_id)
        .execute(pool)
        .await?;
            
        Ok(result.rows_affected() > 0)
    }
    
    // Comparison operations
    pub async fn get_comparisons(&self) -> Result<Vec<Comparison>, SqlxError> {
        // In memory mode, return empty list
        if self.memory_mode {
            return Ok(Vec::new());
        }
        
        let pool = self.pool.as_ref().unwrap();
        let rows = sqlx::query(
            "SELECT id::text, task_a_id::text, task_b_id::text, winner_id::text, timestamp FROM comparisons ORDER BY timestamp DESC"
        )
        .fetch_all(pool)
        .await?;
        
        Ok(rows.into_iter().map(|row: PgRow| Comparison {
            id: row.get("id"),
            task_a_id: row.get("task_a_id"),
            task_b_id: row.get("task_b_id"),
            winner_id: row.get("winner_id"),
            timestamp: row.get("timestamp"),
        }).collect())
    }
    
    pub async fn add_comparison(
        &self, 
        task_a_content: &str, 
        task_b_content: &str, 
        winner_content: &str
    ) -> Result<Comparison, SqlxError> {
        // In memory mode, create dummy comparison
        if self.memory_mode {
            let id = Uuid::new_v4();
            let task_a_id = Uuid::new_v4();
            let task_b_id = Uuid::new_v4();
            let winner_id = if winner_content == task_a_content {
                task_a_id
            } else {
                task_b_id
            };
            
            return Ok(Comparison {
                id: id.to_string(),
                task_a_id: task_a_id.to_string(),
                task_b_id: task_b_id.to_string(),
                winner_id: winner_id.to_string(),
                timestamp: Utc::now(),
            });
        }
        
        let pool = self.pool.as_ref().unwrap();
        
        // Get or create tasks first
        let task_a = self.create_task(task_a_content.to_string()).await?;
        let task_b = self.create_task(task_b_content.to_string()).await?;
        
        let winner_id = if winner_content == task_a_content {
            Uuid::parse_str(&task_a.id).unwrap()
        } else if winner_content == task_b_content {
            Uuid::parse_str(&task_b.id).unwrap()
        } else {
            return Err(SqlxError::Protocol("Winner must be one of the compared tasks".into()));
        };
        
        let task_a_id = Uuid::parse_str(&task_a.id).unwrap();
        let task_b_id = Uuid::parse_str(&task_b.id).unwrap();
        
        let id = Uuid::new_v4();
        
        let row = sqlx::query(
            "INSERT INTO comparisons (id, task_a_id, task_b_id, winner_id, timestamp) 
             VALUES ($1, $2, $3, $4, NOW()) 
             RETURNING id::text, task_a_id::text, task_b_id::text, winner_id::text, timestamp"
        )
        .bind(id)
        .bind(task_a_id)
        .bind(task_b_id)
        .bind(winner_id)
        .fetch_one(pool)
        .await?;
        
        Ok(Comparison {
            id: row.get("id"),
            task_a_id: row.get("task_a_id"),
            task_b_id: row.get("task_b_id"),
            winner_id: row.get("winner_id"),
            timestamp: row.get("timestamp"),
        })
    }
    
    pub async fn get_task_content_by_id(&self, id: &str) -> Result<Option<String>, SqlxError> {
        // In memory mode, return dummy content
        if self.memory_mode {
            return Ok(Some(format!("Task {}", id)));
        }
        
        let pool = self.pool.as_ref().unwrap();
        let uuid_id = Uuid::parse_str(id).unwrap();
        
        let row = sqlx::query("SELECT content FROM tasks WHERE id = $1")
            .bind(uuid_id)
            .fetch_optional(pool)
            .await?;
            
        Ok(row.map(|row: PgRow| row.get("content")))
    }
}

pub async fn get_task_contents_from_comparison(
    db: &Database,
    comparison: &Comparison
) -> Result<(String, String, String), SqlxError> {
    let task_a_content = db.get_task_content_by_id(&comparison.task_a_id).await?
        .ok_or_else(|| SqlxError::RowNotFound)?;
        
    let task_b_content = db.get_task_content_by_id(&comparison.task_b_id).await?
        .ok_or_else(|| SqlxError::RowNotFound)?;
        
    let winner_content = if comparison.winner_id == comparison.task_a_id {
        task_a_content.clone()
    } else {
        task_b_content.clone()
    };
    
    Ok((task_a_content, task_b_content, winner_content))
} 