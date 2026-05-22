FROM rust:bookworm AS builder

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    cmake \
    gcc \
    g++ \
    clang \
    clang-tools \
    zstd \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .


RUN cargo build --release


FROM debian:bookworm-slim AS base


RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libomp-dev \
    ca-certificates \
    libssl-dev \
    curl \
    zstd \
    && rm -rf /var/lib/apt/lists/*


WORKDIR /app

COPY --from=builder /app/target/release/crdt crdt
RUN chmod +x crdt
