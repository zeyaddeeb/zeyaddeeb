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

FROM debian:bookworm-slim AS models

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY models.sh models.sha256 ./

RUN ./models.sh /app/models

FROM debian:bookworm-slim AS base

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/voice voice
COPY --from=builder /app/house.tape house.tape
COPY --from=models /app/models models
RUN chmod +x voice

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
USER 1000:1000
