use axum::{
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post, delete},
    Json, Router, Extension,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc};
use tower_http::cors::{Any, CorsLayer};
use crate::asap_cpu::ASAP;
use crate::db::{Database, TaskContent};

// Type for storing our application state
pub struct AppState {
    db: Arc<Database>,
}

// Task info using content as the primary identifier
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct TaskInfo {
    content: String,
    completed: bool,
}

// For backward compatibility in responses - using content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContentComparison {
    task_a_content: String,
    task_b_content: String,
    winner_content: String,
    timestamp: String,
}

// For backward compatibility in responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LegacyComparison {
    task_a_id: usize,
    task_b_id: usize,
    winner_id: usize,
    timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RankedTask {
    content: String,
    score: f64,
    rank: usize,
}

// Requests and responses
#[derive(Debug, Deserialize)]
pub struct AddComparisonRequest {
    task_a_content: String,
    task_b_content: String,
    winner_content: String,
    list_id: String,
}

// Request for deleting a task
#[derive(Debug, Deserialize)]
pub struct DeleteTaskRequest {
    content: String,
    list_id: String,
}

// Request for getting tasks with list_id
#[derive(Debug, Deserialize)]
pub struct ListRequest {
    list_id: String,
}

#[derive(Debug, Serialize)]
pub struct ComparisonsResponse {
    comparisons: Vec<LegacyComparison>,
}

#[derive(Debug, Serialize)]
pub struct RankingsResponse {
    rankings: Vec<RankedTask>,
}

// Database health check response type
#[derive(Debug, Serialize)]
pub struct HealthCheckResponse {
    status: String,
    db_connected: bool,
    memory_mode: bool,
    diagnostics: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct ContentComparisonsResponse {
    comparisons: Vec<ContentComparison>,
}

// Simple function to serve static files
async fn serve_static_file(uri: Uri) -> impl IntoResponse {
    let mut path = uri.path().trim_start_matches('/').to_string();
    
    // If path is empty, serve index.html
    if path.is_empty() {
        path = "index.html".to_string();
    }
    
    // Resolve path to the static directory
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "static".to_string());
    let file_path = format!("{}/{}", static_dir, path);
    
    // Try to read the file
    match tokio::fs::read(&file_path).await {
        Ok(contents) => {
            // Set the appropriate content type based on the file extension
            let content_type = match file_path.split('.').last() {
                Some("html") => "text/html",
                Some("css") => "text/css",
                Some("js") => "application/javascript",
                Some("json") => "application/json",
                Some("png") => "image/png",
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("svg") => "image/svg+xml",
                Some("ico") => "image/x-icon",
                _ => "application/octet-stream",
            };
            
            // Create a response with the file contents and content type
            Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, content_type)
                .body(axum::body::Body::from(contents))
                .unwrap()
        },
        Err(_) => {
            // Return a 404 Not Found response
            Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(axum::body::Body::from("File not found"))
                .unwrap()
        }
    }
}

pub async fn run_web_service() {
    // Initialize tracing for better logging
    tracing_subscriber::fmt::init();
    
    // Connect to the database
    let db = match Database::connect().await {
        Ok(db) => {
            tracing::info!("Database connection established");
            db
        },
        Err(err) => {
            tracing::error!("Failed to connect to the database: {}", err);
            tracing::warn!("Starting with in-memory mode - data will not be persisted");
            
            // Create a memory-only database as fallback
            Database::memory_only()
        }
    };
    
    // Create the application state
    let shared_state = Arc::new(AppState { db });
    
    // Define CORS policy to allow requests from frontend
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Get the static files directory from the environment or use the default
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "static".to_string());
    tracing::info!("Serving static files from: {}", static_dir);

    // Create API router with shared state
    let api_routes = Router::new()
        .route("/health", get(health_check))
        .route("/db-diagnostic", get(db_diagnostic))
        .route("/comparisons/get", post(get_comparisons))
        .route("/comparisons/add", post(add_comparison))
        .route("/comparisons/content", post(get_content_comparisons))
        .route("/rankings", post(get_rankings))
        .route("/tasks", post(get_tasks))
        .route("/tasks/delete", post(delete_task))
        .layer(Extension(shared_state))
        .layer(cors);

    // Create our application router
    let app = Router::new()
        .nest("/api", api_routes) // Move all API routes under /api prefix
        .fallback(serve_static_file); // Serve static files for all other routes

    // Run our service
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let port = port.parse::<u16>().expect("PORT must be a number");
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Listening on {}", addr);
    
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}

