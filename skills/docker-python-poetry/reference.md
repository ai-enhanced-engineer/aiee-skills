# Docker Multi-Stage Builds for Poetry — Reference

Detailed Poetry-specific Dockerfile patterns. Companion to `SKILL.md`.

For non-Poetry fundamentals (non-root user, HEALTHCHECK, port mapping, .dockerignore, secrets, OpenCV, Python 3.12 / Trixie), defer to the sibling `docker-python` skill.

---

## 1. Multi-Stage Pattern Overview

Two patterns dominate. The choice depends on dependency complexity:

| Pattern | When |
|---|---|
| **A — Export to requirements.txt** | Default. Pure-Python deps or standard wheels (numpy, pandas, scikit-learn). Smallest runtime image. |
| **B — Copy `.venv` from builder** | Native extensions hard to reproduce with plain pip; complex extras; build-time wheels |

### Why export over `poetry install` in runtime?

The runtime image only needs to install + run Python code. Poetry CLI itself, its dependencies (cleo, crashtest, keyring, etc.), and its plugin ecosystem add 50–80 MB and zero runtime value.

The export pattern produces a `requirements.txt` in the builder, transfers that single file to runtime, and uses plain `pip install` — which is in every `python:*` image already.

---

## 2. Poetry 2.0 Breaking Change

As of **Poetry 2.0**, the `export` command is no longer bundled. It requires `poetry-plugin-export` installed separately.

```dockerfile
# Pre-Poetry-2.0
RUN pip install poetry
RUN poetry export -f requirements.txt --output requirements.txt   # works

# Poetry 2.0+
RUN pip install "poetry>=2.0" poetry-plugin-export
RUN poetry export -f requirements.txt --output requirements.txt
```

Or declare the plugin requirement in `pyproject.toml`:

```toml
[tool.poetry.requires-plugins]
poetry-plugin-export = ">=1.8"
```

Pinning the Poetry version (`"poetry>=1.8,<2.0"` for stability, or `">=2.0"` after migration) prevents surprise breakage when Docker pulls the latest.

---

## 3. Pattern A — Export Detail

### Full Dockerfile

```dockerfile
# syntax=docker/dockerfile:1

FROM python:3.11-slim-bullseye AS builder

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PIP_NO_CACHE_DIR=1

RUN pip install --upgrade pip \
 && pip install "poetry>=1.8,<2.0" "poetry-plugin-export>=1.8"

WORKDIR /build

COPY pyproject.toml poetry.lock ./

RUN poetry export \
      --format requirements.txt \
      --output requirements.txt \
      --without-hashes \
      --only main

FROM python:3.11-slim-bullseye AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /code

COPY --from=builder /build/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN addgroup --system appgroup \
 && adduser --system --ingroup appgroup appuser \
 && chown -R appuser:appgroup /code
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--loop", "uvloop", "--http", "httptools"]
```

### `poetry export` flags

| Flag | Purpose |
|---|---|
| `--format requirements.txt` | output format |
| `--output requirements.txt` | file name |
| `--without-hashes` | omit `--hash=sha256:...` (faster pip resolution) |
| `--only main` | runtime deps only — exclude dev/test/docs groups |
| `--with prod` | include a custom group (e.g., `[tool.poetry.group.prod.dependencies]`) |
| `--without dev` | alternative — explicitly exclude dev group |

### `package-mode = false` (Poetry 1.6+)

If `pyproject.toml`'s version field changes frequently (CI bumps version on every release), it invalidates the dependency cache layer even when no deps changed.

```toml
[tool.poetry]
name = "example-service"
package-mode = false   # service, not a library — version field optional
```

`package-mode = false` suits services where the version field is build metadata; libraries published to PyPI need a real version field.

---

## 4. Pattern B — Copy `.venv` Detail

When to use:
- Native extensions with complex build chains (e.g., custom-compiled `pyodbc`, `psycopg2` from source).
- Lockfile has wheels that resolve differently in `pip install` vs `poetry install`.
- You explicitly want Poetry's resolution semantics in runtime (rare).

```dockerfile
FROM python:3.11-slim-bullseye AS builder

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_IN_PROJECT=1 \
    POETRY_VIRTUALENVS_CREATE=1 \
    POETRY_CACHE_DIR=/tmp/poetry_cache

RUN pip install "poetry>=1.8,<2.0"

WORKDIR /app
COPY pyproject.toml poetry.lock ./
RUN touch README.md   # required if pyproject.toml references README

# BuildKit cache mount — persists pip wheel cache across builds locally
RUN --mount=type=cache,target=$POETRY_CACHE_DIR \
    poetry install --without dev --no-root

FROM python:3.11-slim-bullseye AS runtime

ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Copy entire venv from builder
COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}
COPY . .

# ... USER, HEALTHCHECK, CMD as in Pattern A
```

