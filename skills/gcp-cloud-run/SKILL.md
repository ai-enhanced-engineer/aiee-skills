---
name: gcp-cloud-run
description: Cloud Run deployment patterns for stateless, scalable Python services. Use when deploying to Cloud Run, configuring health checks, optimizing cold starts, or troubleshooting container issues.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/gcp-cloud-run
updated: 2026-05-21
---

# Cloud Run Deployment Patterns

Stateless, scalable, cost-effective serverless containers on Google Cloud Run.

## Core Constraints

| Constraint | Value | Implication |
|------------|-------|-------------|
| **Port** | 8080 (or `PORT` env) | Must bind to this port |
| **Stateless** | No local file persistence | Use GCS/Redis for state |
| **Request timeout** | 60s default, 3600s max | Long-running tasks need async patterns |
| **Cold starts** | 2-30s depending on image | Optimize image size, preload configs |
| **Concurrency** | 1-1000 requests/instance | Configure based on resource usage |

## Quick Reference

### Port Binding

```python
import os
import uvicorn

port = int(os.environ.get("PORT", 8080))
uvicorn.run(app, host="0.0.0.0", port=port)
```

### Health Checks

| Endpoint | Purpose | Check Dependencies? |
|----------|---------|---------------------|
| `/health/liveness` | Process alive | **No** - restart if fails |
| `/health/readiness` | Can serve traffic | **Yes** - remove from LB if fails |

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `PORT` | Container port | `8080` |
| `K_SERVICE` | Service name | `my-service` |
| `K_REVISION` | Revision name | `my-service-00001` |
| `K_CONFIGURATION` | Config name | `my-service` |

## Common Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| Hardcoded port 8000 | Deployment fails | Use `os.environ.get("PORT", 8080)` |
| DB check in liveness | Outage restarts all containers | Only check in readiness |
| Large container image | Slow cold starts | Multi-stage builds, slim base |
| Global ThreadPoolExecutor | Resource exhaustion | Request-scoped or asyncio |
| Placeholder env vars with Pydantic | Container crashes at startup | Inject real values before deploy |

## Pydantic Settings and Cloud Run Deployment

Pydantic validates env vars at container startup (import time). A placeholder like `"PLACEHOLDER_SET_BY_DEPLOY_SCRIPT"` in an `HttpUrl` field crashes the container before any deploy script runs. Solution: deploy dependency services first, capture URLs, inject real values via `sed`/`envsubst`, then deploy. For self-referential WS_URL: deploy with placeholder, capture URL, update with `gcloud run services update --set-env-vars`. See `reference.md § Pydantic Settings — Pre-Deployment Injection`.

## Pre-Deployment Validation Checklist

Run BEFORE building/pushing Docker images (saves 5-10 min):

- **Code quality**: `just validate-branch` (format, lint, type-check, tests)
- **Dockerfile lint**: `hadolint/hadolint-action@v3.1.0`
- **YAML validation**: `python -c "import yaml; yaml.safe_load(open('.cloudrun/staging.yaml'))"`
- **Secrets verification**: `gcloud secrets describe <secret-name> --project=PROJECT_ID`
- **Connection pool capacity**: `max_instances × (pool_size + pool_overflow) ≤ database_max_connections`. Tier limits: `db-f1-micro` = 25, `db-g1-small` = 100, `db-standard-1` = 200+.

## Docker Multi-Stage Build Pattern

3-stage Dockerfile with uv + BuildKit caching: fetch uv → install deps in builder → copy `.venv` + `src` into a minimal runtime image with a non-root user. Yields 50-70% faster rebuilds and ~200MB runtime image (vs 1GB+ with build tools). See `reference.md § Docker Multi-Stage Build (uv)` for the full Dockerfile.

## Service Account Verification for CI/CD

CI/CD secrets (e.g., `GCP_SA_KEY`) may contain a different service account than expected, causing silent permission failures. Debug by extracting the SA email from the key JSON (`jq -r .client_email key.json`), then confirm its IAM bindings on the target resource (`gcloud run services get-iam-policy <svc>` / `gcloud projects get-iam-policy <project>`) match what the deploy expects before assuming a code fault.

## VPC Egress Configuration

| Egress Setting | Use Case | Cost Impact |
|----------------|----------|-------------|
| `all-traffic` | Gateway services needing external APIs | Higher (all traffic through VPC) |
| `private-ranges-only` | Internal services (DB, Redis only) | Lower (only private IPs via VPC) |

## Entrypoint Shell Injection Prevention

Interpolating env vars into JSON via heredoc in `entrypoint.sh` is vulnerable to shell injection. `jq` provides safe JSON construction:

```bash
# BAD — shell injection via env var value
cat <<EOF > /app/config.json
{"apiUrl": "$API_URL"}
EOF

# GOOD — jq escapes values safely
jq -n --arg url "$API_URL" '{"apiUrl": $url}' > /app/config.json
```

**Runtime config pipeline** for Angular SPAs: `runtime-config.model.ts` → `config.service.ts` → `config.initializer.ts` → `entrypoint.sh` → `.cloudrun/staging.yaml`

See `reference.md` for connection pool settings, Redis configuration, and graceful shutdown patterns.
See `examples.md` for thread-safe caching and complete health check implementations.
