---
name: gcp-cicd-patterns
description: Cloud-native CI/CD patterns for GCP using Cloud Build, Cloud Deploy, and GitOps. Use for pipeline design, deployment strategies (canary, blue-green), artifact management, or automating deployments to Cloud Run and GKE.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/gcp-cicd-patterns
updated: 2026-05-21
---

# GCP CI/CD Patterns

Cloud-native continuous integration and delivery patterns for Google Cloud Platform, emphasizing GitOps methodology and managed services.

## Core Services

| Service | Purpose | Use When |
|---------|---------|----------|
| **Cloud Build** | Serverless CI | Building, testing, scanning artifacts |
| **Cloud Deploy** | Managed CD | Progressive rollouts to Cloud Run/GKE |
| **Artifact Registry** | Container storage | Storing and promoting images |
| **Cloud Run** | Serverless compute | Stateless HTTP workloads |

**Note:** Cloud Deployment Manager deprecated March 2026. Use Terraform or Infrastructure Manager.

## GitOps Methodology

### Two-Repository Pattern

```
app-repo/           # Application code
├── src/
├── Dockerfile
└── cloudbuild.yaml  # CI: build, test, push image

env-repo/           # Environment configuration
├── staging/
│   └── deployment.yaml
├── production/
│   └── deployment.yaml
└── cloudbuild.yaml  # CD: apply manifests
```

**Flow:** Code push → Build image → Push to registry → Update env-repo → Deploy to target

### Key Principles

1. **Environments-as-code** - All deployments described declaratively in Git
2. **Build once, deploy many** - Same artifact promoted through environments
3. **Git is source of truth** - Rollback = revert commit
4. **Automated reconciliation** - Drift detection and correction

## Deployment Strategies

| Strategy | Risk | Use Case |
|----------|------|----------|
| **Rolling** | Medium | Standard updates, gradual replacement |
| **Canary** | Low | Production validation with real traffic |
| **Blue-Green** | Low | Near-zero downtime, instant rollback |

## Pipeline Stages

Recommended CI/CD pipeline structure:

1. **Source** - Trigger on push/PR
2. **Build** - Compile, create artifacts
3. **Unit Test** - Fast feedback
4. **Static Analysis** - Security scanning (Trivy, tfsec)
5. **Publish** - Push to Artifact Registry
6. **Deploy Staging** - Automatic
7. **Integration Test** - Validate in staging
8. **Deploy Production** - Manual approval or canary

## Critical Rules

1. **Promote the same image from staging to production** - rebuilding for prod re-introduces toolchain drift the staging tests already caught
2. **Scan before deploy** - deploying an unscanned image lets critical CVEs reach production silently
3. **Tag immutably** - SHA-based tags; `latest` makes rollback ambiguous and image-promotion non-auditable
4. **Secrets in Secret Manager** - secrets pasted into `cloudbuild.yaml` end up in the build log and the repo history
5. **Approval gates** - automated production deploys remove the last human check on a bad image
6. **Match SA keys to permissions** - See Service Account section below

## GitHub Actions Service Account Configuration

Secret names like `GCP_SA_KEY` don't indicate which SA they contain — assuming the wrong identity burns hours on phantom permission errors. Debug first:

```yaml
- name: Debug GCP Service Account
  run: echo "${{ secrets.GCP_SA_KEY }}" | jq -r '.client_email'
```

Each workflow needs the SA scoped for its job (Terraform, Liquibase, and Cloud Build each require different roles). See **reference.md § GitHub Actions Service Account Configuration** for the permission table, anti-pattern YAML, and "Could Not Find Default Credentials" checklist.

## GitHub Actions Patterns

Three common CI integration patterns — see **reference.md § GitHub Actions Patterns** for full YAML and trade-off detail:

- **PR Comment Workflows**: use `pull-requests: write`, invoke skills directly rather than embedding prompt text, avoid path filters that miss Dockerfiles.
- **Batch Database Jobs**: Cloud SQL Proxy sidecar on `ubuntu-latest` is simpler than Cloud Run Jobs for scheduled nightly/weekly work.
- **EAS Builds (Expo/React Native)**: push-only trigger, pin `eas-cli`, use `--no-wait`; see `examples.md` for the workflow YAML.

## Angular CI: Budget Enforcement Gap

Angular style budgets are enforced only in production builds — `ng serve` silently ignores them. Run `ng build --configuration=production` in CI; use two-tier thresholds (warning 4 kB, error 6 kB). See **reference.md § Angular CI** for the budget config snippet.

See `reference.md` for detailed configurations and `examples.md` for Cloud Build templates.
