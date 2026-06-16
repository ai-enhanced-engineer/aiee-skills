---
name: aws-cicd-patterns
description: CI/CD patterns for AWS using GitHub Actions, ECR, and App Runner/ECS Express Mode. Use for deployment pipelines, container image management, OIDC authentication, or automating deployments to AWS services.
kb-sources:
  - wiki/software-engineering/aws-cicd-patterns
updated: 2026-04-18
---

# AWS CI/CD Patterns

Continuous integration and delivery patterns for AWS, emphasizing GitHub Actions with OIDC authentication (`configure-aws-credentials@v6`) and ECR-based container workflows.

> **App Runner maintenance mode (April 30, 2026)**: CI/CD patterns below work for both App Runner and ECS Express Mode — only the deploy step changes.

## Core Services

| Service | Purpose | Use When |
|---------|---------|----------|
| **GitHub Actions** | CI/CD orchestration | Building, testing, deploying |
| **ECR** | Container registry | Storing and managing Docker images |
| **App Runner / ECS Express** | Serverless compute | Deploying stateless HTTP workloads |
| **Secrets Manager** | Secret storage | Runtime secret injection |
| **S3** | Terraform backend | Remote state with S3-native locking (TF 1.11+) |

## Pipeline Stages

1. **Source** — Trigger on push/PR
2. **Build** — Compile, lint, type-check
3. **Unit Test** — Fast feedback (pytest, coverage gate)
4. **Docker Build** — Multi-stage build with GHA cache
5. **Security Scan** — Trivy/Snyk on container image
6. **Push to ECR** — Tag with SHA, push image
7. **Deploy Staging** — Automatic on merge to main
8. **Deploy Production** — Manual approval or canary

## GitHub OIDC Authentication (Keyless)

Use `aws-actions/configure-aws-credentials@v6` with OIDC — no access keys needed:

```yaml
permissions:
  id-token: write   # Required for OIDC
  contents: read

steps:
  - uses: aws-actions/configure-aws-credentials@v6
    with:
      role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
      aws-region: ${{ vars.AWS_REGION }}
```

OIDC setup details (trust policy, IAM role) → see `aws-security-hardening` skill.

## AWS Bootstrap Prerequisites

S3 bucket + DynamoDB lock table for Terraform remote state cannot be created by Terraform itself — bootstrapped manually before `terraform init`.

1. S3 bucket with versioning, `put-public-access-block`, and SSE-S3 (each is a separate API call)
2. DynamoDB table with `LockID` partition key, `PAY_PER_REQUEST` billing
3. Reference these as `data` sources in Terraform, not managed resources — prevents `terraform destroy` from wiping bootstrap infrastructure

**AWS CLI gotchas:**
- `create-bucket` requires `--create-bucket-configuration LocationConstraint=<region>` for any region other than `us-east-1`
- Billing alarms (`AWS/Billing EstimatedCharges`) must be created in `us-east-1` — other regions produce silent `INSUFFICIENT_DATA`
- GitHub OIDC `create-open-id-connect-provider` requires `--thumbprint-list` even though AWS ignores it for GitHub — use `6938fd4d98bab03faadb97b34396831e3780aea1`
- Pre-check OIDC: `aws iam list-open-id-connect-providers` before creating to avoid `EntityAlreadyExists`

## Rollback Patterns

| Method | Speed | Risk |
|--------|-------|------|
| Redeploy previous SHA tag | Fast (image exists) | Low |
| App Runner revision rollback | Fast (1 API call) | Low |
| Terraform state rollback | Slow (full plan/apply) | Medium |
| Git revert + redeploy | Medium (triggers full pipeline) | Low |

**Preferred**: Redeploy previous SHA tag — fastest, most predictable.

## Best Practices

- **Use OIDC** — `configure-aws-credentials@v6` eliminates long-lived keys. Scope trust policy to specific repo + branch to prevent cross-repo assumption.
- **Build once, promote** — Same image through staging → production via SHA tag. Rebuilding per environment risks drift.
- **Tag immutably** — SHA-based tags as source of truth, `latest` as convenience alias only.
- **Secrets in Secrets Manager** — secrets pasted into workflow files, Dockerfiles, or env vars land in build logs, image layers, and the public action run history, where they cannot be revoked retroactively.
- **Cache Docker layers** — GHA cache (`type=gha`, 10GB limit) or ECR registry cache (`type=registry`) for 50-70% faster builds.
- **Apply job safety** — `cancel-in-progress: true` on a Terraform apply job kills the runner mid-`terraform apply`, leaving the state file locked or partially written; the next run then has to manually unlock and reconcile drift.

## Reusable Workflow Context

`github.event_name` inside a reusable workflow resolves to `workflow_call`, not the caller's event. This silently skips conditions like `if: github.event_name == 'push'`.

**Pattern**: Explicit boolean inputs avoid the `workflow_call` event name shadowing. See `examples.md` for the explicit boolean input pattern.

- Bare `${{ inputs.push_image }}` evaluates to empty string (not `false`) on non-`workflow_call` triggers — `${{ inputs.push_image || false }}` prevents YAML boolean validation failures
- Without `secrets: inherit`, the called workflow cannot access the caller's secrets, causing silent access failures

## Deploy Safety Patterns

**Concurrency**: `cancel-in-progress: false` prevents canceling mid-SSM-command, which can leave instances broken:

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
```

**Shell injection guard**: Validating `workflow_dispatch` inputs before use in SSM commands prevents shell injection. Using the `env:` block (rather than `${{ }}` interpolation in `run:`) ensures bash's regex check is authoritative. See `examples.md` for the validation step pattern.

**Health check with fail-exit**: `for` loops with `curl && break || sleep` exit 0 when all attempts fail — the `ok` flag pattern ensures non-zero exit on exhaustion. See `examples.md` for health check and migration retry patterns.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| AWS access keys in GitHub Secrets | OIDC provider + IAM role assumption |
| `latest` tag only in ECR | SHA-based tags + `latest` as convenience alias |
| No ECR lifecycle policy | Lifecycle rules to prune old/untagged images |
| Rebuilding image for each environment | Build once, promote through envs via tag |
| OIDC trust policy with `*` in sub | Scope to `repo:org/repo:ref:refs/heads/main` |
| Skipping security scan before deploy | Trivy/Snyk scan as blocking CI step |
| `github.event_name == 'push'` inside reusable workflow | Explicit `push_image: boolean` input from caller |
| Both `ci.yml` and `deploy.yml` triggering on `push: branches: [main]` | Single entry point: deploy.yml calls ci.yml via `workflow_call` |
| `sleep N` before `docker exec` in deploy scripts | Retry loop with fail-exit flag pattern |
| Health check loop that exits 0 on exhaustion | `ok` flag variable with `[ $ok -eq 1 ] || exit 1` |
| Missing ECR login before `docker pull` in rollback | Include `aws ecr get-login-password` in rollback procedure |

See `reference.md` for Terraform state locking and ECR lifecycle policies.
See `examples.md` for complete GitHub Actions workflow templates (CI, Deploy, Terraform).

## Related

- `aws-security-hardening` — OIDC trust-policy authoring and IAM role scoping consumed by the pipelines here
- `aws-app-runner` — the deploy target this pipeline pushes images to (and the ECS Express migration path)
- `github-actions-cicd` — platform-neutral GHA workflow syntax (reusable workflows, matrix builds) this skill layers AWS specifics on top of
