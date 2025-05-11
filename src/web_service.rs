use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tokio::net::TcpListener;
use crate::asap_cpu::ASAP;

// Type for storing our application state
pub struct AppState {
    tasks: Mutex<HashMap<usize, TaskInfo>>,
    comparisons: Mutex<Vec<Comparison>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskInfo {
    id: usize,
    content: String,
    completed: bool,
    line: usize,
    file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Comparison {
    task_a_id: usize,
    task_b_id: usize,
    winner_id: usize,
    timestamp: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RankedTask {
    id: usize,
    content: String,
    completed: bool,
    line: usize,
    file: String,
    score: f64,
    rank: usize,
}

// Requests and responses
#[derive(Debug, Deserialize)]
pub struct AddTaskRequest {
    content: String,
    completed: bool,
    line: usize,
    file: String,
}

#[derive(Debug, Deserialize)]
pub struct AddComparisonRequest {
    task_a_id: usize,
    task_b_id: usize,
    winner_id: usize,
}

#[derive(Debug, Serialize)]
pub struct TasksResponse {
    tasks: Vec<TaskInfo>,
}

#[derive(Debug, Serialize)]
pub struct ComparisonsResponse {
    comparisons: Vec<Comparison>,
}

#[derive(Debug, Serialize)]
pub struct RankingsResponse {
    rankings: Vec<RankedTask>,
}

pub async fn run_web_service() {
    // Initialize tracing for better logging
    tracing_subscriber::fmt::init();
    
    // Create the application state
    let app_state = Arc::new(AppState {
        tasks: Mutex::new(HashMap::new()),
        comparisons: Mutex::new(Vec::new()),
    });
    
    // Define CORS policy to allow requests from frontend
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Create our API router
    let app = Router::new()
        .route("/health", get(health_check))
        .route("/tasks", get(get_tasks).post(add_task))
        .route("/comparisons", get(get_comparisons).post(add_comparison))
        .route("/rankings", get(get_rankings))
        .with_state(app_state)
        .layer(cors);

    // Run our service
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], 3000));
    tracing::info!("Listening on {}", addr);
    
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Health check endpoint
async fn health_check() -> impl IntoResponse {
    StatusCode::OK
}

// Get all tasks
async fn get_tasks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let tasks = state.tasks.lock().unwrap();
    let tasks_vec: Vec<TaskInfo> = tasks.values().cloned().collect();
    
    Json(TasksResponse { tasks: tasks_vec })
}

// Add a new task
async fn add_task(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddTaskRequest>,
) -> impl IntoResponse {
    let mut tasks = state.tasks.lock().unwrap();
    
    // Generate a new ID for the task
    let new_id = if let Some(max_id) = tasks.keys().max() {
        max_id + 1
    } else {
        1
    };
    
    // Create the new task
    let new_task = TaskInfo {
        id: new_id,
        content: payload.content,
        completed: payload.completed,
        line: payload.line,
        file: payload.file,
    };
    
    tasks.insert(new_id, new_task.clone());
    
    (StatusCode::CREATED, Json(new_task))
}

// Get all comparisons
async fn get_comparisons(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let comparisons = state.comparisons.lock().unwrap();
    
    Json(ComparisonsResponse {
        comparisons: comparisons.clone(),
    })
}

// Add a new comparison
async fn add_comparison(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddComparisonRequest>,
) -> impl IntoResponse {
    let tasks = state.tasks.lock().unwrap();
    
    // Validate that the task IDs exist
    if !tasks.contains_key(&payload.task_a_id) || 
       !tasks.contains_key(&payload.task_b_id) || 
       !tasks.contains_key(&payload.winner_id) {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Invalid task ID provided"
        }))).into_response();
    }
    
    // Validate that the winner ID is one of the tasks being compared
    if payload.winner_id != payload.task_a_id && payload.winner_id != payload.task_b_id {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Winner ID must be either task_a_id or task_b_id"
        }))).into_response();
    }
    
    // Create the new comparison
    let new_comparison = Comparison {
        task_a_id: payload.task_a_id,
        task_b_id: payload.task_b_id,
        winner_id: payload.winner_id,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    
    // Add the comparison to our list
    let mut comparisons = state.comparisons.lock().unwrap();
    comparisons.push(new_comparison.clone());
    
    (StatusCode::CREATED, Json(new_comparison)).into_response()
}

// Get rankings using the ASAP algorithm
async fn get_rankings(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let tasks = state.tasks.lock().unwrap();
    let comparisons = state.comparisons.lock().unwrap();
    
    // If we don't have enough tasks or comparisons, return an empty response
    if tasks.len() < 2 || comparisons.is_empty() {
        return Json(RankingsResponse { rankings: Vec::new() }).into_response();
    }
    
    // Convert our tasks and comparisons into the format expected by ASAP
    let n = tasks.len();
    let id_to_index: HashMap<usize, usize> = tasks
        .keys()
        .enumerate()
        .map(|(i, &id)| (id, i))
        .collect();
    
    let mut m = vec![vec![0; n]; n];
    for comp in comparisons.iter() {
        if let (Some(&i), Some(&j)) = (id_to_index.get(&comp.winner_id), id_to_index.get(&comp.task_b_id)) {
            m[i][j] += 1;
        }
        if let (Some(&i), Some(&j)) = (id_to_index.get(&comp.winner_id), id_to_index.get(&comp.task_a_id)) {
            m[i][j] += 1;
        }
    }
    
    // Run the ASAP algorithm to get ratings
    let mut asap = ASAP::new(n);
    let (_, _, ms_curr, _) = asap.run_asap(&m);
    
    // Create the rankings response
    let mut rankings = Vec::new();
    let mut scores: Vec<(usize, f64)> = id_to_index
        .iter()
        .map(|(&id, &index)| (id, ms_curr[index]))
        .collect();
    
    // Sort by score (highest first)
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    // Build the final rankings
    for (rank, (id, score)) in scores.iter().enumerate() {
        if let Some(task) = tasks.get(id) {
            rankings.push(RankedTask {
                id: *id,
                content: task.content.clone(),
                completed: task.completed,
                line: task.line,
                file: task.file.clone(),
                score: *score,
                rank: rank + 1,
            });
        }
    }
    
    Json(RankingsResponse { rankings }).into_response()
} 