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
  # Extract connection details from DATABASE_URL
  if [[ "$DATABASE_URL" =~ postgres://([^:]+):([^@]+)@([^:]+):([0-9]+)/([^?]+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    DB_PASS="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
    
    echo "Trying to connect to PostgreSQL at $DB_HOST:$DB_PORT..."
    
    # Try to connect with SSL for Railway proxy
    if [[ "$DB_HOST" == *"proxy.rlwy.net"* ]]; then
      PGPASSWORD="$DB_PASS" psql "postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=require" -c "SELECT 1" > /dev/null 2>&1
      return $?
    else
      # For non-Railway connections or direct connections
      PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1
      return $?
    fi
  else
    echo "Could not parse DATABASE_URL: $DATABASE_URL"
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

# Add SSL parameter to DATABASE_URL if using Railway proxy and not already specified
if [[ "$DATABASE_URL" == *"proxy.rlwy.net"* ]] && [[ "$DATABASE_URL" != *"sslmode="* ]]; then
  export DATABASE_URL="${DATABASE_URL}?sslmode=require"
  echo "Added sslmode=require to DATABASE_URL for Railway proxy"
fi

# Run database migrations if we have a DATABASE_URL
if [ -n "$DATABASE_URL" ]; then
  echo "Running database migrations..."
  
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