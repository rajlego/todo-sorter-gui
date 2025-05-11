# Use a Debian-based Rust image for better compatibility
FROM rust:slim-bullseye

# Install Node.js, npm, and other dependencies
RUN apt-get update && \
    apt-get install -y curl ca-certificates pkg-config libssl-dev gnupg postgresql-client && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y build-essential python3 make g++ && \
    npm install -g yarn && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install SQLx CLI for database migrations
RUN cargo install sqlx-cli --no-default-features --features postgres

# Set the working directory
WORKDIR /app

# Create .cargo directory with config for SQLx offline mode
RUN mkdir -p .cargo && \
    echo '[env]\nSQLX_OFFLINE = "true"' > .cargo/config.toml

# Copy the entire application
COPY . .

# Make migration script executable
RUN chmod +x migration-helper.sh || echo "No migration helper script found"

# Generate Cargo.lock if it doesn't exist
RUN if [ ! -f "Cargo.lock" ]; then \
    echo "Cargo.lock not found, generating it..." && \
    cargo generate-lockfile; \
fi

# Install frontend dependencies
WORKDIR /app/web
RUN yarn install || npm install

# Build the frontend
RUN yarn build || npm run build

# Build the backend with SQLx offline mode explicitly set
WORKDIR /app
ENV SQLX_OFFLINE=true
RUN cargo build --release

# Create a script to run migrations and start the app
RUN echo '#!/bin/bash\n\
set -e\n\
\n\
# Print debug info\n\
echo "=== Deployment Environment Info ==="\n\
echo "DATABASE_URL: ${DATABASE_URL:-Not set}"\n\
echo "SQLX_OFFLINE: ${SQLX_OFFLINE:-Not set}"\n\
echo "PORT: ${PORT:-Not set}"\n\
echo "STATIC_DIR: ${STATIC_DIR:-Not set}"\n\
echo "PGHOST: ${PGHOST:-Not set}"\n\
echo "PGUSER: ${PGUSER:-Not set}"\n\
\n\
# Check if we have DATABASE_URL\n\
if [ -z "${DATABASE_URL}" ]; then\n\
  echo "WARNING: DATABASE_URL is not set. Using fallback connection parameters."\n\
  # Try to construct a DATABASE_URL from separate parameters if available\n\
  if [ -n "${PGHOST}" ] && [ -n "${PGUSER}" ] && [ -n "${PGPASSWORD}" ]; then\n\
    export DATABASE_URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE:-postgres}"\n\
    echo "Constructed DATABASE_URL from parameters"\n\
  fi\n\
fi\n\
\n\
# Run migrations using the helper script if it exists\n\
if [ -f "/app/migration-helper.sh" ]; then\n\
  echo "Running migrations using helper script..."\n\
  /app/migration-helper.sh\n\
else\n\
  echo "Migration helper script not found, using fallback migration process."\n\
  # Fallback: Wait for PostgreSQL and run migrations directly\n\
  # Wait for PostgreSQL to be ready\n\
  echo "Waiting for PostgreSQL..."\n\
  for i in {1..30}; do\n\
    if PGPASSWORD=${PGPASSWORD} psql -h ${PGHOST:-postgres} -U ${PGUSER:-postgres} -c "SELECT 1" > /dev/null 2>&1; then\n\
      echo "PostgreSQL is ready!"\n\
      break\n\
    fi\n\
    echo "Waiting for PostgreSQL to start... (attempt $i/30)"\n\
    sleep 1\n\
    if [ $i -eq 30 ]; then\n\
      echo "ERROR: PostgreSQL did not become ready in time."\n\
      # Continue anyway, migrations will fail but app might still work in offline mode\n\
    fi\n\
  done\n\
\n\
  # Check if init.sql exists and run it first if DATABASE_URL is set\n\
  if [ -n "$DATABASE_URL" ] && [ -f "/app/migrations/init.sql" ]; then\n\
    echo "Running initialization SQL..."\n\
    PGPASSWORD=${PGPASSWORD} psql -h ${PGHOST:-postgres} -U ${PGUSER:-postgres} -d ${PGDATABASE:-postgres} -f /app/migrations/init.sql || {\n\
      echo "WARNING: Failed to run init.sql but continuing..."\n\
    }\n\
  fi\n\
\n\
  # Run database migrations if DATABASE_URL is set\n\
  if [ -n "$DATABASE_URL" ]; then\n\
    echo "Running database migrations..."\n\
    sqlx migrate run || {\n\
      echo "WARNING: Migrations failed but continuing..."\n\
    }\n\
  else\n\
    echo "Skipping migrations as DATABASE_URL is not set"\n\
  fi\n\
fi\n\
\n\
# Start the application\n\
echo "Starting application..."\n\
exec /app/target/release/sorter api\n\
' > /app/start.sh && chmod +x /app/start.sh

# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=/app/web/dist
ENV SQLX_OFFLINE=true

# Expose the port
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run the application with migrations
CMD ["/app/start.sh"] 