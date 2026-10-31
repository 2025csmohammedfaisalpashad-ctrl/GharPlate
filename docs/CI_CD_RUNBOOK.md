# GharPlate CI/CD Engineering Runbook (`docs/CI_CD_RUNBOOK.md`)

## 1. Pipeline Architecture Overview

GharPlate uses a 5-stage sequential and gated GitHub Actions pipeline defined in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (with an optional manual/reusable release workflow in [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml)):

```text
Stage 1: backend-ci (Python 3.12, Ruff 0.9.10, compileall, isolated seed validation, 44 Pytest tests)
Stage 2: frontend-ci (Node.js 22 LTS, npm ci, tsc --noEmit, 9 Vitest tests, Vite production build)
          │
          ▼
Stage 3: docker-build-validation (Builds backend/Dockerfile & frontend/Dockerfile via Buildx)
          │
          ▼
Stage 4: docker-compose-smoke-test (Starts full Docker Compose stack, verifies /api/v1/health, /api/v1/foods/categories, /api/v1/foods, and frontend HTTP 200)
          │
          ▼
Stage 5: publish-dockerhub (Gated: runs ONLY on push to main, v*.*.* tags, or workflow_dispatch AFTER Stages 1–4 pass)
```

---

## 2. Root-Cause Fixes Implemented in CI/CD

1. **Ruff Lint Standardization & Version Pinning**:
   - **Previous Failure**: GitHub Actions ran an unpinned `pip install pytest ruff` and `ruff check app tests`, which flagged `UP035` (`from typing import Dict, List, Tuple`), `UP006` (`List[...]`, `Dict[...]`, `Tuple[...]`), `B008` (`Depends(get_db)`, `Query(...)`, `File(...)`, `Form(...)` called in function defaults in `backend/app/api/v1/router.py`), `F401` (unused imports), `F821` (missing `settings` import in `router.py`), and `F841` (unused local variables).
   - **Fix**:
     - Refactored `backend/app/api/v1/router.py` to use `DbSession = Annotated[Session, Depends(get_db)]` and `Annotated[..., Query(...)]` / `File(...)` / `Form(...)`.
     - Upgraded all 25 backend Python files to use built-in generic annotations (`list[...]`, `dict[...]`, `tuple[...]`, `set[...]`).
     - Pinned `ruff==0.9.10` in [`backend/requirements.txt`](../backend/requirements.txt) and configured explicit lint rules (`select = ["E", "F", "W", "B", "UP"]`, `ignore = ["E501"]`) in [`backend/pyproject.toml`](../backend/pyproject.toml).
2. **Deterministic Frontend Docker Builds (`npm ci`)**:
   - **Previous Issue**: `frontend/Dockerfile` only copied `frontend/package.json` and ran `npm install`, ignoring `frontend/package-lock.json`.
   - **Fix**: Updated [`frontend/Dockerfile`](../frontend/Dockerfile) to `COPY frontend/package.json frontend/package-lock.json ./` and `RUN npm ci`.
3. **Eliminated Competing Docker Hub Workflows**:
   - **Previous Issue**: `.github/workflows/ci.yml` and `.github/workflows/docker-publish.yml` both triggered independently on `push` to `main`, allowing `docker-publish.yml` to push images even if `ci.yml` failed.
   - **Fix**: Consolidated automatic publishing into Stage 5 (`publish-dockerhub`) of [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) gated behind `needs: [backend-ci, frontend-ci, docker-build-validation, docker-compose-smoke-test]`, and converted [`.github/workflows/docker-publish.yml`](../.github/workflows/docker-publish.yml) to `workflow_call` / `workflow_dispatch` with its own validation gate.

---

## 3. Running Every CI Stage Locally

### Stage 1 — Backend Static Analysis, Seed Check & Pytest
```bash
cd backend
python3 -m pip install -r requirements.txt
ruff --version
ruff check app tests
python3 -m compileall -q app tests
DATABASE_URL="sqlite:////tmp/gharplate_ci_seed.db" python3 ../scripts/seed_data.py
rm -f /tmp/gharplate_ci_seed.db
PYTHONPATH=. python3 -m pytest -v tests/
```

### Stage 2 — Frontend TypeScript Lint, Vitest & Production Build
```bash
cd frontend
npm ci
npm run lint
npm test
npm run build
```

### Stage 3 & 4 — Docker Build Validation & Compose Smoke Test
```bash
cp .env.example .env
docker compose -p gharplate_ci up --build -d
curl -fsS http://localhost:8000/api/v1/health
curl -fsS http://localhost:8000/api/v1/foods/categories
curl -fsS "http://localhost:8000/api/v1/foods?q=Ragi"
curl -fsS http://localhost:8080/ | grep -q "GharPlate"
docker compose -p gharplate_ci down -v --remove-orphans
```

---

## 4. Required GitHub Repository Secrets for Docker Hub Publishing

Configure the following secrets in **GitHub Repository → Settings → Secrets and variables → Actions**:

| Secret Name | Description | Example Value |
|---|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub account username | `mrfaisu0243` |
| `DOCKERHUB_TOKEN` | Docker Hub Personal Access Token (Read, Write, Delete scope) | `dckr_pat_...` |

When pushed to `main` (or tagged `v*.*.*`), GitHub Actions builds and publishes multi-architecture (`linux/amd64`, `linux/arm64`) images:
- `mrfaisu0243/gharplate-backend:latest` and `mrfaisu0243/gharplate-backend:<commit-sha>`
- `mrfaisu0243/gharplate-frontend:latest` and `mrfaisu0243/gharplate-frontend:<commit-sha>`
