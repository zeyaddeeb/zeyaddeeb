FROM rust:bookworm AS builder

RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    clang \
    cmake \
    && rm -rf /var/lib/apt/lists/*

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

COPY mathlib/lakefile.toml mathlib/lake-manifest.json mathlib/lean-toolchain mathlib/Header.lean mathlib/Prune.lean /mathlib/

RUN cd /mathlib \
    && imports="$(sed -n 's/^import //p' Header.lean)" \
    && lake exe cache get $imports \
    && lake env lean --run Prune.lean --premises /sysroot/premises.json Header.lean \
    && lake env lean --run Prune.lean /sysroot/lib/lean Header.lean \
    && rm -rf /mathlib/.lake

FROM debian:bookworm-slim AS base

WORKDIR /app

COPY --from=lean /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /app/target/release/proofs proofs
COPY --from=lean /repl/lean-toolchain repl/lean-toolchain
COPY --from=lean /repl/.lake/build/bin/repl repl/.lake/build/bin/repl
COPY --from=lean /sysroot /opt/lean

ENV LEAN_SYSROOT=/opt/lean
ENV PROOFS_REPL_DIR=/app/repl
ENV PROOFS_AGENT_LEAN_PATH=/opt/lean/lib/lean
ENV PROOFS_AGENT_PREMISES=/opt/lean/premises.json

RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
USER 1000:1000
