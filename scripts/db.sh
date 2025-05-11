#!/bin/bash

# Database operations script for the todo-sorter application

set -e

# Load environment variables
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set."
  echo "Please create a .env file with DATABASE_URL or set it manually."
  exit 1
fi

# Command line argument
CMD=$1

case $CMD in
  create)
    echo "Creating database..."
    # Extract database name from DATABASE_URL
    DB_NAME=$(echo $DATABASE_URL | sed -e 's/.*\///')
    
    if [ -z "$DB_NAME" ]; then
      echo "Error: Could not extract database name from DATABASE_URL."
      exit 1
    fi
    
    # Create the database
    createdb $DB_NAME || echo "Database already exists or could not be created."
    echo "Database creation attempted."
    ;;
    
  migrate)
    echo "Running migrations..."
    # Create migrations directory if it doesn't exist
    mkdir -p migrations
    
    # Check if there are migration files
    if [ ! "$(ls -A migrations)" ]; then
      echo "No migration files found in migrations directory."
      exit 1
    fi
    
    # Run each SQL file in the migrations directory
    for file in migrations/*.sql; do
      echo "Applying migration: $file"
      psql $DATABASE_URL -f $file
    done
    echo "Migrations completed."
    ;;
    
  reset)
    echo "Resetting database..."
    # Extract database name from DATABASE_URL
    DB_NAME=$(echo $DATABASE_URL | sed -e 's/.*\///')
    
    if [ -z "$DB_NAME" ]; then
      echo "Error: Could not extract database name from DATABASE_URL."
      exit 1
    fi
    
    # Drop and recreate the database
    dropdb --if-exists $DB_NAME
    createdb $DB_NAME
    
    # Run migrations
    $0 migrate
    echo "Database reset completed."
    ;;
    
  *)
    echo "Usage: $0 <command>"
    echo "Commands:"
    echo "  create  - Create the database"
    echo "  migrate - Run all migrations"
    echo "  reset   - Reset the database (drop, create, migrate)"
    exit 1
    ;;
esac

exit 0 