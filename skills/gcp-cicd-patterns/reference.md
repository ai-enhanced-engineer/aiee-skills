# GCP CI/CD Reference

## Cloud Build Configuration

### Trigger Types

| Trigger | Use Case |
|---------|----------|
| Push to branch | CI on feature branches |
| Push to tag | Release builds |
| Pull request | PR validation |
| Manual | On-demand builds |
| Pub/Sub | Event-driven builds |

### Substitution Variables

```yaml
# Built-in substitutions
$PROJECT_ID          # GCP project
$BUILD_ID            # Unique build ID
$COMMIT_SHA          # Full commit SHA
$SHORT_SHA           # 7-char commit SHA
$BRANCH_NAME         # Git branch
$TAG_NAME            # Git tag
$REPO_NAME           # Repository name

# Custom substitutions (in trigger)
$_ENVIRONMENT        # staging, production
$_REGION             # us-central1
```

### Service Account Permissions

Cloud Build service account needs:
- `roles/run.developer` - Deploy to Cloud Run
- `roles/artifactregistry.writer` - Push images
- `roles/secretmanager.secretAccessor` - Read secrets
- `roles/clouddeploy.releaser` - Create Cloud Deploy releases

## Cloud Deploy Pipeline

### Delivery Pipeline Structure

```yaml
apiVersion: deploy.cloud.google.com/v1
kind: DeliveryPipeline
metadata:
  name: my-app-pipeline
serialPipeline:
  stages:
    - targetId: staging
      profiles: [staging]
    - targetId: production
      profiles: [production]
      strategy:
        canary:
          runtimeConfig:
            cloudRun:
              automaticTrafficControl: true
          canaryDeployment:
            percentages: [10, 50]
            verify: true
```

### Target Definition

```yaml
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata:
  name: production
run:
  location: projects/my-project/locations/us-central1
requireApproval: true
```

## Deployment Strategies

### Canary with Cloud Run

Cloud Deploy manages traffic splitting automatically:

1. Deploy new revision (0% traffic)
2. Shift 10% traffic to new revision
3. Monitor metrics, verify health
4. Shift 50% traffic
5. Complete rollout (100%)

**Rollback:** Automatic if verification fails, or manual via console/CLI

### Blue-Green with Cloud Run

```bash
# Deploy new revision (tagged, no traffic)
gcloud run deploy my-service \
  --image=gcr.io/project/app:v2 \
  --tag=green \
  --no-traffic

# Test green deployment directly
curl https://green---my-service-xxx.run.app

# Cut over traffic
gcloud run services update-traffic my-service \
  --to-tags=green=100

# Rollback if needed
gcloud run services update-traffic my-service \
  --to-revisions=my-service-v1=100
```

## Rollback Strategies

### Rollback Condition Patterns

**Problem**: Narrow rollback conditions miss deployment failures.

```yaml
# ❌ TOO NARROW - Only rolls back if verify step fails
rollback:
  if: failure() && steps.verify.outcome == 'failure'

# ✅ BROAD - Rolls back on any failure
rollback:
  if: failure()  # Triggers on any step failure in the job
```

**Reasoning**:
- Deployment failures can occur at any step (auth, build, push, deploy, verify)
- Rollback should be a safety net for ALL failures, not just verification
- If you need step-specific logic, use separate jobs with dependencies

### Automatic Rollback Pattern

