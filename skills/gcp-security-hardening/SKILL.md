---
name: gcp-security-hardening
description: GCP security hardening patterns including IAM best practices, Workload Identity Federation (WIF), zero trust architecture, binary authorization, and container security. Use for securing GCP resources, eliminating service account keys, or implementing defense in depth.
kb-sources:
  - wiki/software-engineering/gcp-security-hardening
updated: 2026-05-20
---

# GCP Security Hardening

Defense-in-depth security patterns for Google Cloud Platform, emphasizing zero trust architecture and keyless authentication.

## Core Principles

| Principle | Implementation |
|-----------|---------------|
| **Least Privilege** | Minimal permissions, scoped to resources |
| **Zero Trust** | Verify everything, trust nothing |
| **Keyless Auth** | Workload Identity, no service account keys |
| **Defense in Depth** | Multiple security layers |
| **Audit Everything** | Cloud Audit Logs enabled |

## IAM Critical Rules

1. **Primitive roles** (Owner, Editor, Viewer) are too broad for production
2. **Prefer predefined roles** over custom when possible
3. **Grant at resource level** — not project level
4. **Review with IAM Recommender** — removes unused permissions
5. **Enforce MFA** — especially for privileged accounts
6. **Security keys for admins** — phishing-resistant 2FA

## Service Account Principles

- **One per application** — dedicated per application, not shared
- **No user-managed keys** — use Workload Identity
- **Disable unused accounts** — audit regularly
- **Token Creator at project level** enables impersonation of any SA

## Workload Identity Federation

Eliminate service account keys by federating external identities:

| Source | Use Case |
|--------|----------|
| **GitHub Actions** | CI/CD from GitHub |
| **GitLab CI** | CI/CD from GitLab |
| **AWS / Azure AD** | Cross-cloud access |
| **Kubernetes** | GKE Workload Identity |

**Key Benefits:** No keys to rotate or leak, short-lived tokens (1h default), auditable access, scoped to specific identities.

## WIF Validation Hierarchy

Verifying pool existence alone is insufficient — validate the full binding chain:

1. Pool exists → 2. Provider exists → 3. Binding exists → 4. IAM roles assigned

**Phase 3.5 Checklist Item:** "Verify bindings, not just resources" — a pool returning success does NOT mean the binding for your specific provider/repo exists.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Claiming infrastructure exists based on `describe` success | Verify exact bindings for the ticket's specific use case (4-step hierarchy) |
| Code complete but binding pending without documentation | Document split-work state explicitly, create follow-up ticket |
| Primitive roles (Owner/Editor/Viewer) | Predefined roles at resource level |
| Service account key files | Workload Identity Federation |
| Public Cloud SQL endpoints | Private IP + VPC connector |
| Single DB user for all operations | Separate migration/app/auth users (see `reference.md`) |
| Same-origin SHA256 without pinning | Pin expected hashes in repository for higher assurance |
| IAM audit scoped only to DB secrets | Enumerate ALL secrets from staging YAML — JWT, Redis, platform secrets use different prefixes (`app-${env}-{type}` vs `{name}-${env}`) |
| Inferring runtime deps from config fields | Verify actual client usage (imports, instantiation) before claiming dependency |
| Trusting ticket blocker counts without validation | Validate against codebase — counts frequently wrong |

## Critical Rules

1. **No service account keys** — a leaked key file grants persistent access; use Workload Identity Federation
2. **Private IPs only** — No public endpoints for data stores
3. **Encrypt at rest** — CMEK for sensitive data
4. **Audit logs enabled** — Data Access logs for compliance
5. **VPC Service Controls** — For sensitive projects

## Static SPA Least-Privilege

Service accounts for static SPAs (nginx + Angular on Cloud Run) should NOT receive `cloudsql.client`. Grant only `roles/logging.logWriter` and `roles/artifactregistry.writer`. See `infra-terraform` skill for SA map exclusion pattern.

See `reference.md` for IAM Permission Hierarchy, Zero Trust/BeyondCorp components, network security, container security, CI binary verification, and least-privilege DB user patterns.

See `examples.md` for WIF Terraform modules, GitHub Actions workflows, secure Cloud Run, GKE hardening, and IAM audit configuration.
