#!/bin/bash
# Migration helper script for Railway deployment

# Exit on error
set -e

echo "=== Database Migration Helper ==="
echo "DATABASE_URL: ${DATABASE_URL:-Not set}"
echo "SQLX_OFFLINE: ${SQLX_OFFLINE:-Not set}"

# Check if we should skip database operations entirely
if [ "${SQLX_OFFLINE}" = "true" ]; then
  echo "Running in SQLX_OFFLINE mode. Skipping database operations completely."
  echo "The application will start, but database-dependent features will not work."
  echo "Migration helper script completed."
  exit 0
fi

# Only run if SQLX_OFFLINE is not enabled
if [ -n "$DATABASE_URL" ]; then
  echo "WARNING: Attempting database migrations, but this might fail if SSL/TLS is required and not supported."
  echo "Consider setting SQLX_OFFLINE=true to skip database operations."
  
  # Try to run migrations once
  echo "Running database migrations with DATABASE_URL=$DATABASE_URL"
  sqlx migrate run || {
    echo "WARNING: Migrations failed. This is expected if SSL/TLS is required but not supported."
    echo "The application will continue to start, but database-dependent features may not work."
  }
else
  echo "No DATABASE_URL set. Skipping migrations."
fi

echo "Migration helper script completed."
exit 0 