```yaml
deploy:
  steps:
    - name: Deploy new revision
      id: deploy
      run: gcloud run deploy ...

    - name: Verify deployment
      id: verify
      env:
        SERVICE_NAME: my-service
        REGION: us-central1
      run: |
        set -euo pipefail

        # Wait for service ready (poll status condition)
        timeout 300 bash -c 'until [ "$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.conditions[0].status)")" = "True" ]; do sleep 10; done'

        # Run smoke tests
        SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format='value(status.url)')
        curl -f "$SERVICE_URL/health" || exit 1

        # Check error rates (example with Cloud Monitoring)
        # gcloud monitoring time-series list --filter='metric.type="run.googleapis.com/request_count" AND metric.label.response_code_class="5xx"'

# Rollback for ANY failure in deploy job
rollback:
  needs: deploy
  if: failure()
  runs-on: ubuntu-latest
  steps:
    - name: Get previous revision
      id: previous
      run: |
        PREVIOUS=$(gcloud run revisions list \
          --service=$SERVICE_NAME \
          --region=$REGION \
          --sort-by='~metadata.creationTimestamp' \
          --format='value(metadata.name)' \
          --limit=10 | awk 'NR==2')

        echo "previous_revision=$PREVIOUS" >> $GITHUB_OUTPUT

    - name: Rollback to previous version
      run: |
        echo "Rolling back to: ${{ steps.previous.outputs.previous_revision }}"

        gcloud run services update-traffic $SERVICE_NAME \
          --region=$REGION \
          --to-revisions=${{ steps.previous.outputs.previous_revision }}=100

    - name: Verify rollback
      run: |
        # Confirm traffic shifted
        # Run smoke tests on rolled-back version
```

### Manual Deployment Trigger Progression

**Phase 1: Manual only** (initial setup)
```yaml
on:
  workflow_dispatch:
```

**Phase 2: Add branch filter** (after validation)
```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:  # Keep for manual overrides
```

**Phase 3: Add path filters** (after stable)
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'service/**'
      - '.cloudrun/**'
      - 'Dockerfile'
  workflow_dispatch:
```

**Rationale**:
- New pipeline → unknown failure modes → manual trigger allows controlled testing
- Prevents accidental deploys during debugging
- Gradual automation as confidence builds

### Cloud Run Python Deployment Patterns

#### Pydantic Import-Time Validation

**Problem**: Pydantic validates environment variables at import time, BEFORE any post-deployment script runs.

```bash
# ❌ WRONG: Deploy with placeholder, then update
gcloud run services replace gateway.yaml  # Fails - Pydantic rejects placeholder at startup
gcloud run services update --update-env-vars="URL=${REAL_URL}"  # Never reached

# ✅ CORRECT: Inject real URL into YAML before deploying
sed "s|PLACEHOLDER|${REAL_URL}|" gateway.yaml > /tmp/gateway.yaml
gcloud run services replace /tmp/gateway.yaml  # Works - valid URL from start
```

**Why**: Python imports all modules during container startup. Pydantic `Settings` classes validate env vars immediately, crashing before your code runs.

#### Two-Phase Deploy Pattern

When services depend on each other's URLs:

```
Phase 1: Deploy services with known values
    1. Deploy Assistant service
    2. Get Assistant URL (now known)
    3. sed: Inject Assistant URL into Gateway YAML
    4. Deploy Gateway service

Phase 2: Update with post-deployment values
    5. Get Gateway URL (now known)
    6. Update Gateway with WS_URL (derived from Gateway URL)
```

**Script implementation:**
```bash
# Phase 1: Deploy dependent service first
gcloud run services replace assistant.yaml
SERVICE_URL=$(gcloud run services describe assistant --format='value(status.url)')

# Phase 1: Inject URL and deploy
sed "s|SERVICE_PLACEHOLDER|${SERVICE_URL}|" gateway.yaml > /tmp/gateway.yaml
gcloud run services replace /tmp/gateway.yaml

# Phase 2: Get and update with self-referential values
GATEWAY_URL=$(gcloud run services describe gateway --format='value(status.url)')
WS_URL="${GATEWAY_URL/https:/wss:}"
gcloud run services update gateway --update-env-vars="WS_URL=${WS_URL}"
```

## Security Scanning

### Container Scanning with Trivy

```yaml
- id: 'scan-image'
  name: 'aquasec/trivy'
  args:
    - 'image'
    - '--exit-code=1'
    - '--severity=CRITICAL,HIGH'
    - '$_IMAGE_NAME:$SHORT_SHA'
