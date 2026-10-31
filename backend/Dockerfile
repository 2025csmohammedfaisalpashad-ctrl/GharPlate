FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/pyproject.toml ./backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY scripts/ ./scripts/

RUN mkdir -p /app/data/db /app/data/processed /app/data/import_reports && \
    adduser --disabled-password --gecos "" gharplate && \
    chown -R gharplate:gharplate /app

USER gharplate

EXPOSE 8000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=5 \
    CMD curl -fsS http://localhost:8000/api/v1/health || exit 1

WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
