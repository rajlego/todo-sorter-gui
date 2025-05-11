use axum::{
    extract::{Path, State},
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tokio::net::TcpListener;
use tokio::fs;
use crate::db::{Database, create_pool, create_fallback_pool};
use crate::auth::{AuthService, AuthUser, LoginRequest, RegisterRequest};
use crate::realtime::{RealtimeService, ws_handler};
use uuid::Uuid;

// Application state with all our services
pub struct AppState {
    pub db: Database,
    pub auth_service: Arc<AuthService>,
    pub realtime_service: Arc<RealtimeService>,
}

// File API types
#[derive(Debug, Deserialize)]
pub struct CreateFileRequest {
    title: String,
    content: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateFileRequest {
    title: Option<String>,
    content: String,
}

// Task info using content as the primary identifier
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct TaskInfo {
    content: String,
    completed: bool,
}

// Comparison with content-based task identification
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

// Simplified run_web_service function focusing on the key elements
pub async fn run_web_service() {
    // Initialize tracing for better logging
    tracing_subscriber::fmt::init();
    
    // Create database connection with fallback for Railway deployments
    let db_pool = match create_pool().await {
        Ok(pool) => {
            tracing::info!("Successfully connected to PostgreSQL database");
            pool
        },
        Err(err) => {
            // Check if we're in SQLX_OFFLINE mode, which allows operation without a DB
            if std::env::var("SQLX_OFFLINE").unwrap_or_default() == "true" {
                tracing::warn!("Failed to connect to PostgreSQL: {}. Using fallback with SQLX_OFFLINE=true", err);
                // Create a fallback minimal connection (may not work for all operations)
                // The app will run but database operations will likely fail
                create_fallback_pool().await
            } else {
                // If SQLX_OFFLINE is not set, we can't continue without a database
                tracing::error!("Failed to connect to PostgreSQL: {} and SQLX_OFFLINE is not enabled", err);
                panic!("Cannot start application without database connection. Set SQLX_OFFLINE=true to allow startup without database.");
            }
        }
    };
    
    let db = Database::new(db_pool);
    
    // Initialize services
    let auth_service = Arc::new(AuthService::new(db.clone()));
    let realtime_service = Arc::new(RealtimeService::new());
    
    // Create the application state
    let app_state = Arc::new(AppState {
        db,
        auth_service,
        realtime_service,
    });
    
    // Define CORS policy
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);
    
    // Get the static files directory from the environment or use the default
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "static".to_string());
    tracing::info!("Serving static files from: {}", static_dir);
    
    // Create auth routes
    let auth_routes = Router::new()
        .route("/register", post(register_handler))
        .route("/login", post(login_handler));
    
    // Create file routes (require authentication)
    let file_routes = Router::new()
        .route("/", post(create_file_handler))
        .route("/:file_id", get(get_file_handler))
        .route("/:file_id", post(update_file_handler))
        .route("/:file_id/tasks", get(get_tasks_handler))
        .route("/:file_id/comparisons", get(get_comparisons_handler))
        .route("/:file_id/comparisons", post(add_comparison_handler))
        .route("/:file_id/sync", get(file_sync_handler));
    
    // Create API router
    let api_routes = Router::new()
        .nest("/auth", auth_routes)
        .nest("/files", file_routes)
        .route("/health", get(health_check))
        .with_state(app_state)
        .layer(cors);
    
    // Create the application router
    let app = Router::new()
        .nest("/api", api_routes) // Move all API routes under /api prefix
        .fallback(serve_static_file); // Serve static files for all other routes
    
    // Run the service
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let port = port.parse::<u16>().expect("PORT must be a number");
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Listening on {}", addr);
    
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
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
    match fs::read(&file_path).await {
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

// Auth handlers
async fn register_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<RegisterRequest>,
) -> impl IntoResponse {
    match state.auth_service.register(req).await {
        Ok(response) => (StatusCode::CREATED, Json(response)).into_response(),
        Err(status) => status.into_response(),
    }
}

async fn login_handler(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> impl IntoResponse {
    match state.auth_service.login(req).await {
        Ok(response) => (StatusCode::OK, Json(response)).into_response(),
        Err(status) => status.into_response(),
    }
}

// File handlers
async fn create_file_handler(
    auth_user: AuthUser,
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateFileRequest>,
) -> impl IntoResponse {
    match state.db.create_file(auth_user.user_id, &req.title, &req.content).await {
        Ok(file) => (StatusCode::CREATED, Json(file)).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn get_file_handler(
    auth_user: AuthUser,
    Path(file_id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    match state.db.get_file(file_id).await {
        Ok(Some(file)) => {
            // Check if user has access
            if file.user_id != auth_user.user_id {
                return StatusCode::FORBIDDEN.into_response();
            }
            Json(file).into_response()
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn update_file_handler(
    auth_user: AuthUser,
    Path(file_id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<UpdateFileRequest>,
) -> impl IntoResponse {
    // First check if the file exists and belongs to this user
    match state.db.get_file(file_id).await {
        Ok(Some(file)) => {
            if file.user_id != auth_user.user_id {
                return StatusCode::FORBIDDEN.into_response();
            }
            
            // Update the file
            let title = req.title.unwrap_or(file.title);
            match state.db.update_file(file_id, &title, &req.content).await {
                Ok(updated) => {
                    // Save a version history
                    let _ = state.db.add_file_version(file_id, &req.content, auth_user.user_id).await;
                    
                    // Broadcast the update via WebSockets
                    state.realtime_service.broadcast(crate::realtime::WsMessage::FileUpdate {
                        file_id,
                        content: req.content,
                        user_id: auth_user.user_id,
                    });
                    
                    Json(updated).into_response()
                },
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// WebSocket sync handler for real-time collaboration
async fn file_sync_handler(
    auth_user: AuthUser,
    ws: axum::extract::WebSocketUpgrade,
    Path(file_id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // Check if the file exists and belongs to this user
    match state.db.get_file(file_id).await {
        Ok(Some(file)) => {
            if file.user_id != auth_user.user_id {
                return StatusCode::FORBIDDEN.into_response();
            }
            
            // Handle WebSocket connection
            ws_handler(
                ws,
                Path(file_id),
                State((state.realtime_service.clone(), auth_user.user_id)),
            ).await
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// Keep existing handlers for tasks and comparisons, or implement them similarly...
async fn get_tasks_handler(
    auth_user: AuthUser,
    Path(file_id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // First check if the file exists and belongs to this user
    match state.db.get_file(file_id).await {
        Ok(Some(file)) => {
            if file.user_id != auth_user.user_id {
                return StatusCode::FORBIDDEN.into_response();
            }
            
            // Get tasks for this file
            match state.db.get_tasks_for_file(file_id).await {
                Ok(tasks) => Json(tasks).into_response(),
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn get_comparisons_handler(
    auth_user: AuthUser,
    Path(file_id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // First check if the file exists and belongs to this user
    match state.db.get_file(file_id).await {
        Ok(Some(file)) => {
            if file.user_id != auth_user.user_id {
                return StatusCode::FORBIDDEN.into_response();
            }
            
            // Get comparisons for this file
            match state.db.get_comparisons_for_file(file_id).await {
                Ok(comparisons) => {
                    // Convert to response format if needed
                    let legacy_comparisons: Vec<LegacyComparison> = comparisons
                        .iter()
                        .map(|comp| {
                            LegacyComparison {
                                // Using UUIDs as temp IDs for backward compatibility
                                task_a_id: comp.task_a_id.as_u128() as usize % 10000,
                                task_b_id: comp.task_b_id.as_u128() as usize % 10000,
                                winner_id: comp.winner_id.as_u128() as usize % 10000,
                                timestamp: comp.created_at.to_rfc3339(),
                            }
                        })
                        .collect();
                    
                    Json(ComparisonsResponse {
                        comparisons: legacy_comparisons,
                    }).into_response()
                },
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn add_comparison_handler(
    auth_user: AuthUser,
    Path(file_id): Path<Uuid>,
    State(state): State<Arc<AppState>>,
    Json(req): Json<AddComparisonRequest>,
) -> impl IntoResponse {
    // First check if the file exists and belongs to this user
    match state.db.get_file(file_id).await {
        Ok(Some(file)) => {
            if file.user_id != auth_user.user_id {
                return StatusCode::FORBIDDEN.into_response();
            }
            
            // Get the tasks for this file to find the task IDs
            match state.db.get_tasks_for_file(file_id).await {
                Ok(tasks) => {
                    // Find the tasks by content
                    let task_a = tasks.iter().find(|t| t.content == req.task_a_content);
                    let task_b = tasks.iter().find(|t| t.content == req.task_b_content);
                    let winner = tasks.iter().find(|t| t.content == req.winner_content);
                    
                    // Make sure all tasks were found
                    if let (Some(task_a), Some(task_b), Some(winner)) = (task_a, task_b, winner) {
                        // Add the comparison
                        match state.db.add_comparison(
                            file_id, 
                            task_a.id, 
                            task_b.id, 
                            winner.id
                        ).await {
                            Ok(_comparison) => {
                                // Broadcast the update via WebSockets
                                state.realtime_service.broadcast(crate::realtime::WsMessage::ComparisonAdded {
                                    file_id,
                                    comparison: crate::realtime::ComparisonUpdate {
                                        task_a_content: req.task_a_content,
                                        task_b_content: req.task_b_content,
                                        winner_content: req.winner_content,
                                    },
                                });
                                
                                StatusCode::CREATED.into_response()
                            },
                            Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
                        }
                    } else {
                        // One or more tasks not found
                        StatusCode::BAD_REQUEST.into_response()
                    }
                },
                Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
            }
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

// Health check endpoint
async fn health_check(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    // Try to ping the database
    let db_status = match sqlx::query("SELECT 1").execute(&*state.db.pool).await {
        Ok(_) => "connected",
        Err(err) => {
            if std::env::var("SQLX_OFFLINE").unwrap_or_default() == "true" {
                "offline_mode"
            } else {
                "error"
            }
        }
    };

    // Get environment information
    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "Not set".to_string());
    let db_url_masked = if db_url != "Not set" {
        // Mask the credentials in the DB URL for security
        let parts: Vec<&str> = db_url.split('@').collect();
        if parts.len() > 1 {
            format!("**:**@{}", parts[1])
        } else {
            "**:**@**".to_string()
        }
    } else {
        "Not set".to_string()
    };
    
    // Check if we're running on Railway
    let on_railway = std::env::var("RAILWAY_ENVIRONMENT").is_ok();
    let railway_environment = std::env::var("RAILWAY_ENVIRONMENT").unwrap_or_default();
    let railway_service = std::env::var("RAILWAY_SERVICE_NAME").unwrap_or_default();
    
    let info = serde_json::json!({
        "status": if db_status == "connected" { "healthy" } else { "degraded" },
        "version": env!("CARGO_PKG_VERSION"),
        "environment": std::env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string()),
        "database": {
            "status": db_status,
            "url_masked": db_url_masked,
            "offline_mode": std::env::var("SQLX_OFFLINE").unwrap_or_else(|_| "false".to_string()),
        },
        "deployment": {
            "platform": if on_railway { "railway" } else { "unknown" },
            "railway_environment": railway_environment,
            "railway_service": railway_service,
        },
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    
    (StatusCode::OK, Json(info)).into_response()
} 