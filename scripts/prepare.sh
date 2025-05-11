#!/bin/bash
set -e

# Ensure DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "DATABASE_URL must be set"
    exit 1
fi

# Generate query metadata
echo "Generating SQLx query metadata for offline mode..."
cargo sqlx prepare -- --lib

echo "Done! SQLx can now be used in offline mode." 