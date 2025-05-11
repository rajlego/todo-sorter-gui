#!/bin/bash
set -e

echo "Current directory: $(pwd)"
echo "Listing files and directories:"
ls -la

# Set a default static directory if not using absolute path
STATIC_DIR=${STATIC_DIR:-/app/static}

# Create static directory if it doesn't exist
mkdir -p "$STATIC_DIR"
echo "Created static directory: $STATIC_DIR"

# Check if we have a static directory in the current location
if [ -d "static" ]; then
  echo "Found local static directory, copying to $STATIC_DIR"
  cp -r static/* "$STATIC_DIR/" || echo "Warning: No files to copy from static/"
fi

# If static directory is empty, create a minimal index.html
if [ -z "$(ls -A "$STATIC_DIR")" ]; then
  echo "Static directory is empty, creating minimal index.html"
  echo '<html><head><title>Todo Sorter</title></head><body><h1>Todo Sorter API</h1><p>Frontend not found. Please check your deployment configuration.</p></body></html>' > "$STATIC_DIR/index.html"
fi

# Make the sorter binary executable if needed
chmod +x ./target/release/sorter 2>/dev/null || true

# Check if we need to use target/release or direct executable
if [ -f "./target/release/sorter" ]; then
  echo "Found sorter in target/release"
  SORTER_BIN="./target/release/sorter"
elif [ -f "./sorter" ]; then
  echo "Found sorter in current directory"
  SORTER_BIN="./sorter"
else
  echo "ERROR: Could not find sorter binary"
  exit 1
fi

# Start the application
echo "Starting Todo Sorter API..."
echo "Using static directory: $STATIC_DIR"
SQLX_OFFLINE=true STATIC_DIR="$STATIC_DIR" $SORTER_BIN api 