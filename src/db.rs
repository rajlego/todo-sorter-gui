use sqlx::{postgres::PgPoolOptions, PgPool, Error as SqlxError, postgres::PgRow, Row};
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};
use uuid::Uuid;
use std::sync::Arc;
use std::collections::HashMap;

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
    pub pool: Option<PgPool>,
    pub memory_mode: bool,
}

impl Database {
    // Create a memory-only database instance
    pub fn memory_only() -> Arc<Self> {
        Arc::new(Self {
            pool: None,
            memory_mode: true,
        })
    }

    // Initialize database connection
    pub async fn connect() -> Result<Arc<Self>, SqlxError> {
        // Load from environment variables (.env file in development)
        dotenv::dotenv().ok();
        
        // Try first using explicit PostgreSQL variables which are optimal for Railway
        let try_connect_with_pg_vars = async {
            let have_pg_vars = std::env::var("PGHOST").is_ok() && 
                              std::env::var("PGPORT").is_ok() && 
                              std::env::var("PGUSER").is_ok() && 
                              std::env::var("PGPASSWORD").is_ok() && 
                              std::env::var("PGDATABASE").is_ok();
                
            if have_pg_vars {
                let pghost = std::env::var("PGHOST").unwrap();
                let pgport = std::env::var("PGPORT").unwrap();
                let pguser = std::env::var("PGUSER").unwrap();
                let pgpassword = std::env::var("PGPASSWORD").unwrap();
                let pgdatabase = std::env::var("PGDATABASE").unwrap();
                
                let is_railway_internal = pghost.contains(".railway.internal");
                if is_railway_internal {
                    tracing::info!("Using Railway internal network with explicit PG* variables");
                    tracing::info!("PGHOST={}, PGPORT={}, PGDATABASE={}", pghost, pgport, pgdatabase);
                    
                    // Construct an optimized connection string for Railway internal network
                    let connection_string = format!(
                        "postgres://{}:{}@{}:{}/{}?application_name=todo-sorter&connect_timeout=10",
                        pguser, pgpassword, pghost, pgport, pgdatabase
                    );
                    
                    // Attempt to connect using explicit PG* variables
                    match Self::connect_with_retry(&connection_string, 5).await {
                        Ok(pool) => {
                            tracing::info!("Successfully connected with Railway internal network PG* variables");
                            return Some(Arc::new(Self { pool: Some(pool), memory_mode: false }));
                        },
                        Err(e) => {
                            tracing::warn!("Failed to connect with explicit PG* variables: {}", e);
                            tracing::warn!("Will fallback to DATABASE_URL if available");
                            // Fallback to DATABASE_URL
                        }
                    }
                }
            }
            None
        };
        
        // Try connecting with explicit PG variables first
        if let Some(db) = try_connect_with_pg_vars.await {
            return Ok(db);
        }
        
        // Fallback to DATABASE_URL
        match std::env::var("DATABASE_URL") {
            Ok(database_url) => {
                // Only log the host part, not credentials
                let host_part = database_url.split('@').nth(1).unwrap_or("(hidden)");
                tracing::info!("Attempting to connect to database at: {}", host_part);
                
                if let Some(db_url_parts) = database_url.split('@').nth(1) {
                    if db_url_parts.contains("railway.internal") {
                        tracing::info!("Detected Railway internal network address - using optimized connection settings");
                    }
                }
                
                // Log information about the current environment
                if let Ok(env) = std::env::var("RAILWAY_ENVIRONMENT") {
                    tracing::info!("Running in Railway environment: {}", env);
                }
                
                // Connect to the database with retries
                match Self::connect_with_retry(&database_url, 5).await {
                    Ok(pool) => {
                        tracing::info!("Successfully connected to PostgreSQL database");
                        return Ok(Arc::new(Self { pool: Some(pool), memory_mode: false }));
                    },
                    Err(err) => {
                        tracing::error!("All database connection attempts failed! Last error: {}", err);
                        tracing::warn!("Running in memory-only mode. Data will not be persisted!");
                        
                        // Log additional helpful info for connection failures
                        if let Ok(pghost) = std::env::var("PGHOST") {
                            tracing::info!("PGHOST environment variable is set to: {}", pghost);
                        }
                        
                        if let Ok(port) = std::env::var("PGPORT") {
                            tracing::info!("PGPORT environment variable is set to: {}", port);
                        }
                        
                        Ok(Arc::new(Self { pool: None, memory_mode: true }))
                    }
                }
            },
            Err(err) => {
                // If DATABASE_URL is not set, operate in memory-only mode
                tracing::warn!("DATABASE_URL not set or invalid ({}). Running in memory-only mode. Data will not be persisted!", err);
                Ok(Arc::new(Self { pool: None, memory_mode: true }))
            }
        }
    }
    
