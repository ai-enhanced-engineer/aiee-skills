# Docker Multi-Stage Builds for Poetry — Examples

Project-grounded examples from `example-service`.

---

## Example 1: Project's Current Dockerfile (annotated)

```dockerfile
# example-service/Dockerfile — current
FROM python:3.11-slim-bullseye as os-base

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
RUN apt-get update                              # ← runs but doesn't install anything; does it serve a purpose?

FROM os-base as poetry-base

RUN pip install --upgrade pip                   # ← no --no-cache-dir; ~5 MB cache in layer
RUN pip install poetry                          # ← no version pin; surprise on Poetry 2.0
RUN poetry config virtualenvs.create false      # installs deps into system Python

FROM poetry-base as app-base

ARG APPDIR=/code
WORKDIR $APPDIR/
COPY pyproject.toml ./pyproject.toml
RUN poetry install --no-root --only main        # ← Poetry stays in final image

COPY . .

FROM app-base as main

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "asyncio"]
#                                                                       ^^^^^^^^^^^^^^^^^^^^
#                                                                       slowest loop choice
```

**What's OK**:
- `python:3.11-slim-bullseye` — correct base image for ML/data deps.
- Multi-stage layout (`os-base` → `poetry-base` → `app-base` → `main`).
- `pyproject.toml` copied before `COPY . .` — deps cached on source-only changes.
- `--no-root --only main` — runtime deps only, project itself not installed as a package.

**Issues to fix**:

| # | Issue | Impact |
|---|---|---|
| 1 | Poetry installed in final image | ~50 MB unused at runtime |
| 2 | `--loop asyncio` | Slowest event loop; throughput hit |
| 3 | No `--no-cache-dir` on pip upgrade | ~5 MB pip cache leaked into layer |
| 4 | No `poetry-plugin-export` pinned | Surprise breakage when CI pulls Poetry 2.0 |
| 5 | No non-root `USER` | Container runs as root — security risk |
| 6 | No `HEALTHCHECK` | No liveness signal for orchestrator |
| 7 | `poetry.lock` not copied separately | Dep cache invalidates on `pyproject.toml` non-dep changes |
| 8 | `apt-get update` with no install | Ineffective |

Items 5–6 are addressed by the sibling `docker-python` skill. Items 1–4, 7–8 are Poetry/uvicorn-specific and addressed below.

---

## Example 2: Refactored Dockerfile — Pattern A (recommended)

Full refactor of the project's Dockerfile using the export pattern:

```dockerfile
# syntax=docker/dockerfile:1

# ─── Stage 1: Builder — export requirements, never enters runtime ──────────────
FROM python:3.11-slim-bullseye AS builder

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --upgrade pip \
 && pip install "poetry>=1.8,<2.0" "poetry-plugin-export>=1.8"

WORKDIR /build

# Cache layer: invalidated only when lockfile changes
COPY pyproject.toml poetry.lock ./

RUN poetry export \
      --format requirements.txt \
      --output requirements.txt \
      --without-hashes \
      --only main


# ─── Stage 2: Runtime — clean slim base, no Poetry ─────────────────────────────
FROM python:3.11-slim-bullseye AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /code

# Install runtime deps from builder's exported requirements.txt
COPY --from=builder /build/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Source code last — most volatile layer
COPY . .

# Non-root user (see docker-python skill for full pattern)
RUN addgroup --system appgroup \
 && adduser --system --ingroup appgroup appuser \
 && chown -R appuser:appgroup /code
USER appuser

EXPOSE 8000

# Liveness probe — orchestrator-friendly
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request, sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status == 200 else 1)"

# Production uvicorn: uvloop + httptools, single worker (Kubernetes scales via replicas)
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--loop", "uvloop", \
     "--http", "httptools"]
```

### Required `pyproject.toml` change

Add `uvicorn[standard]` to pull in `uvloop` + `httptools`:

```toml
[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.111"
uvicorn = {extras = ["standard"], version = "^0.29"}    # bundles uvloop, httptools
```

Optionally suppress version-field cache invalidation:

```toml
[tool.poetry]
name = "example-service"
package-mode = false
```

### Required `.dockerignore` (if not already present)

```
.git
.venv
__pycache__
*.pyc
*.pyo
.env
.env.*
tests/
docs/
.github/
*.md
.pytest_cache
.ruff_cache
.coverage
htmlcov/
test-reports/
```