// Health check endpoint
async fn health_check(Extension(state): Extension<Arc<AppState>>) -> impl IntoResponse {
    // Check if we're using memory mode or real database
    let is_memory_mode = state.db.memory_mode;
    let mut is_db_connected = state.db.pool.is_some();
    
    // Collect diagnostic information
    let mut diagnostics = HashMap::new();
    
    // Add environment info
    if let Ok(env) = std::env::var("RAILWAY_ENVIRONMENT") {
        diagnostics.insert("railway_environment".to_string(), env);
    }
    
    if let Ok(project_id) = std::env::var("RAILWAY_PROJECT_ID") {
        diagnostics.insert("railway_project_id".to_string(), project_id);
    }
    
    // Add database connection info
    if let Ok(host) = std::env::var("PGHOST") {
        diagnostics.insert("pghost".to_string(), host);
    }
    
    if let Ok(port) = std::env::var("PGPORT") {
        diagnostics.insert("pgport".to_string(), port);
    }
    
    if let Ok(db) = std::env::var("PGDATABASE") {
        diagnostics.insert("pgdatabase".to_string(), db);
    }
    
    // Redacted values
    if std::env::var("PGUSER").is_ok() {
        diagnostics.insert("pguser".to_string(), "is_set".to_string());
    }
    
    if std::env::var("PGPASSWORD").is_ok() {
        diagnostics.insert("pgpassword".to_string(), "is_set".to_string());
    }
    
    if let Ok(url) = std::env::var("DATABASE_URL") {
        // Only show host portion
        if let Some(host_part) = url.split('@').nth(1) {
            diagnostics.insert("database_url_host".to_string(), host_part.to_string());
        } else {
            diagnostics.insert("database_url".to_string(), "is_set_but_invalid_format".to_string());
        }
    }
    
    // Add sqlx offline mode info
    if let Ok(offline) = std::env::var("SQLX_OFFLINE") {
        diagnostics.insert("sqlx_offline".to_string(), offline);
    }
    
    // Attempt a real-time check of the database connection
    if is_db_connected {
        match &state.db.pool {
            Some(pool) => {
                // Test the connection with a simple query
                match sqlx::query("SELECT 1").execute(pool).await {
                    Ok(_) => {
                        tracing::info!("Health check: Database connection verified");
                        is_db_connected = true;
                        diagnostics.insert("db_connection_test".to_string(), "success".to_string());
                    },
                    Err(err) => {
                        tracing::error!("Health check: Database connection failed: {}", err);
                        is_db_connected = false;
                        diagnostics.insert("db_connection_test".to_string(), format!("error: {}", err));
                    }
                }
            },
            None => {
                is_db_connected = false;
                diagnostics.insert("db_connection_test".to_string(), "memory_mode_no_test_needed".to_string());
            }
        }
    } else {
        diagnostics.insert("db_connection_test".to_string(), "memory_mode_no_test_needed".to_string());
    }
    
    // Perform DNS resolution test for Railway internal network if we're on Railway
    if let Ok(host) = std::env::var("PGHOST") {
        if host.contains(".railway.internal") {
            // Try to execute a test command to resolve the hostname
            match tokio::process::Command::new("getent")
                .args(&["hosts", &host])
                .output()
                .await {
                Ok(output) => {
                    if output.status.success() {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        diagnostics.insert("dns_resolution".to_string(), format!("success: {}", stdout.trim()));
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        diagnostics.insert("dns_resolution".to_string(), format!("failed: {}", stderr.trim()));
                    }
                },
                Err(err) => {
                    diagnostics.insert("dns_resolution".to_string(), format!("error: {}", err));
                }
            }
        }
    }
    
    (
        StatusCode::OK,
        Json(HealthCheckResponse {
            status: if is_db_connected { "ok".to_string() } else { "degraded".to_string() },
            db_connected: is_db_connected,
            memory_mode: is_memory_mode,
            diagnostics,
        })
    )
}

