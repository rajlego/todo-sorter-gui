# Todo Sorter

A collaborative markdown-based todo list application with task prioritization using pairwise comparisons.

## Features

- Authentication with JWT
- Multiple markdown files per user
- Real-time collaborative editing with WebSockets
- Task prioritization through pairwise comparisons
- PostgreSQL database for persistence
- Version history tracking

## Tech Stack

- **Backend**: Rust with Axum web framework
- **Frontend**: React with TypeScript
- **Database**: PostgreSQL
- **Real-time**: WebSockets
- **Authentication**: JWT
- **Deployment**: Railway

## Local Development

### Prerequisites

- Rust (latest stable)
- Node.js (v18 or later)
- PostgreSQL
- Docker (optional, for easy development)

### Quick Start with Docker

We provide a Docker Compose setup and helper script for easy development:

```bash
# Start the entire application stack with Docker
./dev.sh docker-up

# Stop the application
./dev.sh docker-down
```

### Manual Environment Setup

1. Clone the repository
2. Create a `.env` file in the root directory with the following:

```
# Database connection string (for PostgreSQL)
DATABASE_URL=postgres://postgres:password@localhost:5432/todo_sorter

# Server configuration
PORT=3000
STATIC_DIR=web/dist

# JWT configuration (for authentication)
JWT_SECRET=development_secret_key_replace_in_production
JWT_EXPIRY=86400
```

3. Create a PostgreSQL database:

```bash
createdb todo_sorter
```

Or use Docker:

```bash
./dev.sh start
```

4. Run database migrations:

```bash
cargo install sqlx-cli --no-default-features --features postgres
sqlx migrate run
```

Or use the helper script:

```bash
./dev.sh migrate
```

5. Install frontend dependencies and build:

```bash
cd web
npm install
npm run build
```

Or use the helper script:

```bash
./dev.sh build-front
```

6. Run the backend:

```bash
cargo run -- api
```

Or use the helper script:

```bash
./dev.sh run
```

7. Access the application at `http://localhost:3000`

## Deploying to Railway

### Step 1: Set Up a Railway Account

Sign up at [Railway](https://railway.app) if you haven't already.

### Step 2: Create a New Project

1. Click on "New Project" in the Railway dashboard
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account and select the repository

### Step 3: Add a PostgreSQL Database

1. Click on "New" and select "Database" → "PostgreSQL"
2. Once created, Railway will automatically set the `DATABASE_URL` environment variable for your app

### Step 4: Configure Environment Variables

1. Go to your project settings in the Railway dashboard
2. Add the following environment variables:
   - `JWT_SECRET`: A secure random string for JWT encryption (generate one with `openssl rand -hex 32`)
   - `JWT_EXPIRY`: Token expiry in seconds (e.g., 86400 for 1 day)
   - `STATIC_DIR`: `/app/web/dist` (already set in railway.toml)
   - `PORT`: `3000` (already set in railway.toml)

### Step 5: Deploy

Railway will automatically detect the `railway.toml` file and Dockerfile, and deploy your application.

To deploy manually:

```bash
npm install -g @railway/cli
railway login
railway up
```

### Step 6: Access Your Deployed Application

Once deployed, Railway will provide a URL to access your application.

## Troubleshooting Deployment

### Database Connection Issues

If your app fails to connect to the database on Railway:

1. Double-check the `DATABASE_URL` is being set by Railway properly
2. Verify that the PostgreSQL service is running 
3. Check the database migration logs in the Railway dashboard
4. Make sure the wait script in the Dockerfile is working correctly

### Build Failures

If you encounter build failures:

1. Check if your Dockerfile is using the correct base image (Debian-based preferred over Alpine)
2. Make sure all necessary tools are installed in the Docker image
3. Check that the build process can access all dependencies

### Runtime Issues

For runtime issues:

1. Check the application logs in the Railway dashboard
2. Verify that all environment variables are set correctly
3. Make sure the frontend build is included in the deployment

## Database Schema

The application uses the following database schema:

- `users`: User accounts with authentication
- `markdown_files`: Markdown files owned by users
- `tasks`: Tasks extracted from markdown files
- `comparisons`: Pairwise comparisons between tasks
- `file_versions`: Version history for markdown files

## API Reference

- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: Login and get JWT token
- `POST /api/files`: Create a new markdown file
- `GET /api/files/:file_id`: Get a markdown file
- `POST /api/files/:file_id`: Update a markdown file
- `GET /api/files/:file_id/tasks`: Get tasks from a file
- `GET /api/files/:file_id/comparisons`: Get comparisons for a file
- `POST /api/files/:file_id/comparisons`: Add a new comparison
- `GET /api/files/:file_id/sync`: WebSocket endpoint for real-time collaboration
- `GET /api/health`: Health check endpoint

## License

MIT 