#!/bin/bash

# Development helper script for todo-sorter

function show_help {
  echo "Todo Sorter Development Helper"
  echo ""
  echo "Usage: $0 [command]"
  echo ""
  echo "Commands:"
  echo "  start          Start PostgreSQL database with Docker"
  echo "  stop           Stop PostgreSQL container"
  echo "  migrate        Run database migrations"
  echo "  build-front    Build the frontend"
  echo "  run            Run the application in development mode"
  echo "  docker-up      Start the full application stack with Docker Compose"
  echo "  docker-down    Stop the Docker Compose stack"
  echo "  help           Show this help message"
  echo ""
}

case "$1" in
  start)
    echo "Starting PostgreSQL container..."
    docker run --name todo_sorter_db -e POSTGRES_PASSWORD=password -e POSTGRES_USER=postgres -e POSTGRES_DB=todo_sorter -p 5432:5432 -d postgres:15
    echo "PostgreSQL is running on port 5432"
    ;;
    
  stop)
    echo "Stopping PostgreSQL container..."
    docker stop todo_sorter_db
    docker rm todo_sorter_db
    echo "PostgreSQL container stopped and removed"
    ;;
    
  migrate)
    echo "Running database migrations..."
    cargo install sqlx-cli --no-default-features --features postgres || true
    sqlx migrate run
    ;;
    
  build-front)
    echo "Building frontend..."
    cd web && npm install && npm run build
    ;;
    
  run)
    echo "Running application..."
    cargo run -- api
    ;;
    
  docker-up)
    echo "Starting application with Docker Compose..."
    docker-compose up -d
    echo "Application is running at http://localhost:3000"
    ;;
    
  docker-down)
    echo "Stopping Docker Compose stack..."
    docker-compose down
    ;;
    
  *)
    show_help
    ;;
esac 