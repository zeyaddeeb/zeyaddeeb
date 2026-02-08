FROM rust:bookworm AS builder
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    pkg-config \
    libasound2-dev \
    libudev-dev \
    libwayland-dev \
    libxkbcommon-dev \
    libx11-dev \
    libxi-dev \
    libxcursor-dev \
    libxrandr-dev \
    libxinerama-dev \
    libxrender-dev \
    libxfixes-dev \
    && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY web ./web
COPY assets ./assets

RUN rustup target add wasm32-unknown-unknown
RUN cargo install wasm-bindgen-cli

RUN cargo build --release --bin robot-wasm --target wasm32-unknown-unknown --no-default-features --features wasm
RUN wasm-bindgen --target web --out-dir /out/web --out-name robot_wasm \
    target/wasm32-unknown-unknown/release/robot-wasm.wasm
RUN cp web/index.html /out/web/index.html
RUN cp -r assets /out/web/assets

RUN cargo build --release --bin ws-server
RUN cp target/release/ws-server /out/ws-server

FROM nginx:alpine AS web
COPY --from=builder /out/web /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM debian:bookworm-slim AS server
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    libasound2 \
    libudev1 \
    libwayland-client0 \
    libxkbcommon0 \
    libx11-6 \
    libxi6 \
    libxcursor1 \
    libxrandr2 \
    libxinerama1 \
    libxrender1 \
    libxfixes3 \
    && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1000 app
COPY --from=builder /out/ws-server /usr/local/bin/ws-server
USER app
EXPOSE 9001
ENTRYPOINT ["/usr/local/bin/ws-server"]
