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


RUN cargo build --locked --release


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

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
USER 1000:1000
