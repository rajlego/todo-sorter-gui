#!/bin/bash
# Script to link PostgreSQL database to the web service on Railway

# Ensure the railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "Railway CLI not found. Installing..."
    npm install -g @railway/cli
fi

# Login to Railway (if needed)
echo "Logging in to Railway..."
railway login

# Get current Railway project
echo "Getting current project..."
CURRENT_PROJECT=$(railway project)
if [ $? -ne 0 ]; then
    echo "No Railway project found. Please create one or select an existing project first."
    echo "Run: railway project"
    exit 1
fi

# List services in the project
echo "Available services in the project:"
railway service list

# Get PostgreSQL service
POSTGRES_SERVICE=$(railway service list | grep -i postgres | head -n 1 | awk '{print $1}')
if [ -z "$POSTGRES_SERVICE" ]; then
    echo "No PostgreSQL service found. Please create one first."
    echo "Run: railway add --plugin postgresql"
    exit 1
fi

# Get web service
WEB_SERVICE=$(railway service list | grep -i -v postgres | head -n 1 | awk '{print $1}')
if [ -z "$WEB_SERVICE" ]; then
    echo "No web service found. Please deploy your web service first."
    exit 1
fi

echo "Found PostgreSQL service: $POSTGRES_SERVICE"
echo "Found web service: $WEB_SERVICE"

# Link PostgreSQL variables to web service
echo "Linking PostgreSQL variables to web service..."
echo "This will set DATABASE_URL and other PostgreSQL variables in your web service."

# Get PostgreSQL connection details
DATABASE_URL=$(railway variables get DATABASE_URL --service "$POSTGRES_SERVICE" 2>/dev/null)
if [ -z "$DATABASE_URL" ]; then
    echo "Could not get DATABASE_URL from PostgreSQL service."
    echo "Please check if the PostgreSQL service is properly deployed."
    exit 1
fi

# Set DATABASE_URL in web service
echo "Setting DATABASE_URL in web service..."
railway variables set DATABASE_URL="$DATABASE_URL" --service "$WEB_SERVICE"

echo "Successfully linked PostgreSQL to web service."
echo "Your application should now be able to connect to the database using the DATABASE_URL environment variable."
echo ""
echo "If needed, you can deploy the web service again with:"
echo "railway up --service $WEB_SERVICE" 