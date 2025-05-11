# Build frontend
FROM node:16-slim AS frontend-builder
WORKDIR /app/frontend
# Install build dependencies needed for native modules
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
# Copy only package files first to leverage Docker caching
COPY web/package*.json ./
RUN npm ci
# Copy the rest of the frontend code
COPY web/ ./
# Build the frontend assets
RUN npm run build

# Build backend
FROM rust:slim-bullseye AS backend-builder
WORKDIR /app
# Install backend dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev
# Copy backend source code
COPY . .
# Build the backend binary
RUN cargo build --release

# Final image
FROM debian:bullseye-slim
WORKDIR /app
# Install runtime dependencies only
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
# Copy the compiled binary from backend builder
COPY --from=backend-builder /app/target/release/sorter /app/
# Copy static frontend files from frontend builder
COPY --from=frontend-builder /app/frontend/dist /app/static
# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=static
# Expose the port
EXPOSE 3000
# Run the application
CMD ["./sorter", "api"] 