#!/bin/bash
# Migration helper script for Railway deployment

# Check if we should skip database operations
if [ "${SQLX_OFFLINE}" = "true" ] && [ -z "${DATABASE_URL}" ]; then
  echo "Running in SQLX_OFFLINE mode without DATABASE_URL. Skipping database operations."
  exit 0
fi

# Function to check if PostgreSQL is available
check_postgres() {
  if PGPASSWORD=${PGPASSWORD} psql -h ${PGHOST:-postgres} -U ${PGUSER:-postgres} -c "SELECT 1" > /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# Function to run SQL files
run_sql_file() {
  local file=$1
  local dbname=${2:-postgres}
  
  echo "Running SQL file: $file"
  PGPASSWORD=${PGPASSWORD} psql -h ${PGHOST:-postgres} -U ${PGUSER:-postgres} -d $dbname -f $file || {
    echo "WARNING: Failed to run $file but continuing..."
    return 1
  }
  return 0
}

# Function to create database if it doesn't exist
create_database_if_not_exists() {
  local dbname=$1
  
  # Check if database exists
  if PGPASSWORD=${PGPASSWORD} psql -h ${PGHOST:-postgres} -U ${PGUSER:-postgres} -lqt | cut -d \| -f 1 | grep -qw $dbname; then
    echo "Database $dbname already exists."
    return 0
  else
    echo "Creating database $dbname..."
    PGPASSWORD=${PGPASSWORD} psql -h ${PGHOST:-postgres} -U ${PGUSER:-postgres} -c "CREATE DATABASE $dbname;" || {
      echo "WARNING: Failed to create database $dbname."
      return 1
    }
    echo "Database $dbname created successfully."
    return 0
  fi
}

# Main function to run migrations
run_migrations() {
  # If DATABASE_URL is not set, try to create it from PGHOST, PGUSER, etc.
  if [ -z "${DATABASE_URL}" ]; then
    echo "DATABASE_URL is not set. Trying to construct from individual parameters..."
    if [ -n "${PGHOST}" ] && [ -n "${PGUSER}" ] && [ -n "${PGPASSWORD}" ]; then
      export DATABASE_URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE:-postgres}"
      echo "Constructed DATABASE_URL: ${DATABASE_URL}"
    else
      echo "ERROR: Cannot construct DATABASE_URL. Missing one or more required parameters."
      # Don't exit here; we'll still try to connect in case other methods work
    fi
  fi

  # Wait for PostgreSQL to be ready
  echo "Waiting for PostgreSQL..."
  for i in {1..30}; do
    if check_postgres; then
      echo "PostgreSQL is ready!"
      break
    fi
    echo "Waiting for PostgreSQL to start... (attempt $i/30)"
    sleep 1
    if [ $i -eq 30 ]; then
      echo "ERROR: PostgreSQL did not become ready in time."
      echo "Continuing without running migrations. Application may still work in offline mode."
      return 1
    fi
  done
  
  # Extract database name from DATABASE_URL
  if [ -n "$DATABASE_URL" ]; then
    DB_NAME=$(echo $DATABASE_URL | sed -E 's/.*\/([^?]*).*/\1/')
    echo "Extracted database name: $DB_NAME"
  else
    DB_NAME=${PGDATABASE:-postgres}
    echo "Using default database name: $DB_NAME"
  fi
  
  # Create database if it doesn't exist
  create_database_if_not_exists $DB_NAME
  
  # Run initialization SQL if available
  if [ -f "/app/migrations/init.sql" ]; then
    echo "Running initialization SQL..."
    run_sql_file "/app/migrations/init.sql" $DB_NAME
  else
    echo "No initialization SQL file found."
  fi
  
  # Run sqlx migrations
  if command -v sqlx &> /dev/null; then
    echo "Running sqlx migrations..."
    export DATABASE_URL=${DATABASE_URL:-postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT:-5432}/${DB_NAME}}
    sqlx migrate run || {
      echo "WARNING: sqlx migrations failed but continuing..."
      return 1
    }
  else
    echo "sqlx command not found, skipping migrations."
    return 1
  fi
  
  echo "Migrations completed successfully."
  return 0
}

# Execute migrations if this script is run directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_migrations || {
    echo "NOTE: Migration failures are non-fatal when SQLX_OFFLINE=true is set"
    echo "Application will continue to start but may have limited functionality"
  }
fi 