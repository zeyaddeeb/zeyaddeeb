FROM rust:bookworm AS builder

WORKDIR /app

COPY . .

RUN cargo build --locked --release

FROM debian:bookworm-slim AS base

WORKDIR /app

COPY --from=builder /app/target/release/gates gates

ENV GATES_DATA=/data
ENV GATES_BIND=0.0.0.0

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
USER 1000:1000

EXPOSE 3009

CMD ["./gates"]