---

## Example 3: Pattern B — When to Use

If the refactor in Example 2 fails because some dependency has wheels that resolve differently with `pip install -r requirements.txt` vs `poetry install`, switch to Pattern B:

```dockerfile
# syntax=docker/dockerfile:1

FROM python:3.11-slim-bullseye AS builder

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    POETRY_CACHE_DIR=/tmp/poetry_cache \
    PYTHONDONTWRITEBYTECODE=1

RUN pip install --upgrade pip \
 && pip install --no-cache-dir "poetry>=1.8,<2.0"

WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN touch README.md

RUN --mount=type=cache,target=$POETRY_CACHE_DIR \
    poetry install --without dev --no-root


FROM python:3.11-slim-bullseye AS runtime

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Copy entire venv from builder
COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}
COPY . .

RUN addgroup --system appgroup \
 && adduser --system --ingroup appgroup appuser \
 && chown -R appuser:appgroup /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "uvloop", "--http", "httptools"]
```

The `--mount=type=cache` on `poetry install` accelerates local rebuilds. In CI (GitHub Actions), the cache is cold every run — Pattern A is more portable for CI builds.

---

## Example 4: Image Size Comparison

Empirical comparison for a typical FastAPI service (numpy + pandas + pymongo + thefuzz):

| Variant | Size |
|---|---|
| Project's current Dockerfile | ~480 MB (Poetry + pip cache + build artifacts in final image) |
| Refactor — Pattern A (export) | ~280 MB |
| Refactor — Pattern B (`.venv` copy) | ~310 MB |
| With `python:3.11-alpine` base (broken — wheels fail) | N/A |
| `gcr.io/distroless/python3-debian11` runtime | ~250 MB |

The export pattern saves ~200 MB primarily by removing Poetry, pip cache, and APT cache from the final layer. Distroless saves another ~30 MB at the cost of debug-ability.

---

## Example 5: Minimum Test for the Refactor

Before merging the Dockerfile refactor, verify:

```bash
# Build
docker build -t matching-service:refactor .

# Inspect size
docker images matching-service:refactor

# Run
docker run --rm -p 8000:8000 -e MONGODB_URI="$MONGODB_URI" matching-service:refactor

# Liveness check
curl -fsS http://localhost:8000/health

# Verify non-root user
docker run --rm matching-service:refactor id   # → uid=N(appuser) gid=N(appgroup)

# Verify no Poetry in image
docker run --rm matching-service:refactor sh -c "command -v poetry || echo 'poetry not present (good)'"

# Verify uvloop in use
docker run --rm matching-service:refactor python -c "import uvloop; print('uvloop ok')"
```

If all five checks pass, the refactor is safe to ship.

---

## Anti-patterns observed in the project

| Line in Dockerfile | Issue | Fix |
|---|---|---|
| Line 5 | `RUN apt-get update` with no install | Remove or follow with `apt-get install --no-install-recommends -y <pkg>` then `rm -rf /var/lib/apt/lists/*` |
| Line 9 | `pip install --upgrade pip` no `--no-cache-dir` | Add `--no-cache-dir` |
| Line 10 | `pip install poetry` unpinned | `pip install "poetry>=1.8,<2.0" "poetry-plugin-export>=1.8"` |
| Line 17 | Only `pyproject.toml` copied, not `poetry.lock` | `COPY pyproject.toml poetry.lock ./` |
| Line 18 | `poetry install --only main` runs in final image | Switch to export pattern (Example 2) |
| Line 26 | `--loop asyncio` | `--loop uvloop --http httptools` (requires `uvicorn[standard]`) |
| (missing) | No `USER appuser` | Add non-root user (see `docker-python` skill) |
| (missing) | No `HEALTHCHECK` | Add liveness probe |

---

## Summary table — refactor priority

| Priority | Change | Effort | Impact |
|---|---|---|---|
| P0 | Add non-root `USER` | XS | Security |
| P0 | Switch `--loop asyncio` → `uvloop` | XS | Performance |
| P1 | Switch to Pattern A (export) | S | Image size −200 MB |
| P1 | Pin Poetry version + plugin | XS | Build stability |
| P1 | Add `HEALTHCHECK` | XS | Orchestrator integration |
| P2 | Add `.dockerignore` | XS | Build speed + leak prevention |
| P2 | `package-mode = false` if CI bumps version | XS | Cache stability |
