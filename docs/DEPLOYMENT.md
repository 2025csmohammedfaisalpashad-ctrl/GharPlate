# GharPlate Containerisation & Deployment Guide (`docs/DEPLOYMENT.md`)

## 1. Local Docker Compose Deployment (Build from Source)

GharPlate includes hardened [`backend/Dockerfile`](../backend/Dockerfile), [`frontend/Dockerfile`](../frontend/Dockerfile), [`.dockerignore`](../.dockerignore), and [`docker-compose.yml`](../docker-compose.yml).

```bash
cp .env.example .env
docker compose up --build -d
```

- **Frontend UI (Nginx SPA)**: `http://localhost:8080`
- **Backend API (FastAPI + Uvicorn)**: `http://localhost:8000/api/v1/health`
- **Interactive Swagger Docs**: `http://localhost:8000/docs`

> **Verification Note**: In this local macOS environment, the `docker` CLI binary is not installed on the host (`/usr/local/bin` / `/opt/homebrew/bin` / `/Applications/Docker.app`). Live container build and multi-container smoke testing are automated in Stages 3 and 4 of [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`docker-build-validation` and `docker-compose-smoke-test`) and can be run on any machine with Docker Desktop or Docker Engine installed.

---

## 2. Running Published Docker Hub Release Images (`docker-compose.release.yml`)

After GitHub Actions publishes the multi-architecture (`linux/amd64`, `linux/arm64`) images to Docker Hub (`mrfaisu0243/gharplate-backend` and `mrfaisu0243/gharplate-frontend`), any machine can run the stack without building from source:

```bash
docker pull mrfaisu0243/gharplate-backend:latest
docker pull mrfaisu0243/gharplate-frontend:latest
docker compose -f docker-compose.release.yml up -d
```

See [`docs/DOCKER_GUIDE.md`](DOCKER_GUIDE.md) and [`docs/CI_CD_RUNBOOK.md`](CI_CD_RUNBOOK.md) for complete operational details.

---

## 3. PostgreSQL Migration Readiness

To switch from local SQLite to managed PostgreSQL (e.g., AWS RDS, Supabase, Render, Cloud SQL) without changing application code:

1. Set `DATABASE_URL=postgresql+psycopg://user:password@host:5432/gharplate` in `.env`.
2. Run Alembic migrations and seed script:
   ```bash
   cd backend
   alembic upgrade head
   python3 ../scripts/seed_data.py
   ```