```

### Binary Authorization

Require signed images for production:

1. Create attestor
2. Sign images after successful tests
3. Configure Binary Authorization policy
4. Cloud Deploy validates before deployment

## Artifact Registry

### Image Tag vs Digest Format

| Format | Syntax | Use Case |
|--------|--------|----------|
| Tag | `image:latest` or `image:v1.0` | Development, mutable |
| Digest | `image@sha256:abc123...` | Production, immutable |

**Script handling:**
```bash
if [[ "$IMAGE_TAG" == sha256:* ]]; then
    IMAGE_REF="${IMAGE_BASE}@${IMAGE_TAG}"  # Digest format
else
    IMAGE_REF="${IMAGE_BASE}:${IMAGE_TAG}"  # Tag format
fi
```

**Note:** Cloud Run may cache images by tag. Use digests for guaranteed reproducibility.

### Image Lifecycle

```bash
# Tag strategy
gcr.io/project/app:abc123def     # SHA-based (immutable)
gcr.io/project/app:staging       # Environment pointer
gcr.io/project/app:v1.2.3        # Semantic version

# Promotion (retag, don't rebuild)
gcloud artifacts docker tags add \
  gcr.io/project/app:abc123def \
  gcr.io/project/app:production
```

### Cleanup Policy

```yaml
# Delete untagged images older than 30 days
cleanupPolicies:
  - id: delete-untagged
    action:
      type: Delete
    condition:
      tagState: UNTAGGED
      olderThan: 30d
```

## Integration Patterns

### Secret Manager in Cloud Build

```yaml
availableSecrets:
  secretManager:
    - versionName: projects/$PROJECT_ID/secrets/api-key/versions/latest
      env: 'API_KEY'

steps:
  - name: 'gcr.io/cloud-builders/gcloud'
    entrypoint: 'bash'
    args: ['-c', 'echo $$API_KEY | some-command']
    secretEnv: ['API_KEY']
```

### Pub/Sub Notifications

```yaml
# Notify on build completion
options:
  logging: CLOUD_LOGGING_ONLY
  pubsubTopic: projects/$PROJECT_ID/topics/build-notifications
```

## GCP IAM Propagation

### Timing Considerations

GCP IAM changes take up to 7 minutes to propagate globally. For CI/CD pipelines:

| Scenario | Recommended Delay |
|----------|-------------------|
| Same region | 30-60 seconds |
| Cross-region | 90 seconds |
| Global (worst case) | 5-7 minutes |

### Retry Strategy for IAM-Dependent Steps

```yaml
steps:
  - id: 'wait-for-iam'
    name: 'gcr.io/cloud-builders/gcloud'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        # Retry with exponential backoff
        for i in 1 2 3 4 5; do
          gcloud iam service-accounts get-iam-policy $SA && exit 0
          sleep $((i * 30))
        done
        exit 1
```

### Common IAM Propagation Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `PERMISSION_DENIED` after IAM change | Propagation delay | Wait 90s, retry |
| Lock held by another process | Interrupted local operation | `terraform force-unlock` |
| CI can't create IAM binding | Self-permission chicken-and-egg | Apply locally first |

## Cross-Repository Infrastructure Coordination

When GitHub Actions workflows need database access and fail with permission errors, the fix often spans TWO repositories:

```
Service Repo (analytics-service/)
└── .github/workflows/nightly-job.yaml  # Workflow configuration

Infrastructure Repo (infra-repo/)
└── terraform/
    └── iam.tf  # Service account permissions
```

### Common Failure: Missing Secret Manager Access

**Symptom:**
```
Error: google.auth.exceptions.DefaultCredentialsError: Could not load the default credentials
```

**Root Cause:** Service account has Cloud SQL Client role but not Secret Manager accessor role for app-level database credentials.

**Infrastructure Fix Required:**

```hcl
# infra-repo/terraform/iam.tf

