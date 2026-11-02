FROM rust:bookworm AS builder

WORKDIR /app

COPY . .

RUN cargo build --locked --release

FROM debian:bookworm-slim AS base

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/bell bell
RUN chmod +x bell

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
USER 1000:1000
