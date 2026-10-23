# The backend's image for Railway: Python 3.13, the locked dependencies, and headless Chromium with a Hebrew font
# so the carpenter dossier renders to PDF (Railpack has neither). Runs as a non-root user.
FROM python:3.13-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.11.33 /uv /usr/local/bin/uv

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Chromium and the libraries it needs, plus Noto (Hebrew among its scripts) for the dossier's text.
RUN playwright install --with-deps chromium \
    && apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-core \
    && rm -rf /var/lib/apt/lists/* \
    && chmod -R a+rX /ms-playwright

COPY app ./app

RUN useradd --create-home --uid 10001 banai
USER banai

EXPOSE 8000
# Railway sets $PORT; railway.json has no startCommand, so this shell form is what runs.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