# Grant service account access to app-level database secrets
resource "google_secret_manager_secret_iam_member" "github_actions_db_access" {
  secret_id = "projects/${var.project_id}/secrets/analytics-db-credentials"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:github-actions-ci@${var.project_id}.iam.gserviceaccount.com"
}
```

### Common Failure: Incorrect Connection String Format

**Symptom:**
```
psycopg2.OperationalError: could not connect to server: Connection refused
```

**Root Cause:** Workflow uses direct IP connection instead of Cloud SQL Proxy localhost format.

```yaml
# ❌ WRONG - Direct IP (fails with Cloud SQL Proxy)
env:
  DATABASE_URL: postgresql://user:pass@10.1.2.3:5432/db

# ✅ RIGHT - Localhost through proxy
env:
  DATABASE_URL: postgresql://user:pass@localhost:5433/db
```

### Cross-Repository Fix Workflow

1. **Identify the gap** in service repository workflow
2. **Create infrastructure chore ticket** with:
   - Exact Terraform changes needed (IAM bindings, secret accessor roles)
   - Link to blocked service PR/branch
   - Verification steps
3. **Apply infrastructure changes** in infra-repo repo
4. **Verify workflow** in service repository
5. **Document the pattern** for future services

**Example Chore Ticket:**
```markdown
## CHORE: Grant GitHub Actions SA access to analytics DB secrets

**Blocked PR:** analytics-service#42
**Root Cause:** `github-actions-ci` SA lacks secretAccessor role for app-level DB credentials

**Required Changes:**
- Add IAM binding in `infra-repo/terraform/iam.tf`
- Grant `roles/secretmanager.secretAccessor` on `analytics-db-credentials`

**Verification:**
1. Apply Terraform changes
2. Re-run GitHub Actions workflow in analytics-service
3. Confirm job succeeds with database connection
```

## Configuration Drift Prevention

### Problem: Multi-Repo Config Divergence

Deployment configs in service repos drift from infrastructure source of truth over time:

| Config | infra-repo (source) | notification-service | Impact |
|--------|---------------------------|---------------------|---------|
| `maxScale` | 10 | 5 | Under-provisioned for load |
| `concurrency` | 80 | 100 | Over-provisioned per instance |
| `CLIENT_ID` | Removed | Present | Dead env var |

**Root Cause**: No sync mechanism between repos, configs copied once then diverged.

### Prevention Strategy: CI Validation

```yaml
# In service repo .github/workflows/ci.yml
jobs:
  validate-config:
    runs-on: ubuntu-latest
    steps:
      - name: Check Cloud Run config matches infrastructure
        run: |
          # Fetch source of truth from infrastructure repo
            > /tmp/infra-config.yaml

          # Compare with local config
          if ! diff -u /tmp/infra-config.yaml .cloudrun/staging.yaml; then
            echo "❌ Config drift detected!"
            echo "Local config does not match infrastructure source of truth"
            echo "Please sync .cloudrun/staging.yaml with infra-repo repo"
            exit 1
          fi

          echo "✅ Configs are in sync"
```

### Infrastructure as Source of Truth Pattern

When multiple repos contain deployment configs, designating the infrastructure repo as the source of truth provides:
- Single canonical location for configuration values
- Prevention of drift across service repos
- Foundation for CI validation
- Clear ownership and change management

**Typical workflow**:
1. Change deployment config in infrastructure repo
2. Apply Terraform changes (updates actual infrastructure)
3. Sync config to service repos
4. CI validation prevents deployment if configs diverge

### Dead Environment Variables Cleanup

**Problem**: Environment variables persist in config files long after the code that uses them is removed.

**Cleanup Process**:
1. Search codebase for actual usage: `rg "CLIENT_ID" --type py`
2. If unused, remove from all config files (.env.example, .env, docker-compose.yml, .cloudrun/*.yaml)
3. Document removal in changelog
4. Update infrastructure configs
5. Verify no references in dependent repos

**Prevention**: Add config validation at startup:
```python
import os
import logging
from pydantic import BaseModel, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

