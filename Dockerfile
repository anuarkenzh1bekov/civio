FROM node:22-slim AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim AS api
COPY --from=ghcr.io/astral-sh/uv:0.11.7 /uv /usr/local/bin/uv
WORKDIR /app/backend
ENV UV_PROJECT_ENVIRONMENT=/opt/venv
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

FROM python:3.12-slim
ENV PATH="/opt/venv/bin:$PATH" PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    NODE_ENV=production WEB_DIST=/app/web/dist PORT=8080
WORKDIR /app/backend
COPY --from=api /opt/venv /opt/venv
COPY backend/app ./app
COPY backend/data ./data
COPY --from=web /build/web/dist /app/web/dist
RUN useradd --create-home --uid 10001 civio && mkdir .data && chown civio:civio .data
USER civio
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port \"$PORT\""]