    // Helper method for connection with retry logic
    async fn connect_with_retry(database_url: &str, max_retries: u32) -> Result<PgPool, SqlxError> {
        let mut last_error = None;
        
        for attempt in 1..=max_retries {
            tracing::info!("Database connection attempt {} of {}", attempt, max_retries);
            
            // Connect to the database with increased timeout
            let pool_result = PgPoolOptions::new()
                .max_connections(5)
                .acquire_timeout(std::time::Duration::from_secs(60)) // Increased timeout
                .connect(database_url)
                .await;
            
            match pool_result {
                Ok(pool) => {
                    // Test the connection with a simple query
                    match sqlx::query("SELECT 1").execute(&pool).await {
                        Ok(_) => {
                            // Create tables if they don't exist
                            match Self::initialize_tables(&pool).await {
                                Ok(_) => {
                                    tracing::info!("Successfully connected to PostgreSQL database and created tables");
                                    return Ok(pool);
                                },
                                Err(err) => {
                                    tracing::error!("Failed to initialize database tables: {}", err);
                                    last_error = Some(err);
                                    // Continue to next attempt
                                }
                            }
                        },
                        Err(err) => {
                            tracing::error!("Database connection test failed: {}", err);
                            last_error = Some(err);
                            // Continue to next attempt
                        }
                    }
                },
                Err(err) => {
                    tracing::error!("Database connection attempt {} failed: {}", attempt, err);
                    last_error = Some(err);
                    // Continue to next attempt
                }
            }
            
            // Wait before retrying with exponential backoff
            if attempt < max_retries {
                let delay = std::time::Duration::from_secs(2 * attempt as u64);
                tracing::info!("Waiting {:?} before next connection attempt", delay);
                tokio::time::sleep(delay).await;
            }
        }
        
        // All attempts failed
        Err(last_error.unwrap_or_else(|| SqlxError::PoolClosed))
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

    // Helper method to diagnose connection timeouts
    pub async fn test_connection(&self) -> Result<HashMap<String, String>, SqlxError> {
        let mut results = HashMap::new();
        
        if self.memory_mode {
            results.insert("mode".to_string(), "memory_only".to_string());
            results.insert("status".to_string(), "no_database_connection".to_string());
            return Ok(results);
        }
        
        match &self.pool {
            Some(pool) => {
                // Get the current time for timing measurements
                let start = std::time::Instant::now();
                
                // Try a simple query first
                match sqlx::query("SELECT 1").execute(pool).await {
                    Ok(_) => {
                        let elapsed = start.elapsed();
                        results.insert("query_test".to_string(), "success".to_string());
                        results.insert("query_time_ms".to_string(), elapsed.as_millis().to_string());
                    },
                    Err(err) => {
                        results.insert("query_test".to_string(), "error".to_string());
                        results.insert("query_error".to_string(), err.to_string());
                        
                        // Check if it's a timeout error
                        if err.to_string().contains("timeout") {
                            results.insert("error_type".to_string(), "timeout".to_string());
                            
                            // Check DNS resolution if it's a timeout
                            if let Ok(pghost) = std::env::var("PGHOST") {
                                if pghost.contains(".railway.internal") {
                                    // Check DNS resolution with getent
                                    match tokio::process::Command::new("getent")
                                        .args(&["hosts", &pghost])
                                        .output()
                                        .await {
                                        Ok(output) => {
                                            if output.status.success() {
                                                let stdout = String::from_utf8_lossy(&output.stdout);
                                                results.insert("dns_resolution".to_string(), format!("success: {}", stdout.trim()));
                                            } else {
                                                let stderr = String::from_utf8_lossy(&output.stderr);
                                                results.insert("dns_resolution".to_string(), format!("error: {}", stderr.trim()));
                                            }
                                        },
                                        Err(e) => {
                                            results.insert("dns_resolution".to_string(), format!("command_error: {}", e));
                                        }
                                    }
                                }
                            }
                            
                            // Get networking environment
                            if let Ok(env) = std::env::var("RAILWAY_ENVIRONMENT") {
                                results.insert("railway_environment".to_string(), env);
                            }
                            
                            if let Ok(project) = std::env::var("RAILWAY_PROJECT_ID") {
                                results.insert("railway_project_id".to_string(), project);
                            }
                        }
                    }
                }
                
                // Try a connection stats query
                match sqlx::query("SELECT count(*) FROM pg_stat_activity").fetch_one(pool).await {
                    Ok(row) => {
                        let connections: i64 = row.get(0);
                        results.insert("active_connections".to_string(), connections.to_string());
                    },
                    Err(err) => {
                        results.insert("connection_stats".to_string(), format!("error: {}", err));
                    }
                }
                
                Ok(results)
            },
            None => {
                results.insert("status".to_string(), "no_pool".to_string());
                Ok(results)
            }
        }
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