class ServiceConfig(BaseSettings):
    """Validates all env vars are actually used."""

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="forbid"  # Reject unknown env vars
    )

    @model_validator(mode="after")
    def warn_deprecated(self) -> "ServiceConfig":
        """Warn about deprecated env vars still set."""
        deprecated = {
            "CLIENT_ID": "Removed in v3.5.1",
            "DATABASE_URL": "Never used",
        }

        for var, reason in deprecated.items():
            if os.getenv(var):
                logger.warning(f"Deprecated env var {var}: {reason}")

        return self
```

---

## Local Workflow Testing with `act`

Test GitHub Actions workflows locally before pushing to prevent deployment bugs from untested workflow changes.

### Why Pre-Merge Validation Matters

analytics-service required 4 production releases (v1.0.0–v1.0.3) to fix workflow issues that could have been caught locally. Common failure modes: incorrect secret names, missing environment variables, asyncpg driver incompatibilities with Cloud SQL Proxy.

### Basic Usage

```bash
# Install act (macOS)
brew install act

# List available workflows
act -l

# Run a specific workflow
act push -W .github/workflows/deploy-staging.yml

# Run with secrets file
act push --secret-file .secrets -W .github/workflows/deploy.yml

# Dry run (validate syntax without execution)
act push -n -W .github/workflows/deploy.yml
```

### Secrets File Format

```bash
# .secrets (add to .gitignore)
GCP_PROJECT_ID=my-project
GCP_SA_KEY=base64-encoded-key
DATABASE_URL=postgresql+asyncpg://user:pass@localhost/db
```

### Limitations

| Works Locally | Requires Real GCP |
|--------------|-------------------|
| Syntax validation | Cloud Build triggers |
| Step ordering | Workload Identity Federation |
| Secret reference checking | Cloud SQL Proxy connections |
| Docker build steps | Artifact Registry push |
| Script execution | Cloud Run deployment |

### Pre-Merge Checklist

Before merging workflow changes:

1. `act -n` — Validate syntax and step ordering
2. `act push -W .github/workflows/TARGET.yml` — Run locally if possible
3. Review secret references against Secret Manager entries
4. Check `runs-on` labels match available runners
5. Verify environment variable names against service configuration

---

## GitHub Actions Service Account Configuration

**Common Misconfiguration:** Using the wrong service account key in `secrets.GCP_SA_KEY`.

### Permission Requirements by Workflow

| Workflow | Required Permissions | Service Account |
|----------|---------------------|-----------------|
| Terraform | State bucket access, resource editor | `github-actions-ci` |
| Liquibase | Cloud SQL access only | `liquibase-deployer` |
| Cloud Build | Artifact Registry, Cloud Run | `cloud-build-sa` |

### Anti-Pattern: Reusing Unrelated Service Accounts

```yaml
# ❌ WRONG - liquibase-deployer lacks bucket access
- name: Setup Terraform
  env:
    GOOGLE_CREDENTIALS: ${{ secrets.GCP_SA_KEY }}  # Contains liquibase-deployer key
  run: terraform init  # FAILS: "could not find default credentials" for state bucket

# ✅ RIGHT - Use the correct service account for the job
- name: Setup Terraform
  env:
    GOOGLE_CREDENTIALS: ${{ secrets.GCP_TERRAFORM_SA_KEY }}  # github-actions-ci
