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

RUN rustup target add wasm32-unknown-unknown
RUN cargo install --locked wasm-bindgen-cli --version 0.2.128
RUN curl -sSfL "https://github.com/WebAssembly/binaryen/releases/download/version_132/binaryen-version_132-$(uname -m)-linux.tar.gz" \
    | tar xz -C /usr/local --strip-components=1 binaryen-version_132/bin/wasm-opt

COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY web ./web
COPY assets ./assets

RUN cargo build --locked --profile wasm-release --bin robot-wasm --target wasm32-unknown-unknown --no-default-features --features wasm
RUN wasm-bindgen --target web --out-dir /out/web --out-name robot_wasm \
    target/wasm32-unknown-unknown/wasm-release/robot-wasm.wasm
RUN wasm-opt -Os -o /out/web/robot_wasm_bg.wasm /out/web/robot_wasm_bg.wasm
RUN gzip -9 -k /out/web/robot_wasm_bg.wasm /out/web/robot_wasm.js
RUN sed "s/__BUILD__/$(cat /out/web/robot_wasm_bg.wasm /out/web/robot_wasm.js | sha256sum | cut -c1-16)/g" web/index.html > /out/web/index.html
RUN cp -r assets /out/web/assets

RUN cargo build --locked --release --bin ws-server
RUN cp target/release/ws-server /out/ws-server

FROM nginxinc/nginx-unprivileged:alpine AS web
COPY --from=builder /out/web /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

FROM debian:bookworm-slim AS server
ENV CANDLE_NUM_THREADS=1 RAYON_NUM_THREADS=1
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
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid 1000 --create-home app
COPY --from=builder /out/ws-server /usr/local/bin/ws-server
USER 1000:1000
EXPOSE 9001
ENTRYPOINT ["/usr/local/bin/ws-server"]
