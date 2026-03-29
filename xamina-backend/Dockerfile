FROM rust:1.91-slim AS builder
ARG API_CARGO_FEATURES=""
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends perl pkg-config build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN cargo build --release -p api ${API_CARGO_FEATURES}

FROM rust:1.91-slim AS runtime
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/api /usr/local/bin/api
EXPOSE 8080
CMD ["api"]
