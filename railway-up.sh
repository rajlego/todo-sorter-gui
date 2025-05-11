#!/bin/bash

# Railway deployment script
echo "Preparing to deploy to Railway..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway (if needed)
railway login

# Verify we have all necessary files
if [ ! -f "Cargo.toml" ]; then
    echo "Error: Cargo.toml not found"
    exit 1
fi

if [ ! -f "Dockerfile" ]; then
    echo "Error: Dockerfile not found"
    exit 1
fi

if [ ! -f "sqlx-data.json" ]; then
    echo "Warning: sqlx-data.json not found. Deployment might fail."
fi

if [ ! -d ".cargo" ]; then
    echo "Creating .cargo directory with config.toml for SQLx offline mode"
    mkdir -p .cargo
    echo '[env]
SQLX_OFFLINE = "true"' > .cargo/config.toml
fi

# Ensure we have a proper .dockerignore
if [ ! -f ".dockerignore" ]; then
    echo "Creating .dockerignore file"
    echo "# Version control
.git/
.gitignore

# Build output
/target/
/web/dist/
/web/node_modules/
/node_modules/

# Development files
*.log
*.png
*.jpg
*.jpeg
.vscode/
.cursor/
.idea/

# Don't ignore these
!Cargo.lock
!Cargo.toml
!web/package.json
!web/yarn.lock
!web/package-lock.json" > .dockerignore
fi

# Set environment variables for Railway deployment
echo "Setting up environment variables in Railway..."

# Deploy to Railway
echo "Deploying to Railway..."
railway up

echo "Deployment complete! Check Railway dashboard for status." 