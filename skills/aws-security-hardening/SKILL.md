---
name: aws-security-hardening
description: AWS security hardening patterns including IAM least privilege, GitHub OIDC federation, Secrets Manager, and container security. Use for securing AWS resources, eliminating long-lived credentials, IAM trust policy configuration, or implementing defense in depth.
kb-sources:
  - wiki/software-engineering/aws-security-hardening
updated: 2026-05-25
---

# AWS Security Hardening

Defense-in-depth security patterns for Amazon Web Services. These patterns apply to App Runner, ECS/Fargate, and other container deployment targets.

> **OIDC security alert**: Datadog research found 500+ AWS roles with misconfigured OIDC trust policies (missing `sub` condition). As of June 2025, AWS STS auto-blocks trust policies without a `sub` condition. Scope to specific repo AND branch.

## Core Principles

| Principle | Implementation |
|-----------|---------------|
| **Least Privilege** | Scoped IAM policies, resource-level conditions |
| **No Long-Lived Keys** | OIDC for CI/CD, IAM roles for services |
| **Defense in Depth** | Multiple security layers (IAM + VPC + encryption) |
| **Audit Everything** | CloudTrail enabled, S3 access logging |
| **Encrypt at Rest** | KMS for sensitive data, S3 default encryption |

## IAM Best Practices

- **Avoid root account** for daily operations — dedicated IAM users/roles reduce blast radius
- **Scope resource fields** to specific ARNs — `Resource: "*"` only where AWS mandates it (e.g., `ecr:GetAuthorizationToken`)
- **Use conditions** — `aws:RequestedRegion`, `aws:ResourceTag`, `aws:PrincipalTag` for additional constraints
- **IAM Access Analyzer** — combines external access detection and unused permission auditing into one tool
- **Separate roles per workflow** — deploy, terraform, and read-only roles prevent lateral movement
- **Policy attachment after `create-role`** — roles without a subsequent `put-role-policy` or `attach-role-policy` are silently useless
- **GitHub OIDC `sub` condition** — use `StringEquals` with repo + branch scope (not wildcard `StringLike`) per least-privilege principle

## GitHub OIDC Federation

A trust policy omitting a `sub`-claim restriction lets any workflow in the GitHub org assume the role — a full privilege-escalation path. Restrict to specific repo AND branch. Verify the full chain: OIDC provider exists → trust policy has correct `sub` → permission policies attached. See `examples.md` for the full trust policy JSON and `reference.md` for multi-pattern scoping.

## Secrets Manager vs SSM Parameter Store

| Criterion | Secrets Manager | SSM Parameter Store |
|-----------|----------------|-------------------|
| Auto-rotation | Yes (Lambda-based) | No |
| Cross-account | Yes (resource policy) | Limited |
| Cost | $0.40/secret/month | Free (Standard tier) |
| **Use for** | Credentials, API keys, DB passwords | Config values, feature flags |

## Container Security

| Practice | Implementation |
|----------|---------------|
| Non-root user | `USER appuser` in Dockerfile |
| No secrets in image | Inject via Secrets Manager at runtime |
| Image scanning | ECR basic (free) + enhanced (Inspector, continuous) |
| Minimal base image | `python:3.12-slim` (not `python:3.12`) |
| Pin base image digest | `FROM python:3.12-slim@sha256:abc...` |

See `reference.md` for ECR scanning mode detail (basic vs enhanced/Inspector, CONTINUOUS_SCAN behavior).

## Security Group Replacement Safety

SG names are **immutable** in AWS — renaming triggers destroy+recreate. Without a `create_before_destroy` lifecycle block, Terraform deletes the old SG first, causing a traffic gap. Before replacing any SG, verify it isn't attached to other resources (`aws ec2 describe-network-interfaces --filters Name=group-id,Values=<SG-ID>`); shared SGs (RDS, ALB, Lambda ENI) break on destroy. See `reference.md` for CIDR validation and scheduling guidance.

## OIDC Provider Management

The GitHub OIDC provider (`token.actions.githubusercontent.com`) is **account-scoped** — only one can exist per AWS account. Use a `data` source to reference an existing provider without claiming ownership; a `resource` block fails if the singleton already exists. Confirm presence with `aws iam list-open-id-connect-providers` before deciding which to use. See `reference.md` for the EC2 SSM activation pattern for broken instance profiles.

## Secrets Manager Validation

Deploying with placeholder secrets from `.env.template` risks exposing insecure defaults in production. Deploy-time validation scripts reject known placeholder values (`PLACEHOLDER-*`, `changeme`, `TODO`) before they reach production — add the guardrail early in `setup-instance.sh`. See `examples.md` for the validation bash snippet.

## Key Rotation vs Git-History Scrub

When an API key lands in a committed file, prefer **rotation** over history rewriting. Generate a new key, update Secrets Manager, and verify the leaked one returns 403 — rotation makes the leaked value worthless immediately. `git filter-repo` / BFG requires force-push and disrupts collaborators.

```bash
openssl rand -hex 32                                                            # new key
curl -w "HTTP_CODE: %{http_code}\n" -H "Authorization: Bearer <key>" "$URL"     # 200 for new, 403 for the rotated-out old key
```

Prevention: keep secrets out of tracked files; EAS projects use `eas env:create --visibility secret --environment production` instead of `eas.json`.

## SSM for Live Server Ops

When production is broken, fix the running instance first via `aws ssm send-command` (no SSH keys required), then codify the fix into `setup-instance.sh` so future rebuilds pick it up. Chain `aws ssm wait command-executed` + `get-command-invocation` for async monitoring. See `reference.md` for the heredoc pitfall (`\n` mangling in SSM JSON) and the `printf` workaround.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| AWS access keys in GitHub Secrets | GitHub OIDC provider + IAM role |
| OIDC trust policy with wildcard `sub` | Scope to `repo:org/repo:ref:refs/heads/main` |
| `AdministratorAccess` for CI/CD | Scoped policies per workflow |
| Public RDS/ElastiCache endpoints | Private subnets + VPC connector |
| Secrets in Dockerfiles or env files | Secrets Manager with runtime injection |
| Unencrypted S3 state bucket | KMS + versioning + access logging + public access block |
| DynamoDB for state locking (new projects) | S3-native locking (`use_lockfile = true`) — preferred since TF 1.11 |
| Single IAM role for all workflows | Separate roles: deploy, terraform, read-only |
| Creating OIDC provider without checking if one exists | `data` source by default; create only after `list-open-id-connect-providers` confirms none |
| Deploying with placeholder secrets from templates | Deploy-time validation rejecting `PLACEHOLDER-*`, `changeme`, `TODO` values |
| Running services via `nohup`/`screen` without systemd | systemd unit or Docker `--restart=always` for any production service |

See `reference.md` for Terraform state security, budget alerts, and detailed IAM policy patterns.
See `examples.md` for IAM JSON policies, ECR scanning config, and budget alert Terraform.

## Related

- `caddy-tls-proxy` — SSM deployment patterns and Secrets Manager secret validation at the reverse-proxy layer
- `aws-cicd-patterns` — GitHub Actions OIDC pipeline integration and CI/CD role scoping
- `aws-app-runner` — container deployment target that consumes the task-role IAM patterns defined here
- `github-actions-cicd` — platform-neutral GHA workflow syntax that layers on top of the OIDC trust policies above
