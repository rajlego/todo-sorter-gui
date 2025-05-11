# Build frontend
FROM node:18 AS frontend-builder
WORKDIR /app/frontend

# Copy package files first to leverage Docker caching
COPY web/package*.json ./

# Force Rollup to skip native modules
ENV ROLLUP_SKIP_NODE_RESOLUTION=true

# Install dependencies with npm install (not npm ci)
RUN npm install

# Copy the rest of the frontend code
COPY web/ ./

# Build the frontend
RUN npm run build

# Build backend
FROM rust:slim-bullseye AS backend-builder
WORKDIR /app
COPY . .
RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*
RUN cargo build --release

# Final image
FROM debian:bullseye-slim
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y ca-certificates libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

# Copy the backend binary
COPY --from=backend-builder /app/target/release/sorter /app/sorter

# Copy the frontend static files
COPY --from=frontend-builder /app/frontend/dist /app/static

# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=static

# Expose the port
EXPOSE 3000

# Run the application
CMD ["./sorter", "api"] 