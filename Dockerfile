# Build frontend
FROM node:18-slim AS frontend-builder
WORKDIR /app/frontend
# Install build dependencies needed for native modules
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Build backend
FROM rust:slim-bullseye AS backend-builder
WORKDIR /app
COPY . .
# Exclude node_modules and frontend build from backend context
COPY --from=frontend-builder /app/frontend/dist /app/static
RUN apt-get update && apt-get install -y pkg-config libssl-dev
RUN cargo build --release

# Final image
FROM debian:bullseye-slim
WORKDIR /app
# Install dependencies for the runtime
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
# Copy the compiled binary
COPY --from=backend-builder /app/target/release/sorter /app/
# Copy static frontend files
COPY --from=frontend-builder /app/frontend/dist /app/static
# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=static
# Expose the port
EXPOSE 3000
# Run the application
CMD ["./sorter", "api"] 