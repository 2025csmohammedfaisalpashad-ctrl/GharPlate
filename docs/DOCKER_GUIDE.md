# GharPlate Docker & Container Operations Guide (`docs/DOCKER_GUIDE.md`)

## 1. Container Architecture

| Service | Dockerfile | Base Image | Internal Port | Host Port | Healthcheck Endpoint |
|---|---|---|---|---|---|
| **Backend API** (`backend`) | [`backend/Dockerfile`](../backend/Dockerfile) | `python:3.12-slim` + `tesseract-ocr` | `8000` | `8000` | `http://localhost:8000/api/v1/health` |
| **Frontend SPA** (`frontend`) | [`frontend/Dockerfile`](../frontend/Dockerfile) | `node:22-alpine` (build) → `nginx:1.27-alpine` (runtime) | `80` | `8080` | `http://127.0.0.1:80/` |

---

## 2. Running Locally from Source (`docker-compose.yml`)

Build and start both containers from local source code:

```bash
cp .env.example .env
docker compose up --build -d
```

Check container health and logs:

```bash
docker compose ps
docker compose logs -f
```

Verify endpoints:
- **Frontend Web Application**: `http://localhost:8080`
- **Backend Health Endpoint**: `http://localhost:8000/api/v1/health`
- **Interactive API Docs (Swagger UI)**: `http://localhost:8000/docs`

Stop containers while preserving the SQLite volume (`gharplate_sqlite_data`):

```bash
docker compose down
```

Stop containers and reset the database volume completely:

```bash
docker compose down -v
```

---

## 3. Running Pre-Built Docker Hub Images (`docker-compose.release.yml`)

On any machine with Docker installed, you can run GharPlate directly from the published Docker Hub images without building locally:

```bash
docker pull mrfaisu0243/gharplate-backend:latest
docker pull mrfaisu0243/gharplate-frontend:latest
docker compose -f docker-compose.release.yml up -d
```

---

## 4. Connecting Containerised Backend to Host Ollama

`docker-compose.yml` and `docker-compose.release.yml` configure:
- `extra_hosts: ["host.docker.internal:host-gateway"]`
- `OLLAMA_BASE_URL=http://host.docker.internal:11434`

If Ollama is running on the host machine (`ollama serve`), the containerised backend automatically connects to it. If Ollama is not running, the Ask GharPlate Assistant gracefully falls back to deterministic local database tools.
