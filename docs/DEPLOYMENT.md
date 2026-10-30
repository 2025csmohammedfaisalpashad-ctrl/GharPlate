# GharPlate Containerisation & Deployment Guide (`docs/DEPLOYMENT.md`)

## 1. Local Docker Compose Deployment

GharPlate includes production-minded `backend/Dockerfile`, `frontend/Dockerfile`, `.dockerignore`, and `docker-compose.yml`.

```bash
cp .env.example .env
docker compose up --build -d
```

- **Frontend UI (Nginx SPA)**: `http://localhost:8080`
- **Backend API (FastAPI + Uvicorn)**: `http://localhost:8000/api/v1/health`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

> **Verification Note**: Docker configuration files are implemented and validated for syntax and structure. Because the Docker daemon (`docker`) is not installed on this local macOS machine, live container execution is validated in GitHub Actions (`docker-build-validation` job in `.github/workflows/ci.yml`) or on any host with Docker Desktop installed.

## 2. PostgreSQL Migration Readiness

To switch from local SQLite to managed PostgreSQL (e.g., AWS RDS, Supabase, Render, Cloud SQL) without changing application code:

1. Set `DATABASE_URL=postgresql+psycopg://user:password@host:5432/gharplate` in `.env`.
2. Run Alembic migrations:
   ```bash
   cd backend
   alembic upgrade head
   python3 ../scripts/seed_data.py
   ```

## 3. Docker Hub Automated Publishing

`.github/workflows/docker-publish.yml` builds and pushes `gharplate-backend` and `gharplate-frontend` images to Docker Hub when the following GitHub repository secrets are configured:
- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

No paid cloud deployment has been triggered automatically, preserving zero unapproved cloud spend.
