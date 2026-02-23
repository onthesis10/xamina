# Multi-stage build — Rust binary kecil
FROM rust:1.77-slim AS builder
WORKDIR /app

# Cache dependencies dulu
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main(){}" > src/main.rs
RUN cargo build --release

# Build actual source
COPY . .
RUN touch src/main.rs && cargo build --release

# Runtime image — sangat kecil (~10MB)
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y   libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/api /usr/local/bin/
EXPOSE 8080
CMD ["api"]
