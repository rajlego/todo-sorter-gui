FROM debian:bullseye-slim as builder

# Install dependencies
RUN apt-get update && \
    apt-get install -y curl ca-certificates pkg-config libssl-dev gnupg build-essential python3 make g++ && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g yarn && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install rustup and Rust 1.82
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.82.0 && \
    echo 'source $HOME/.cargo/env' >> $HOME/.bashrc

# Add cargo to path
ENV PATH="/root/.cargo/bin:${PATH}"

# Set the working directory
WORKDIR /app

# Copy the entire project
COPY . .

# Build the web frontend
WORKDIR /app/web
RUN yarn install
RUN yarn build
RUN rm -f package-lock.json

# Go back to the app directory and build the Rust application
WORKDIR /app

# Create static directory from web/dist
RUN mkdir -p static && cp -r web/dist/* static/

# Enable SQLx offline mode
ENV SQLX_OFFLINE=true

# Build the application
RUN RUSTFLAGS="-C target-cpu=generic" cargo build --release

# Set up the runtime container
FROM debian:bullseye-slim

# Install runtime dependencies
RUN apt-get update && \
    apt-get install -y ca-certificates libssl-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy the built artifacts
COPY --from=builder /app/target/release/sorter /app/sorter
COPY --from=builder /app/static /app/static
COPY --from=builder /app/migrations /app/migrations
COPY --from=builder /app/.sqlx /app/.sqlx

# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=static
ENV SQLX_OFFLINE=true

# Expose the port
EXPOSE 3000

# Run the application
CMD ["/app/sorter", "api"] 