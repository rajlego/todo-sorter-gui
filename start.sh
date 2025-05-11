#!/bin/bash
set -e

# Create static directory if it doesn't exist
mkdir -p /app/static

# Try to find web/dist and copy if it exists
if [ -d "web/dist" ]; then
  echo "Found web/dist directory, copying to /app/static"
  cp -r web/dist/* /app/static/
fi

# If static directory is empty and web/dist doesn't exist, create a minimal index.html
if [ -z "$(ls -A /app/static)" ]; then
  echo "Static directory is empty, creating minimal index.html"
  echo '<html><head><title>Todo Sorter</title></head><body><h1>Todo Sorter API</h1><p>Frontend not found. Please check your deployment configuration.</p></body></html>' > /app/static/index.html
fi

# Start the application
echo "Starting Todo Sorter API..."
SQLX_OFFLINE=true STATIC_DIR=/app/static ./target/release/sorter api 