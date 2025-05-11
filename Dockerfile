# Use a single base image with both Node.js and Rust
FROM rust:slim-bullseye

# Install Node.js
RUN apt-get update && \
    apt-get install -y curl ca-certificates pkg-config libssl-dev gnupg && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    apt-get install -y build-essential python3 make g++ && \
    npm install -g yarn && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the entire project
COPY . .

# Build the frontend first
WORKDIR /app/web
RUN yarn install || npm install
RUN yarn build || npm run build

# Build the backend
WORKDIR /app
RUN cargo build --release

# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=/app/web/dist

# Expose the port
EXPOSE 3000

# Run the application
CMD ["/app/target/release/sorter", "api"] 