// Database diagnostic endpoint
async fn db_diagnostic(Extension(state): Extension<Arc<AppState>>) -> impl IntoResponse {
    let diagnostics = match state.db.test_connection().await {
        Ok(results) => results,
        Err(e) => {
            let mut error_map = std::collections::HashMap::new();
            error_map.insert("error".to_string(), format!("Failed to run diagnostics: {}", e));
            error_map
        }
    };
    
    (StatusCode::OK, Json(diagnostics))
}

// Get comparisons
async fn get_comparisons(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<ListRequest>,
) -> impl IntoResponse {
    match state.db.get_comparisons(&payload.list_id).await {
        Ok(db_comparisons) => {
            // Convert database comparisons to content-based for enhanced user experience
            let mut content_comparisons = Vec::new();
            
            for comparison in &db_comparisons {
                // Get task contents from the database
                match crate::db::get_task_contents_from_comparison(&state.db, comparison).await {
                    Ok((task_a_content, task_b_content, winner_content)) => {
                        content_comparisons.push(ContentComparison {
                            task_a_content,
                            task_b_content,
                            winner_content,
                            timestamp: comparison.timestamp.to_rfc3339(),
                        });
                    },
                    Err(e) => {
                        tracing::error!("Failed to get task contents: {}", e);
                    }
                }
            }
            
            // Convert content-based comparisons back to ID-based for legacy support
            let legacy_comparisons: Vec<LegacyComparison> = content_comparisons
                .iter()
                .enumerate()
                .map(|(i, comp)| LegacyComparison {
                    task_a_id: i + 1,
                    task_b_id: i + 2,
                    winner_id: if comp.winner_content == comp.task_a_content { i + 1 } else { i + 2 },
                    timestamp: comp.timestamp.clone(),
                })
                .collect();
            
            (StatusCode::OK, Json(ComparisonsResponse { comparisons: legacy_comparisons }))
        },
        Err(e) => {
            tracing::error!("Failed to get comparisons: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ComparisonsResponse { comparisons: vec![] }))
        }
    }
}

// Add a new comparison
async fn add_comparison(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<AddComparisonRequest>,
) -> impl IntoResponse {
    // Validate input
    if payload.task_a_content.trim().is_empty() || payload.task_b_content.trim().is_empty() || payload.winner_content.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, Json(ComparisonsResponse { comparisons: vec![] }));
    }
    
    // Winner must be one of task A or task B
    if payload.winner_content != payload.task_a_content && payload.winner_content != payload.task_b_content {
        return (StatusCode::BAD_REQUEST, Json(ComparisonsResponse { comparisons: vec![] }));
    }
    
    match state.db.add_comparison(&payload.task_a_content, &payload.task_b_content, &payload.winner_content, &payload.list_id).await {
        Ok(_) => (StatusCode::CREATED, Json(ComparisonsResponse { comparisons: vec![] })),
        Err(e) => {
            tracing::error!("Failed to add comparison: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ComparisonsResponse { comparisons: vec![] }))
        }
    }
}

