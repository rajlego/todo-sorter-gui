#!/bin/bash
# Script to link PostgreSQL database to the web service on Railway

# Ensure the railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway if needed
if ! railway whoami &> /dev/null; then
    echo "Not logged in to Railway. Please login."
    railway login
fi

# Check current project status
echo "Checking current project status..."
railway status

# Get the PostgreSQL service name
echo "Finding PostgreSQL service..."
POSTGRES_SERVICE=$(railway service | grep -i postgres | head -n 1)

if [ -z "$POSTGRES_SERVICE" ]; then
    echo "No PostgreSQL service found. Adding one..."
    railway add -d postgres
    POSTGRES_SERVICE=$(railway service | grep -i postgres | head -n 1)
    
    if [ -z "$POSTGRES_SERVICE" ]; then
        echo "Failed to create PostgreSQL service. Exiting."
        exit 1
    fi
    
    echo "Created PostgreSQL service: $POSTGRES_SERVICE"
fi

# Get the web service name
echo "Finding web service..."
WEB_SERVICE=$(railway service | grep -i web | head -n 1)

if [ -z "$WEB_SERVICE" ]; then
    echo "No web service found. Creating one from the Dockerfile..."
    railway add
    WEB_SERVICE=$(railway service | grep -v postgres | head -n 1)
    
    if [ -z "$WEB_SERVICE" ]; then
        echo "Failed to create web service. Exiting."
        exit 1
    fi
    
    echo "Created web service: $WEB_SERVICE"
fi

# Get the DATABASE_URL variable from the PostgreSQL service
echo "Getting PostgreSQL database URL..."
railway variables --kv | grep DATABASE_URL

# Set the web service as the current service
echo "Setting web service as current service..."
railway service "$WEB_SERVICE"

# Check if the DATABASE_URL is already set for the web service
WEB_DB_URL=$(railway variables --kv | grep DATABASE_URL)

if [ -n "$WEB_DB_URL" ]; then
    echo "DATABASE_URL is already set for the web service: $WEB_DB_URL"
else
    # Get the DATABASE_URL from the PostgreSQL service
    echo "Switching to PostgreSQL service to get DATABASE_URL..."
    railway service "$POSTGRES_SERVICE"
    POSTGRES_DB_URL=$(railway variables --kv | grep DATABASE_URL= | cut -d= -f2-)
    
    if [ -z "$POSTGRES_DB_URL" ]; then
        echo "Could not get DATABASE_URL from PostgreSQL service. Exiting."
        exit 1
    fi
    
    # Switch back to web service and set the DATABASE_URL
    echo "Switching back to web service and setting DATABASE_URL..."
    railway service "$WEB_SERVICE"
    railway variables set DATABASE_URL="$POSTGRES_DB_URL"
    
    # Also set SQLX_OFFLINE for development convenience
    railway variables set SQLX_OFFLINE="true"
    railway variables set PORT="3000"
    railway variables set STATIC_DIR="/app/web/dist"
    
    echo "Successfully set DATABASE_URL for the web service."
fi

# Deploy the web service
echo "Deploying the web service..."
railway up --service "$WEB_SERVICE"

# Open the web service in the browser
echo "Opening the web service in the browser..."
railway open

echo "Done! Your web service is now linked to the PostgreSQL database." 