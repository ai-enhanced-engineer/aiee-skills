---
name: docker-python-poetry
description: Multi-stage Docker builds for Poetry-based Python services. Specializes the Poetry export pattern, production uvicorn configuration, slim-bullseye base image choice, and BuildKit layer caching. Sibling skill to docker-python (which covers Python 3.12 / Trixie / OpenCV foundations). Use for production Dockerfiles for FastAPI/uvicorn services using Poetry as the dependency manager.
updated: 2026-05-21
---

# Docker Multi-Stage Builds for Poetry-Based Python Services

Poetry-specific Docker patterns. This skill specializes the Poetry build path on top of generic Dockerfile fundamentals.

## When to use

- Building a production Docker image for a FastAPI / uvicorn service that uses Poetry
- Choosing between Pattern A (export to requirements.txt) and Pattern B (copy `.venv` from builder)
- Tuning uvicorn for Kubernetes (single worker per container) vs single VM (`(2×CPU)+1` workers)
- Migrating from Poetry 1.x to 2.x (which removed bundled `export` command)

For **non-Poetry** Dockerfile fundamentals — non-root user, layer ordering, HEALTHCHECK, .dockerignore, port mapping, secrets, EC2/bridge networking, Python 3.12 / Debian Trixie / OpenCV runtime — see the **sibling `docker-python` skill**. This skill defers all of those to that sibling.

## Core patterns

| Pattern | One-line rule |
|---|---|
| Multi-stage | Stage 1 builder installs Poetry, exports `requirements.txt`. Stage 2 runtime starts from clean `slim` base, `pip install -r requirements.txt`. |
| Pattern A (recommended) | Export `requirements.txt` in builder; runtime uses plain `pip` only — smallest image |
| Pattern B (fallback) | Copy `.venv` from builder when native extensions are tricky to reproduce in runtime stage |
| Poetry 2.0 breaking change | `poetry export` requires `poetry-plugin-export` installed separately — pin both |
| Layer caching | `COPY pyproject.toml poetry.lock ./` BEFORE source code → deps cached unless lockfile changes |
| Base image | `python:3.11-slim-bullseye` for ML/data workloads (glibc, wheel-compatible). Avoid Alpine. |
| uvicorn loop | `--loop uvloop --http httptools` (via `uvicorn[standard]`) is typically 2–4× faster than the default asyncio loop; `--loop asyncio` is the slowest option and rarely chosen for production |
| Workers in K8s | `--workers 1`. Scale via pod replicas. Kubernetes is the process manager. |
| `package-mode = false` | Suppresses Poetry version-field cache invalidation when CI bumps the version |

## Quick reference

### Pattern A — export to requirements.txt (recommended default)

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.11-slim-bullseye AS builder
RUN pip install "poetry>=1.8,<2.0" "poetry-plugin-export>=1.8"
WORKDIR /build
COPY pyproject.toml poetry.lock ./
RUN poetry export -f requirements.txt -o requirements.txt --without-hashes --only main

FROM python:3.11-slim-bullseye AS runtime
WORKDIR /code
COPY --from=builder /build/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--loop", "uvloop", "--http", "httptools"]
```

Full Dockerfile (with non-root `USER`, `HEALTHCHECK`, env vars): `reference.md` §3 / `examples.md` Example 2.

### Pattern B — copy `.venv` (alternative)

When native extensions don't reproduce via plain `pip install`, the builder runs `poetry install` into `.venv` and the runtime stage copies it with `COPY --from=builder /app/.venv /app/.venv`. Full Dockerfile in `reference.md` §4.

## Anti-patterns (top 6)

1. **Running container as root** → see `docker-python` skill
2. **Copying `.venv` from host** → host wheels may mismatch container libc/arch
3. **Missing `.dockerignore`** → leaks `.git/`, `.venv/`, secrets into image
4. **Single-stage build with build tools** → final image 2–3× larger than necessary
5. **Poetry in runtime stage** → 50–80 MB unused CLI
6. **`pip install` without `--no-cache-dir`** → 50–100 MB pip wheel cache in image

## Troubleshooting — stale `pkg_resources` build failures

Legacy sdists (e.g. `oneagent-sdk`) fail with `ModuleNotFoundError: No module named 'pkg_resources'` on `setuptools>=81`. Fix: pin `setuptools<81` and use `--no-build-isolation` (`PIP_BUILD_CONSTRAINT` is ignored by Poetry 2.x). See `reference.md` § Troubleshooting — Stale pkg_resources Build Failures.

## Azure Functions Container Builds

Final stage differs from Pattern A: use `mcr.microsoft.com/azure-functions/python:4-python3.11` as base, copy to `/home/site/wwwroot/`, and omit `CMD`/`EXPOSE` (Functions host owns those). Builder stage is unchanged. See `reference.md` § Azure Functions Container Builds for the full comparison table.

## Important migration notes

- **Poetry 2.0**: `export` command removed — install `poetry-plugin-export` explicitly. Pin both.
- **`tiangolo/uvicorn-gunicorn-fastapi-docker` deprecated** (2024) — use `uvicorn --workers` directly (see `reference.md` §5).
- **`slim-bullseye` EOL mid-2026** — new projects target `slim-bookworm`.

See `reference.md` for full pattern catalogue and `examples.md` for a full refactor of the project's current Dockerfile.

See `azure-functions-python-v2` for the Functions-specific Dockerfile variant (different base image, `/home/site/wwwroot/` target, no CMD).
