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

# Railway networking startup delay - give internal services time to be fully available
echo "Waiting for 10 seconds to allow network services to fully initialize..."
sleep 10

# Inspect environment
echo "Current Railway environment:"
echo "RAILWAY_ENVIRONMENT: ${RAILWAY_ENVIRONMENT:-not set}"
echo "RAILWAY_PROJECT_ID: ${RAILWAY_PROJECT_ID:-not set}"
echo "RAILWAY_SERVICE_ID: ${RAILWAY_SERVICE_ID:-not set}"

# Check for linked database details
echo "PostgreSQL environment variables:"
echo "PGUSER: ${PGUSER:-not set}"
echo "PGHOST: ${PGHOST:-not set}"
echo "PGPORT: ${PGPORT:-not set}"
echo "PGDATABASE: ${PGDATABASE:-not set}"
echo "PGPASSWORD is ${PGPASSWORD:+set}"

# Explicitly build DATABASE_URL for Railway's internal network
if [ -n "$PGUSER" ] && [ -n "$PGPASSWORD" ] && [ -n "$PGHOST" ] && [ -n "$PGPORT" ] && [ -n "$PGDATABASE" ]; then
  echo "Building DATABASE_URL from PostgreSQL component variables"
  echo "Using Railway internal network: PGHOST=$PGHOST, PGPORT=$PGPORT, PGDATABASE=$PGDATABASE"
  
  # Create a precise connection string optimized for Railway internal network
  export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?connect_timeout=30&application_name=todo-sorter"
  echo "DATABASE_URL set from component parts (credentials hidden)"
  
  # Ensure SQLX_OFFLINE is disabled
  export SQLX_OFFLINE=false
  echo "SQLX_OFFLINE=false (allowing live database connections)"
  
  # Force connection parameters - these will override DATABASE_URL in our application code
  export PG_FORCE_DIRECT_CONNECTION=true
  echo "PG_FORCE_DIRECT_CONNECTION=true (prioritizing direct PG* variables)"
fi

# Check for linked PostgreSQL database via Railway service linking
if [ -n "$DATABASE_URL" ]; then
  echo "Using DATABASE_URL environment variable"
  # Make sure SQLX_OFFLINE is disabled since we have a real database URL
  export SQLX_OFFLINE=false
else
  echo "WARNING: No database connection found. Application will run in memory-only mode."
  echo "Data will not be persisted across restarts."
  export SQLX_OFFLINE=true
fi

# Network connectivity debugging
if [ -n "$DATABASE_URL" ]; then
  # Extract host and port from the connection string
  if [[ "$DATABASE_URL" =~ .*@([^:]+):([0-9]+)/?.* ]]; then
    DB_HOST="${BASH_REMATCH[1]}"
    DB_PORT="${BASH_REMATCH[2]}"
    echo "Database configured at $DB_HOST:$DB_PORT"
    
    # Check DNS resolution first - this is the most critical for Railway's internal network
    if command -v getent &> /dev/null; then
      echo "Checking hostname resolution with getent..."
      getent hosts "$DB_HOST" || {
        echo "WARNING: Failed to resolve database hostname with getent. This is required for Railway's internal network to work."
        echo "This suggests a networking issue between services. Check that services are in the same Railway project/environment."
      }
    else
      echo "getent not available, using other methods for DNS resolution..."
      
      # Try to ping the host if we have ping
      if command -v ping &> /dev/null; then
        echo "Checking if database host is reachable via ping..."
        ping -c 1 "$DB_HOST" || echo "WARNING: Could not ping database host. This might be normal if ICMP is blocked."
      fi
      
      # Check DNS resolution with nslookup if available
      if command -v nslookup &> /dev/null; then
        echo "Checking DNS resolution for database host with nslookup..."
        nslookup "$DB_HOST" || echo "WARNING: Could not resolve database hostname with nslookup."
      fi
    fi
    
    # Check raw TCP connection with timeout
    if command -v nc &> /dev/null; then
      echo "Testing TCP connection to PostgreSQL..."
      timeout 5 nc -vz "$DB_HOST" "$DB_PORT" || echo "WARNING: Could not establish TCP connection to PostgreSQL."
    elif command -v telnet &> /dev/null; then
      echo "Testing TCP connection with telnet..."
      echo quit | timeout 5 telnet "$DB_HOST" "$DB_PORT" || echo "WARNING: Could not establish TCP connection to PostgreSQL with telnet."
    else
      echo "Neither nc nor telnet commands available for TCP testing."
    fi
    
    # Try running psql for direct connection test if available
    if command -v psql &> /dev/null; then
      echo "Testing direct PostgreSQL connection with psql..."
      PGCONNECT_TIMEOUT=5 psql -c "SELECT 1;" || echo "WARNING: Could not connect to PostgreSQL with psql."
    fi
    
    # Give the database a little more time to be fully ready
    echo "Waiting an additional 5 seconds for database to be fully ready..."
    sleep 5
  else
    echo "Could not parse database host and port from DATABASE_URL."
    # Print just the protocol and host part of the URL (hide credentials)
    if [[ "$DATABASE_URL" =~ (postgresql://)[^@]+@([^/]+) ]]; then
      echo "DATABASE_URL format: ${BASH_REMATCH[1]}******@${BASH_REMATCH[2]}"
    else
      echo "DATABASE_URL has unexpected format"
    fi
  fi
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

# Print environment variables for debugging
echo "Environment variables:"
echo "PORT=${PORT}"
echo "STATIC_DIR=${STATIC_DIR}"
echo "SQLX_OFFLINE=${SQLX_OFFLINE}"
echo "DATABASE_URL format: $(echo $DATABASE_URL | sed -E 's/(postgresql:\/\/)[^@]+@/\1****@/')"
echo "PGUSER=${PGUSER:-not set}"
echo "PGHOST=${PGHOST:-not set}"
echo "PGPORT=${PGPORT:-not set}"
echo "PGDATABASE=${PGDATABASE:-not set}"
echo "PGPASSWORD is ${PGPASSWORD:+set}"
echo "RAILWAY_ENVIRONMENT=${RAILWAY_ENVIRONMENT:-not set}"
echo "RAILWAY_PROJECT_ID=${RAILWAY_PROJECT_ID:-not set}"

# Start the application
echo "Starting Todo Sorter API..."
echo "Using static directory: $STATIC_DIR"
STATIC_DIR="$STATIC_DIR" $SORTER_BIN api 