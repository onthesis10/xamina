FROM rust:1.91-slim AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release -p api

FROM rust:1.91-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/api /usr/local/bin/api
EXPOSE 8080
CMD ["api"]