---

## 5. Production uvicorn Configuration

### Baseline command

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Production command

```bash
uvicorn app.main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --loop uvloop \
  --http httptools
```

Requires `uvicorn[standard]` in deps:

```toml
[tool.poetry.dependencies]
uvicorn = {extras = ["standard"], version = "^0.29"}
```

`[standard]` bundles `uvloop`, `httptools`, `websockets`, `python-dotenv`. Pulling these as direct deps duplicates what `uvicorn[standard]` already provides and risks version drift between the two declarations.

### Worker count

| Deployment | Workers |
|---|---|
| Kubernetes / container orchestrator | `--workers 1`. Scale via replicas. |
| Single VM / bare metal | `--workers (2 × CPU cores) + 1` |
| Docker Compose without orchestrator | `--workers N` or multiple service replicas |

**FastAPI docs (2025)** explicitly recommend single-worker per container in Kubernetes — Kubernetes itself acts as the process manager.

### Why not Gunicorn + uvicorn workers?

The legacy `tiangolo/uvicorn-gunicorn-fastapi-docker` image is **deprecated**. Modern deployments use `uvicorn --workers` directly. Gunicorn was historically used for its process management, but Kubernetes does that better. On bare-metal VMs without an orchestrator, Gunicorn remains valid but adds overhead in containers.

### Graceful shutdown

uvicorn handles SIGTERM natively — drains in-flight connections before exiting. No special CMD or `STOPSIGNAL` needed for K8s rolling updates. Set `terminationGracePeriodSeconds` on the K8s pod spec greater than the longest expected request duration.

---

## 6. Base Image Choice

| Image | Size | glibc | Shell | Debug-able | Verdict |
|---|---|---|---|---|---|
| `python:3.11-slim-bullseye` | ~80 MB | Yes | Yes | High | **Default for most services** |
| `python:3.11-alpine` | ~17–20 MB | No (musl) | Yes | Medium | **Avoid for ML/data deps** |
| `gcr.io/distroless/python3-debian11` | ~30 MB | Yes | No | Low | High-security, no shell |

### slim-bullseye (recommended default)

Debian 11 with minimal package set. glibc-based, so pre-compiled wheels (numpy, pandas, scipy, Pillow, scikit-learn) install without recompilation.

### Alpine — avoid for ML/data

Uses musl libc. Most Python scientific wheels on PyPI are compiled against glibc. Installing under Alpine either:
1. Falls back to source compilation (much slower, requires build tools)
2. Fails with obscure binary compatibility errors

