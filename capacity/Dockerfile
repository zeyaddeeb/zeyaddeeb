# syntax=docker/dockerfile:1.10

ARG PYTHON_VERSION=3.14
ARG UV_VERSION=0.11.15
ARG UNUSED_AT_RUNTIME="numpy pandas python-dateutil six"

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

FROM python:${PYTHON_VERSION}-slim-trixie AS builder

ARG UNUSED_AT_RUNTIME

COPY --from=uv /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv

WORKDIR /app

RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-install-project \
        $(printf -- '--no-install-package %s ' $UNUSED_AT_RUNTIME)

COPY pyproject.toml uv.lock ./
COPY src ./src

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable \
        $(printf -- '--no-install-package %s ' $UNUSED_AT_RUNTIME)

FROM python:${PYTHON_VERSION}-slim-trixie AS runtime

RUN groupadd --gid 1000 app \
    && useradd --uid 1000 --gid 1000 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv

ENV PATH=/app/.venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=3006

USER 1000:1000

EXPOSE 3006

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f\"http://127.0.0.1:{os.environ['UVICORN_PORT']}/health\", timeout=2)"]

CMD ["uvicorn", "capacity.app:app", "--no-server-header", "--timeout-graceful-shutdown", "10"]
