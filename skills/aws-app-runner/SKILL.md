---
name: aws-app-runner
description: AWS App Runner and ECS Express Mode deployment patterns for stateless Python services. Use when deploying containerized APIs, configuring health checks, managing auto-scaling, or migrating from App Runner to ECS Express Mode.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/aws-app-runner
updated: 2026-04-18
---

# AWS Container Deployment Patterns

> **ECS Express Mode is the recommended path** for new deployments (late 2025+). App Runner enters maintenance mode April 30, 2026 — no new customers, no new features. ECS Express Mode provides the same simplicity (single API call) with full ECS/Fargate feature set. ALB adds ~$16-25/month fixed cost. Existing App Runner services continue working indefinitely.

## Service Selection

| Criterion | App Runner | ECS Express Mode | ECS Fargate | Lambda |
|-----------|-----------|-----------------|-------------|--------|
| Complexity | Low | Low | High | Low |
| Scale-to-zero | No (min=1) | Yes | Yes | Yes |
| Request timeout | 120s | Unlimited | Unlimited | 15min |
| VPC integration | Via connector | Native | Native | Via config |
| **Status** | Maintenance mode | **Recommended** | Mature | Mature |
| **Best for** | Existing services | New simple APIs | Complex microservices | Event-driven |

## Core Constraints (App Runner)

| Constraint | Value | Implication |
|------------|-------|-------------|
| **Port** | 8080 (configurable) | Set via `Port` in service config |
| **Stateless** | No local file persistence | Use S3/ElastiCache for state |
| **Min instances** | 1 (no scale-to-zero) | ~$2.55/month min (idle memory-only billing) |
| **Max concurrency** | 1-200 per instance | Python sync: 10-50, async: 50-150 |

## Quick Reference

### Port Binding

```python
import os
import uvicorn

port = int(os.environ.get("PORT", 8080))
uvicorn.run(app, host="0.0.0.0", port=port)
```

### Health Checks

```python
@app.get("/health")
async def health():
    return {"status": "healthy"}
```

HTTP health checks preferred over TCP for production. Config: 10s interval, 5s timeout, 1 healthy / 5 unhealthy threshold.

## Cold Start Optimization

| Technique | Impact |
|-----------|--------|
| Multi-stage Docker builds | Smaller image → faster pull |
| Min instances = 1+ | Eliminates cold starts (costs more) |
| Preload models at startup | Amortize once per instance |
| `python:3.12-slim` base | 150MB vs 1GB+ full image |

## IAM Roles (Two-Role Pattern)

App Runner requires **two separate IAM roles** with different trust principals:

| Role | Trust Principal | Purpose | Attached Policy |
|------|----------------|---------|-----------------|
| **ECR Access Role** | `build.apprunner.amazonaws.com` | Pull private ECR images | `AWSAppRunnerServicePolicyForECRAccess` (managed) |
| **Task Role** | `tasks.apprunner.amazonaws.com` | Container calls AWS APIs (e.g., Secrets Manager) | Custom policy scoped to needed services |

- ECR access role is passed as `access_role_arn` in `authentication_configuration`
- Task role is passed as `instance_role_arn` in `instance_configuration`
- Using the wrong principal silently breaks image pulls (ECR) or container API calls (task)
- `apprunner.amazonaws.com` (without prefix) is not valid for either role

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Setting min_size=0 expecting scale-to-zero | App Runner min is 1 — use Lambda or ECS Express for scale-to-zero |
| Hardcoded port in Dockerfile | Use `PORT` env var: `os.environ.get("PORT", 8080)` |
| Storing files locally between requests | Use S3 for persistence — instances are ephemeral |
| Skipping VPC connector for DB access | Private RDS requires VPC connector — public endpoints are a security risk |
| Using `latest` tag with auto-deploy | Use SHA-based tags for reproducible deployments |
| Choosing App Runner for new projects (2026+) | Use ECS Express Mode — same simplicity, no maintenance-mode risk |
| Using `apprunner.amazonaws.com` as task role principal | Task role must use `tasks.apprunner.amazonaws.com`; wrong principal silently prevents container from assuming the role |
| Confusing ECR access role with task role | ECR access role (`build.apprunner.amazonaws.com`) pulls images; task role (`tasks.apprunner.amazonaws.com`) grants container AWS API access — they are distinct resources |

## Cost Patterns

| Scenario | Estimated Monthly Cost |
|----------|----------------------|
| Idle (1 instance, 0.25 vCPU, 0.5 GB, no traffic) | ~$2.55 (memory only) |
| Low traffic (1-2 instances, 1 vCPU, 2 GB) | ~$25-50 |
| Medium traffic (2-5 instances, 1 vCPU, 2 GB) | ~$50-125 |

Idle instances bill memory only ($0.007/GB-hr), not vCPU. Active instances bill both.

See `reference.md` for VPC connector patterns, Secrets Manager integration, and service configuration details.
See `examples.md` for Terraform HCL blocks and auto-scaling configuration.

## Related

- `aws-security-hardening` — IAM trust policies, OIDC, task-role separation patterns this skill consumes
- `aws-cicd-patterns` — the CI pipeline that builds and pushes images into the App Runner deploy target
- `caddy-tls-proxy` — alternate deployment shape (single-EC2 + Caddy) for cases where App Runner cold-start or VPC connector cost rules it out