```

**Why This Matters:**
- Secret name `GCP_SA_KEY` could contain any service account
- Organization secrets are shared across repos
- Different workflows need different service accounts
- Explicit verification prevents "wrong SA" debugging loops

**Example from Production:**
```
Expected: github-actions-ci@project.iam.gserviceaccount.com
Actual:   liquibase-deployer@project.iam.gserviceaccount.com
Result:   Terraform init failed (wrong permissions)
```

### Debugging "Could Not Find Default Credentials"

1. **Extract SA email from secret** — `echo "${{ secrets.GCP_SA_KEY }}" | jq -r '.client_email'`
2. Verify that SA has required permissions:
   - Terraform: `roles/storage.objectAdmin` on state bucket + resource permissions
   - Liquibase: `roles/cloudsql.client`
   - Cloud Run: `roles/run.admin`, `roles/artifactregistry.reader`

---

## GitHub Actions Patterns

### PR Comment Workflows

Automated code review via PR comments using Claude Code or similar tools.

#### Anti-Patterns

**Overly Complex Embedded Prompts**

```yaml
# ❌ WRONG - causes permission errors, hard to maintain
- name: Review PR
  run: |
    claude review --prompt="Analyze this PR for:
      - Security vulnerabilities
      [70 more lines of instructions]"

# ✅ RIGHT - direct skill invocation
- name: Review PR
  run: claude /code-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}
```

**Read-Only Permissions**

```yaml
# ❌ WRONG - can't post comments
permissions:
  pull-requests: read

# ✅ RIGHT
permissions:
  pull-requests: write
  contents: read
```

**Overly Restrictive Path Filters**

```yaml
# ❌ WRONG - misses Dockerfiles, YAML, infrastructure
on:
  pull_request:
    paths:
      - "src/**/*.py"

# ✅ RIGHT
on:
  pull_request:
    types: [opened, synchronize]
```

#### Workflow Example

```yaml
name: PR Review
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Review PR
        run: claude /code-review:code-review ${{ github.repository }}/pull/${{ github.event.pull_request.number }}
```

### Batch Database Jobs

For scheduled batch jobs needing database access, Cloud SQL Proxy as a sidecar is simpler than Cloud Run Jobs:

```yaml
name: Nightly Batch Job
on:
  schedule:
    - cron: '0 3 * * *'

jobs:
  batch-process:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Download Cloud SQL Proxy
        run: |
          curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64
          chmod +x cloud-sql-proxy

      - name: Start Cloud SQL Proxy
        run: ./cloud-sql-proxy "project:region:instance" --port=5433 &

      - name: Run batch job
        env:
          DATABASE_URL: postgresql://user:pass@localhost:5433/db
        run: python batch_job.py
```

**When to use:**
- Scheduled batch processing (nightly, weekly)
- Database migrations with complex Python logic
- Jobs that don't need Cloud Run's autoscaling

**Trade-offs:**
- Simpler than Cloud Run Jobs (no container build/deploy)
- Native GitHub Actions scheduling
- Runners are ephemeral (not for jobs >6 hours)

### EAS Build Integration (Expo/React Native)

Fire-and-forget pattern for Expo/React Native CI builds on `ubuntu-latest` without macOS runners. Key decisions:

- **Push-only trigger** — PRs can't access secrets and burn the 30/month free tier
- **Pin `eas-cli` version** — unpinned breaks CI silently
- **`--no-wait` flag** — EAS manages its own infrastructure
- **PR builds**: use `opened` + `ready_for_review` types only (not `synchronize`) to conserve quota

See `examples.md` for the complete GitHub Actions workflow YAML.

---

## Angular CI: Budget Enforcement Gap

Angular `anyComponentStyle` budget is **only enforced in production builds**. `ng serve` (dev mode) silently ignores budgets, tree-shaking, and AOT strictness.

| Build Mode | Budgets | Tree-Shaking | AOT Strict |
|------------|---------|-------------|------------|
| `ng serve` | Ignored | No | No |
| `ng build --configuration=production` | Enforced | Yes | Yes |

Budget enforcement requires a production build (`npm run build:prod` or `ng build --configuration=production`). Two-tier budgets (warning at 4 kB, error at 6 kB) catch gradual growth — the warning threshold acts as an early signal in CI logs without blocking the build.

See `examples.md` for the two-tier budget configuration.
