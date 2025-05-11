#!/bin/bash
# Migration helper script for Railway deployment

# Exit on error
set -e

echo "=== Database Migration Helper ==="
echo "DATABASE_URL: ${DATABASE_URL:-Not set}"
echo "SQLX_OFFLINE: ${SQLX_OFFLINE:-Not set}"

# Check if we should skip database operations
if [ "${SQLX_OFFLINE}" = "true" ] && [ -z "${DATABASE_URL}" ]; then
  echo "Running in SQLX_OFFLINE mode without DATABASE_URL. Skipping database operations."
  exit 0
fi

# Function to check if PostgreSQL is available using DATABASE_URL
check_postgres() {
  if [ -n "$DATABASE_URL" ]; then
    echo "Trying to connect to PostgreSQL..."
    
    # Extract host and port using basic string manipulation instead of regex
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\).*/\1/p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
    DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\).*/\1/p')
    DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')
    
    echo "Extracted: Host=$DB_HOST, Port=$DB_PORT, User=$DB_USER, DB=$DB_NAME"
    
    # Try a simple connection test
    if PGPASSWORD=${PGPASSWORD} psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
      return 0
    else
      echo "Connection failed. Trying without SSL..."
      # Try without SSL
      if PGPASSWORD=${PGPASSWORD} psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
        return 0
      fi
      return 1
    fi
  else
    echo "No DATABASE_URL provided."
    return 1
  fi
}

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to start..."
for i in {1..30}; do
  if check_postgres; then
    echo "PostgreSQL is ready!"
    break
  fi
  
  if [ $i -eq 30 ]; then
    echo "ERROR: PostgreSQL did not become ready in time."
    echo "The application will continue to start, but database functions may not work correctly."
    # Don't exit, let the app try to run anyway as it may be in SQLX_OFFLINE mode
  else
    echo "Waiting for PostgreSQL to start... (attempt $i/30)"
    sleep 2
  fi
done

# Remove SSL parameter from DATABASE_URL if it's causing issues
# Railway requires SSL but our SQLx might be built without TLS support
if [[ "$DATABASE_URL" == *"sslmode=require"* ]]; then
  export DATABASE_URL=$(echo "$DATABASE_URL" | sed 's/?sslmode=require//')
  echo "Removed sslmode=require from DATABASE_URL to work around TLS support issues"
elif [[ "$DATABASE_URL" == *"proxy.rlwy.net"* ]] && [[ "$DATABASE_URL" != *"sslmode="* ]]; then
  # Don't add SSL requirement, as our SQLx might be built without TLS support
  echo "Using Railway proxy without SSL requirement (SQLx may lack TLS support)"
fi

# Run database migrations if we have a DATABASE_URL
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations with DATABASE_URL=$DATABASE_URL"
  
  # Try to run migrations with multiple attempts
  for i in {1..3}; do
    if sqlx migrate run; then
      echo "Migrations completed successfully!"
      break
    fi
    
    if [ $i -eq 3 ]; then
      echo "WARNING: Migrations failed after 3 attempts."
      echo "The application will continue to start, but may not function correctly."
    else
      echo "Migration attempt $i failed. Retrying in 5 seconds..."
      sleep 5
    fi
  done
else
  echo "No DATABASE_URL set. Skipping migrations."
fi

echo "Migration helper script completed."
exit 0 