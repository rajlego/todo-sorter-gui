# Use a slim Debian image for the minimal runtime dependencies
FROM debian:bullseye-slim

# Install only the necessary runtime dependencies
RUN apt-get update && \
    apt-get install -y ca-certificates libssl1.1 && \
    rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy the pre-built backend binary 
COPY ./target/release/sorter /app/sorter

# Copy the pre-built frontend static files
COPY ./web/dist /app/static

# Set environment variables
ENV PORT=3000
ENV STATIC_DIR=static

# Expose the port
EXPOSE 3000

# Run the application
CMD ["./sorter", "api"] 