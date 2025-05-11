FROM rust:slim-bullseye

WORKDIR /app
COPY . .
RUN apt-get update && apt-get install -y pkg-config libssl-dev
RUN cargo build --release
ENV PORT=3000
CMD ["./target/release/sorter", "api"] 