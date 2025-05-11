use axum::{
    extract::{Path, State, WebSocketUpgrade},
    response::Response,
};
use std::sync::Arc;
use tokio::sync::broadcast;
use futures::{SinkExt, StreamExt};
use axum::extract::ws::{Message, WebSocket};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::collections::HashMap;
use tokio::sync::Mutex;

// Types for WebSocket messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum WsMessage {
    FileUpdate {
        file_id: Uuid,
        content: String,
        user_id: Uuid,
    },
    TaskUpdate {
        file_id: Uuid,
        tasks: Vec<TaskUpdate>,
    },
    ComparisonAdded {
        file_id: Uuid,
        comparison: ComparisonUpdate,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskUpdate {
    pub id: Option<Uuid>,
    pub content: String,
    pub completed: bool,
    pub line_number: i32,
    pub rank: Option<f64>,
    pub score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonUpdate {
    pub task_a_content: String,
    pub task_b_content: String,
    pub winner_content: String,
}

// In-memory file edit tracking
type FileEditors = Arc<Mutex<HashMap<Uuid, HashMap<String, Uuid>>>>;

// Realtime service
pub struct RealtimeService {
    // Channel for broadcasting messages
    tx: broadcast::Sender<WsMessage>,
    // Track users editing each file
    editors: FileEditors,
}

impl RealtimeService {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(100); // Buffer size 100
        
        Self {
            tx,
            editors: Arc::new(Mutex::new(HashMap::new())),
        }
    }
    
    // Send a message to all connected clients
    pub fn broadcast(&self, message: WsMessage) {
        // Ignoring send errors - happens when no receivers
        let _ = self.tx.send(message);
    }
    
    // Handle a WebSocket connection for a specific file
    pub async fn handle_socket(
        ws: WebSocket,
        file_id: Uuid,
        user_id: Uuid,
        connection_id: String,
        service: Arc<Self>,
    ) {
        let (mut sender, mut receiver) = ws.split();
        
        // Track this user as an editor of the file
        {
            let mut editors = service.editors.lock().await;
            editors
                .entry(file_id)
                .or_insert_with(HashMap::new)
                .insert(connection_id.clone(), user_id);
        }
        
        // Subscribe to the broadcast channel
        let mut rx = service.tx.subscribe();
        
        // Use a oneshot channel to signal when tasks should be terminated
        let (close_tx, close_rx) = tokio::sync::oneshot::channel::<()>();
        let mut close_rx = close_rx;
        
        // Forward broadcast messages to this WebSocket
        let service_clone = service.clone();
        let connection_id_clone = connection_id.clone();
        let file_id_clone = file_id;
        
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    // Check for shutdown signal
                    _ = &mut close_rx => break,
                    
                    // Process incoming broadcast messages
                    msg = rx.recv() => {
                        if let Ok(msg) = msg {
                            // Only forward messages for this file
                            let relevant = match &msg {
                                WsMessage::FileUpdate { file_id: id, .. } => *id == file_id_clone,
                                WsMessage::TaskUpdate { file_id: id, .. } => *id == file_id_clone,
                                WsMessage::ComparisonAdded { file_id: id, .. } => *id == file_id_clone,
                                WsMessage::Error { .. } => true, // Global errors
                            };
                            
                            if relevant {
                                if let Ok(json) = serde_json::to_string(&msg) {
                                    if sender.send(Message::Text(json)).await.is_err() {
                                        break;
                                    }
                                }
                            }
                        } else {
                            // Channel closed or error
                            break;
                        }
                    }
                }
            }
            
            // Disconnected, remove from editors
            let mut editors = service_clone.editors.lock().await;
            if let Some(file_editors) = editors.get_mut(&file_id_clone) {
                file_editors.remove(&connection_id_clone);
                if file_editors.is_empty() {
                    editors.remove(&file_id_clone);
                }
            }
        });
        
        // Handle incoming WebSocket messages
        let service_clone = service.clone();
        let close_tx = Some(close_tx); // Wrap in Option to allow taking
        
        tokio::spawn(async move {
            while let Some(Ok(msg)) = receiver.next().await {
                match msg {
                    Message::Text(text) => {
                        if let Ok(ws_msg) = serde_json::from_str::<WsMessage>(&text) {
                            // Process the message
                            match ws_msg {
                                WsMessage::FileUpdate { content, .. } => {
                                    // Create a properly formed update message
                                    let update = WsMessage::FileUpdate {
                                        file_id,
                                        content,
                                        user_id,
                                    };
                                    
                                    // Broadcast to all connected clients
                                    service_clone.broadcast(update);
                                },
                                // Handle other message types...
                                _ => {
                                    // Pass through other message types
                                    service_clone.broadcast(ws_msg);
                                }
                            }
                        }
                    },
                    Message::Close(_) => break,
                    _ => {}, // Ignore other message types
                }
            }
            
            // Signal the forward task to stop
            if let Some(tx) = close_tx {
                let _ = tx.send(());
            }
        });
    }
}

// WebSocket handler
pub async fn ws_handler(
    ws: WebSocketUpgrade,
    Path(file_id): Path<Uuid>,
    State((realtime_service, user_id)): State<(Arc<RealtimeService>, Uuid)>,
) -> Response {
    // Generate a unique connection ID
    let connection_id = uuid::Uuid::new_v4().to_string();
    
    // Upgrade the connection to WebSocket
    ws.on_upgrade(move |socket| {
        RealtimeService::handle_socket(
            socket,
            file_id,
            user_id,
            connection_id,
            realtime_service,
        )
    })
} 