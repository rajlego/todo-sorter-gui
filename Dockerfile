# Single-stage build for simplicity
FROM debian:bullseye

# Install dependencies
RUN apt-get update && \
    apt-get install -y curl gnupg ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install Rust
RUN apt-get update && \
    apt-get install -y wget build-essential pkg-config libssl-dev && \
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y && \
    rm -rf /var/lib/apt/lists/*

# Add Rust to PATH
ENV PATH="/root/.cargo/bin:${PATH}"

# Set working directory
WORKDIR /app

# Copy the entire project
COPY . .

# Force create package-lock.json locally before build on container
WORKDIR /app/web
# We use npm install instead of npm ci to handle any discrepancies in package-lock.json
RUN npm install
# Build the frontend 
RUN npm run build

# Build the Rust backend
WORKDIR /app
RUN cargo build --release

# Create a directory for the static files and copy the built frontend
RUN mkdir -p /app/static
RUN cp -r /app/web/dist/* /app/static/

# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=static

# Expose the port
EXPOSE 3000

# Run the application
CMD ["./target/release/sorter", "api"] 