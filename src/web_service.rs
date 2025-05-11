use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use tokio::net::TcpListener;
use crate::asap_cpu::ASAP;

// Type for storing our application state
pub struct AppState {
    // Store comparisons with task content (not IDs)
    comparisons: Mutex<Vec<ContentComparison>>,
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

pub async fn run_web_service() {
    // Initialize tracing for better logging
    tracing_subscriber::fmt::init();
    
    // Create the application state
    let app_state = Arc::new(AppState {
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
        .route("/comparisons", get(get_comparisons).post(add_comparison))
        .route("/rankings", get(get_rankings))
        .route("/tasks", get(get_tasks).delete(delete_task))
        .with_state(app_state)
        .layer(cors);

    // Run our service
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let port = port.parse::<u16>().expect("PORT must be a number");
    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Listening on {}", addr);
    
    let listener = TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Health check endpoint
async fn health_check() -> impl IntoResponse {
    StatusCode::OK
}

// Get all comparisons
async fn get_comparisons(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let comparisons = state.comparisons.lock().unwrap();
    
    // Convert content comparisons to legacy format for backward compatibility
    let mut content_to_id = HashMap::new();
    let mut next_id = 1;
    
    let legacy_comparisons: Vec<LegacyComparison> = comparisons
        .iter()
        .map(|comp| {
            // Assign IDs to task content
            let task_a_id = *content_to_id
                .entry(comp.task_a_content.clone())
                .or_insert_with(|| {
                    let id = next_id;
                    next_id += 1;
                    id
                });
            
            let task_b_id = *content_to_id
                .entry(comp.task_b_content.clone())
                .or_insert_with(|| {
                    let id = next_id;
                    next_id += 1;
                    id
                });
            
            let winner_id = if comp.winner_content == comp.task_a_content {
                task_a_id
            } else {
                task_b_id
            };
            
            LegacyComparison {
                task_a_id,
                task_b_id,
                winner_id,
                timestamp: comp.timestamp.clone(),
            }
        })
        .collect();
    
    Json(ComparisonsResponse {
        comparisons: legacy_comparisons,
    })
}

// Add a new comparison using task content
async fn add_comparison(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<AddComparisonRequest>,
) -> impl IntoResponse {
    // Validate that the winner content matches one of the tasks
    if payload.winner_content != payload.task_a_content && 
       payload.winner_content != payload.task_b_content {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({
            "error": "Winner content must match either task_a_content or task_b_content"
        }))).into_response();
    }
    
    // Create the new comparison with content
    let new_comparison = ContentComparison {
        task_a_content: payload.task_a_content,
        task_b_content: payload.task_b_content,
        winner_content: payload.winner_content,
        timestamp: chrono::Utc::now().to_rfc3339(),
    };
    
    // Add the comparison to our list
    let mut comparisons = state.comparisons.lock().unwrap();
    comparisons.push(new_comparison.clone());
    
    // Convert to legacy format for response
    let mut content_to_id = HashMap::new();
    content_to_id.insert(new_comparison.task_a_content.clone(), 1);
    content_to_id.insert(new_comparison.task_b_content.clone(), 2);
    
    let winner_id = if new_comparison.winner_content == new_comparison.task_a_content {
        1
    } else {
        2
    };
    
    let legacy_comparison = LegacyComparison {
        task_a_id: 1,
        task_b_id: 2,
        winner_id,
        timestamp: new_comparison.timestamp,
    };
    
    (StatusCode::CREATED, Json(legacy_comparison)).into_response()
}

// Get rankings using the ASAP algorithm based on task content
async fn get_rankings(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let comparisons = state.comparisons.lock().unwrap();
    
    // Extract unique task contents from comparisons
    let mut unique_tasks = HashSet::new();
    for comp in comparisons.iter() {
        unique_tasks.insert(comp.task_a_content.clone());
        unique_tasks.insert(comp.task_b_content.clone());
    }
    
    let tasks: Vec<String> = unique_tasks.into_iter().collect();
    
    // If we don't have enough tasks or comparisons, return an empty response
    if tasks.len() < 2 || comparisons.is_empty() {
        return Json(RankingsResponse { rankings: Vec::new() }).into_response();
    }
    
    // Map task content to index
    let content_to_index: HashMap<String, usize> = tasks
        .iter()
        .enumerate()
        .map(|(i, content)| (content.clone(), i))
        .collect();
    
    // Convert comparisons to matrix format for ASAP
    let n = tasks.len();
    let mut m = vec![vec![0; n]; n];
    
    for comp in comparisons.iter() {
        if let (Some(&winner_idx), Some(&loser_idx)) = (
            content_to_index.get(&comp.winner_content),
            if comp.winner_content == comp.task_a_content {
                content_to_index.get(&comp.task_b_content)
            } else {
                content_to_index.get(&comp.task_a_content)
            },
        ) {
            m[winner_idx][loser_idx] += 1;
        }
    }
    
    // Run the ASAP algorithm to get ratings
    let mut asap = ASAP::new(n);
    let (_, _, ms_curr, _) = asap.run_asap(&m);
    
    // Create the rankings response
    let mut scores: Vec<(String, f64)> = content_to_index
        .iter()
        .map(|(content, &index)| (content.clone(), ms_curr[index]))
        .collect();
    
    // Sort by score (highest first)
    scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    
    // Build the final rankings
    let rankings: Vec<RankedTask> = scores
        .iter()
        .enumerate()
        .map(|(rank, (content, score))| RankedTask {
            content: content.clone(),
            score: *score,
            rank: rank + 1, // 1-based ranking
        })
        .collect();
    
    Json(RankingsResponse { rankings }).into_response()
}

// Get all task contents from the comparisons
async fn get_tasks(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    let comparisons = state.comparisons.lock().unwrap();
    
    // Extract unique task contents from comparisons
    let mut unique_tasks = HashSet::new();
    for comp in comparisons.iter() {
        unique_tasks.insert(comp.task_a_content.clone());
        unique_tasks.insert(comp.task_b_content.clone());
    }
    
    let tasks: Vec<String> = unique_tasks.into_iter().collect();
    
    Json(serde_json::json!({
        "tasks": tasks
    })).into_response()
}

// Delete a task and all its comparisons
async fn delete_task(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<DeleteTaskRequest>,
) -> impl IntoResponse {
    let mut comparisons = state.comparisons.lock().unwrap();
    
    // Count comparisons before removal to verify deletion
    let original_count = comparisons.len();
    
    // Remove any comparisons that include this task
    comparisons.retain(|comp| {
        comp.task_a_content != payload.content && 
        comp.task_b_content != payload.content
    });
    
    // Calculate how many comparisons were removed
    let removed_count = original_count - comparisons.len();
    
    Json(serde_json::json!({
        "removed_comparisons": removed_count,
        "status": "success",
        "message": format!("Task '{}' and all related comparisons removed", payload.content)
    })).into_response()
} 