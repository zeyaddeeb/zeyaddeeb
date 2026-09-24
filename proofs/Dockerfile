FROM rust:bookworm AS builder

WORKDIR /app

COPY . .

RUN cargo build --locked --release


FROM debian:bookworm-slim AS lean

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    binutils \
    ca-certificates \
    curl \
    git \
    zstd \
    && rm -rf /var/lib/apt/lists/*

ENV ELAN_HOME=/opt/elan
ENV PATH=/opt/elan/bin:$PATH

RUN curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh \
    | sh -s -- -y --default-toolchain none --no-modify-path

RUN git clone --depth 1 --branch v4.34.0 https://github.com/leanprover-community/repl /repl \
    && cd /repl \
    && lake build \
    && strip .lake/build/bin/repl

RUN cd /repl \
    && prefix="$(lean --print-prefix)" \
    && mkdir -p /sysroot/lib/lean \
    && cp -R "$prefix/lib/lean/Init" "$prefix"/lib/lean/Init.olean* /sysroot/lib/lean/ \
    && find /sysroot -type f ! -name '*.olean' ! -name '*.olean.private' ! -name '*.olean.server' -delete


FROM debian:bookworm-slim AS base

WORKDIR /app

COPY --from=builder /app/target/release/proofs proofs
COPY --from=lean /repl/lean-toolchain repl/lean-toolchain
COPY --from=lean /repl/.lake/build/bin/repl repl/.lake/build/bin/repl
COPY --from=lean /sysroot /opt/lean

ENV LEAN_SYSROOT=/opt/lean
ENV PROOFS_REPL_DIR=/app/repl

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
USER 1000:1000