// Get rankings
async fn get_rankings(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<ListRequest>,
) -> impl IntoResponse {
    // First, get all comparisons from the database
    match state.db.get_comparisons(&payload.list_id).await {
        Ok(comparisons) => {
            if comparisons.is_empty() {
                return (StatusCode::OK, Json(RankingsResponse { rankings: vec![] }));
            }
            
            // Extract all tasks that have been compared
            let mut all_tasks = HashSet::new();
            let mut task_contents = HashMap::new();
            
            // Process all comparisons to extract task contents
            for comparison in &comparisons {
                // Get contents for all tasks in this comparison
                match crate::db::get_task_contents_from_comparison(&state.db, comparison).await {
                    Ok((task_a_content, task_b_content, winner_content)) => {
                        // Store task ID to content mappings
                        task_contents.insert(comparison.task_a_id.clone(), task_a_content.clone());
                        task_contents.insert(comparison.task_b_id.clone(), task_b_content.clone());
                        task_contents.insert(comparison.winner_id.clone(), winner_content.clone());
                        
                        // Create TaskInfo objects
                        all_tasks.insert(TaskInfo {
                            content: task_a_content,
                            completed: false,
                        });
                        all_tasks.insert(TaskInfo {
                            content: task_b_content,
                            completed: false,
                        });
                    },
                    Err(e) => {
                        tracing::error!("Failed to get task contents: {}", e);
                        continue;
                    }
                }
            }
            
            // Create ASAP ranker from comparisons
            let mut asap = ASAP::new();
            
            for comparison in &comparisons {
                if let (Some(task_a_content), Some(task_b_content), Some(winner_content)) = (
                    task_contents.get(&comparison.task_a_id),
                    task_contents.get(&comparison.task_b_id),
                    task_contents.get(&comparison.winner_id)
                ) {
                    // Get the winner (0 for task A, 1 for task B)
                    let winner = if winner_content == task_a_content { 0 } else { 1 };
                    
                    // Add the comparison to ASAP
                    asap.add_comparison(task_a_content, task_b_content, winner);
                }
            }
            
            // Get rankings from ASAP
            let rankings = asap.ratings();
            
            // Convert to RankedTask format
            let mut ranked_tasks: Vec<RankedTask> = rankings
                .into_iter()
                .map(|(content, score)| RankedTask {
                    content: content.to_string(),
                    score,
                    rank: 0, // Will be set later
                })
                .collect();
            
            // Sort by score (highest first)
            ranked_tasks.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
            
            // Assign ranks
            for (i, task) in ranked_tasks.iter_mut().enumerate() {
                task.rank = i + 1;
            }
            
            (StatusCode::OK, Json(RankingsResponse { rankings: ranked_tasks }))
        },
        Err(e) => {
            tracing::error!("Failed to get comparisons for rankings: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(RankingsResponse { rankings: vec![] }))
        }
    }
}

// Get all tasks
async fn get_tasks(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<ListRequest>,
) -> impl IntoResponse {
    match state.db.get_tasks(&payload.list_id).await {
        Ok(tasks) => {
            // Extract just the content strings for backward compatibility
            let task_contents: Vec<TaskContent> = tasks.into_iter()
                .map(|task| TaskContent { 
                    content: task.content, 
                    completed: task.completed
                })
                .collect();
            
            (StatusCode::OK, Json(task_contents))
        },
        Err(e) => {
            tracing::error!("Failed to get tasks: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json::<Vec<TaskContent>>(vec![]))
        }
    }
}

// Delete a task
async fn delete_task(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<DeleteTaskRequest>,
) -> impl IntoResponse {
    match state.db.delete_task(&payload.content, &payload.list_id).await {
        Ok(true) => StatusCode::OK,
        Ok(false) => StatusCode::NOT_FOUND,
        Err(e) => {
            tracing::error!("Failed to delete task: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}

// Get all comparisons in content-based format
async fn get_content_comparisons(
    Extension(state): Extension<Arc<AppState>>,
    Json(payload): Json<ListRequest>,
) -> impl IntoResponse {
    match state.db.get_comparisons(&payload.list_id).await {
        Ok(db_comparisons) => {
            // Convert database comparisons to content-based format
            let mut content_comparisons = Vec::new();
            
            for comparison in db_comparisons {
                // Get task contents from the database
                match crate::db::get_task_contents_from_comparison(&state.db, &comparison).await {
                    Ok((task_a_content, task_b_content, winner_content)) => {
                        content_comparisons.push(ContentComparison {
                            task_a_content,
                            task_b_content,
                            winner_content,
                            timestamp: comparison.timestamp.to_rfc3339(),
                        });
                    },
                    Err(e) => {
                        tracing::error!("Failed to get task contents: {}", e);
                    }
                }
            }
            
            (StatusCode::OK, Json(ContentComparisonsResponse { comparisons: content_comparisons }))
        },
        Err(e) => {
            tracing::error!("Failed to get comparisons: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ContentComparisonsResponse { comparisons: vec![] }))
        }
    }
} 