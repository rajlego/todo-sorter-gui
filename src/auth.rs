use crate::db::Database;
use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use std::sync::Arc;
use jsonwebtoken::{encode, decode, Header, Validation, EncodingKey, DecodingKey};
use std::env;
use chrono::{Duration, Utc};
use bcrypt::{hash, verify, DEFAULT_COST};

// For proper password hashing using bcrypt
fn hash_password(password: &str) -> Result<String, bcrypt::BcryptError> {
    hash(password, DEFAULT_COST)
}

fn verify_password(password: &str, hashed: &str) -> bool {
    verify(password, hashed).unwrap_or(false)
}

// Request and response types
#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub username: String,
    pub email: String,
}

// JWT token claims
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // User ID
    pub exp: usize,  // Expiration time
    pub iat: usize,  // Issued at time
}

// Auth service
pub struct AuthService {
    db: Arc<Database>,
}

impl AuthService {
    pub fn new(db: Database) -> Self {
        Self {
            db: Arc::new(db),
        }
    }
    
    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, StatusCode> {
        // Check if user already exists
        if let Ok(Some(_)) = self.db.get_user_by_email(&req.email).await {
            return Err(StatusCode::CONFLICT);
        }
        
        // Hash the password
        let password_hash = hash_password(&req.password)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
        // Create the user
        let user = self.db.create_user(&req.username, &req.email, &password_hash)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        
        // Create JWT token
        let token = self.create_token(user.id)?;
        
        Ok(AuthResponse {
            token,
            user: UserResponse {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        })
    }
    
    pub async fn login(&self, req: LoginRequest) -> Result<AuthResponse, StatusCode> {
        // Find the user
        let user = self.db.get_user_by_email(&req.email)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
            .ok_or(StatusCode::UNAUTHORIZED)?;
        
        // Verify password
        if !verify_password(&req.password, &user.password_hash) {
            return Err(StatusCode::UNAUTHORIZED);
        }
        
        // Create JWT token
        let token = self.create_token(user.id)?;
        
        Ok(AuthResponse {
            token,
            user: UserResponse {
                id: user.id,
                username: user.username,
                email: user.email,
            },
        })
    }
    
    fn create_token(&self, user_id: Uuid) -> Result<String, StatusCode> {
        // Get JWT secret from environment variable
        let jwt_secret = env::var("JWT_SECRET")
            .unwrap_or_else(|_| "development_secret_key".to_string());
        
        // Get JWT expiry from environment variable or use default (1 day)
        let jwt_expiry: i64 = env::var("JWT_EXPIRY")
            .unwrap_or_else(|_| "86400".to_string())
            .parse()
            .unwrap_or(86400);
        
        // Create JWT claims
        let now = Utc::now();
        let expiry = now + Duration::seconds(jwt_expiry);
        
        let claims = Claims {
            sub: user_id.to_string(),
            exp: expiry.timestamp() as usize,
            iat: now.timestamp() as usize,
        };
        
        // Encode JWT
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(jwt_secret.as_ref()),
        )
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
    
    pub fn validate_token(&self, token: &str) -> Result<Uuid, StatusCode> {
        // Get JWT secret from environment variable
        let jwt_secret = env::var("JWT_SECRET")
            .unwrap_or_else(|_| "development_secret_key".to_string());
        
        // Decode and validate JWT
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(jwt_secret.as_ref()),
            &Validation::default(),
        )
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
        
        // Extract user ID from claims
        let user_id = Uuid::parse_str(&token_data.claims.sub)
            .map_err(|_| StatusCode::UNAUTHORIZED)?;
        
        Ok(user_id)
    }
}

// For extracting the authenticated user from a request
pub struct AuthUser {
    pub user_id: Uuid,
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser 
where
    S: Send + Sync,
    Arc<AppState>: FromRef<S>,
{
    type Rejection = Response;
    
    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // Get the app state
        let app_state = Arc::<AppState>::from_ref(state);
        
        // Get Authorization header
        let auth_header = parts.headers
            .get("Authorization")
            .and_then(|header| header.to_str().ok())
            .ok_or_else(|| {
                (StatusCode::UNAUTHORIZED, "Missing Authorization header").into_response()
            })?;
        
        // Check if it's a Bearer token
        if !auth_header.starts_with("Bearer ") {
            return Err((StatusCode::UNAUTHORIZED, "Invalid token format").into_response());
        }
        
        // Extract the token
        let token = &auth_header[7..]; // Skip "Bearer "
        
        // Validate the token
        match app_state.auth_service.validate_token(token) {
            Ok(user_id) => Ok(AuthUser { user_id }),
            Err(status) => Err(status.into_response()),
        }
    }
}

// Import AppState from web_service
use crate::web_service::AppState; 