use axum::{
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, delete},
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
}

// Request for deleting a task
#[derive(Debug, Deserialize)]
pub struct DeleteTaskRequest {
    content: String,
}

#[derive(Debug, Serialize)]
pub struct ComparisonsResponse {
    comparisons: Vec<LegacyComparison>,
}

#[derive(Debug, Serialize)]
pub struct RankingsResponse {
    rankings: Vec<RankedTask>,
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
        .route("/comparisons", get(get_comparisons).post(add_comparison))
        .route("/rankings", get(get_rankings))
        .route("/tasks", get(get_tasks).delete(delete_task))
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
async fn health_check() -> impl IntoResponse {
    StatusCode::OK
}

// Get all comparisons
async fn get_comparisons(Extension(state): Extension<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_comparisons().await {
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
    
    match state.db.add_comparison(&payload.task_a_content, &payload.task_b_content, &payload.winner_content).await {
        Ok(_) => (StatusCode::CREATED, Json(ComparisonsResponse { comparisons: vec![] })),
        Err(e) => {
            tracing::error!("Failed to add comparison: {}", e);
            (StatusCode::INTERNAL_SERVER_ERROR, Json(ComparisonsResponse { comparisons: vec![] }))
        }
    }
}

// Get rankings
async fn get_rankings(Extension(state): Extension<Arc<AppState>>) -> impl IntoResponse {
    // First, get all comparisons from the database
    match state.db.get_comparisons().await {
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
async fn get_tasks(Extension(state): Extension<Arc<AppState>>) -> impl IntoResponse {
    match state.db.get_tasks().await {
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
    match state.db.delete_task(&payload.content).await {
        Ok(true) => StatusCode::OK,
        Ok(false) => StatusCode::NOT_FOUND,
        Err(e) => {
            tracing::error!("Failed to delete task: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
} 