Pure-Python services with no native extensions can use Alpine. ML / data workloads (which is most of a client's microservices) should not.

### Distroless — high-security production

`gcr.io/distroless/python3-debian11` ships only the Python interpreter and runtime deps. No shell, no package manager, no coreutils.

- **Pro**: minimal attack surface, passes most compliance scans.
- **Con**: no `kubectl exec ... sh` — must use `kubectl debug` with ephemeral containers.

Use distroless for customer-facing or compliance-bound workloads. Internal microservices typically don't need it.

### slim-bullseye → slim-bookworm migration

`bullseye` (Debian 11) reaches end-of-life mid-2026. Existing services can stay on bullseye until EOL; new projects should target `slim-bookworm` (Debian 12).

---

## 7. Layer Caching

### Core rule: deps before code

```dockerfile
# CORRECT — deps cached until poetry.lock changes
COPY pyproject.toml poetry.lock ./
RUN poetry export ...   # or poetry install

COPY . .                # source code last
```

```dockerfile
# WRONG — any source change invalidates dep install
COPY . .
RUN poetry export ...
```

### BuildKit cache mounts

```dockerfile
# syntax=docker/dockerfile:1   <-- required for BuildKit features

ENV POETRY_CACHE_DIR=/tmp/poetry_cache

RUN --mount=type=cache,target=$POETRY_CACHE_DIR \
    poetry install --without dev --no-root
```

**Caveat**: cache mounts are local to the build host. In ephemeral CI runners (GitHub Actions, Cloud Build), cache is cold every run unless you mount external storage or use registry-based layer cache. For CI, the export → requirements.txt pattern (Pattern A) is more portable.

### Multi-arch builds

Apple Silicon dev → AMD64 production:

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag myrepo/service:latest \
  --push .
```

Pattern A (export) is fully multi-arch compatible. Pattern B (`.venv` copy) requires all wheels to be available for the target architecture — BuildKit's QEMU emulation handles this but slowly.

---

## Anti-patterns

| Anti-Pattern | Why It Hurts | Fix |
|---|---|---|
| Container as root | Container breakout → host access | `USER appuser` after `adduser` (see `docker-python` skill) |
| `.venv` copy from host | Host wheels mismatch container libc/arch | `.dockerignore` excludes `.venv`; build deps inside container |
| Missing `.dockerignore` | Leaks `.git/`, secrets, test fixtures into image | `.git`, `.venv`, `__pycache__`, `*.pyc`, `.env`, `tests/` minimum |
| Single-stage with build tools | Final image 2–3× bloated | Multi-stage: builder exports, runtime starts clean |
| Poetry in runtime stage | 50–80 MB Poetry CLI never used at runtime | Export to `requirements.txt`; runtime uses plain `pip` |
| `pip install` without `--no-cache-dir` | 50–100 MB pip wheel cache silently in image | Always `pip install --no-cache-dir -r requirements.txt` |
| `--loop asyncio` in production | Slowest event loop option | `--loop uvloop --http httptools` (requires `uvicorn[standard]`) |
| `--workers 4` inside Kubernetes pod | Fights with K8s scheduler; defeats HPA | `--workers 1`; scale via pod replicas |
| `pip install poetry==<latest>` in builder | Surprise breakage when Poetry releases major | Pin: `"poetry>=1.8,<2.0"` or `">=2.0"` |

---

## Troubleshooting — Stale `pkg_resources` Build Failures

Some published sdists (e.g. `oneagent-sdk`) still import `pkg_resources` at build time. On modern Python toolchains this fails because `setuptools>=81` removed `pkg_resources`, surfacing as `ModuleNotFoundError: No module named 'pkg_resources'` during `pip install` / `poetry install`.

**Workaround** (works on host venv and inside dev containers):

```bash
poetry run pip install "setuptools<81" wheel
poetry run pip install --no-build-isolation <package>
```

`--no-build-isolation` is required because Poetry 2.x ignores `PIP_BUILD_CONSTRAINT` for its own build-isolation environment, so the constraint has to be applied directly to the active venv.

| Pitfall | Pattern |
|---|---|
| `ModuleNotFoundError: pkg_resources` during install of legacy sdist | Pin `setuptools<81` + install with `--no-build-isolation` in the venv |
| Setting `PIP_BUILD_CONSTRAINT` and assuming Poetry honors it | Poetry 2.x does not; constraint must land in venv directly |

---

## Azure Functions Container Builds

When the build target is an Azure Functions Premium deployment rather than a FastAPI/uvicorn service, the final stage diverges from the standard Pattern A recipe in three ways:

| Aspect | Standard Pattern A | Azure Functions variant |
|---|---|---|
| Base image (final stage) | `python:3.11-slim-bullseye` | `mcr.microsoft.com/azure-functions/python:4-python3.11` |
| Copy target | `/code/` or `/app/` | `/home/site/wwwroot/` (Functions contract) |
| `CMD` line | Required | **Omit** — Functions base image owns the entrypoint |
| `EXPOSE` | Port 8000 for HTTP | **Omit** — Functions host owns HTTP readiness and AMQP binding |

The builder stage is unchanged: two-stage wheel-build with the `setuptools<81` + `--no-build-isolation` workaround for `oneagent-sdk` applies identically (same Debian + Python base; same `pkg_resources` story). Full Dockerfile pattern in `azure-functions-python-v2/reference.md`.

---

## References

- [Poetry CLI: export](https://python-poetry.org/docs/cli/#export)
- [poetry-plugin-export GitHub](https://github.com/python-poetry/poetry-plugin-export)
- [pythonspeed.com — Poetry vs Docker caching](https://pythonspeed.com/articles/poetry-vs-docker-caching/)
- [pythonspeed.com — Best Docker base image for Python (Feb 2026)](https://pythonspeed.com/articles/base-image-python-docker-images/)
- [FastAPI: Server Workers](https://fastapi.tiangolo.com/deployment/server-workers/)
- [Blazing fast Python Docker builds with Poetry](https://medium.com/@albertazzir/blazing-fast-python-docker-builds-with-poetry-a78a66f5aed0)
- Sibling: `docker-python` (foundations)
