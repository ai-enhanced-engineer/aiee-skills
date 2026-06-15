# GitHub Actions CI/CD for Python — Examples

Project-grounded examples from `example-service`.

---

## Example 1: The Project Uses Reusable Workflows (current architecture)

`example-service/.github/workflows/quality-versioning-pipeline.yaml` is a **consumer** of shared workflows in `your-org/shared-workflows`. The job composition:

```
gatekeeper            (paths-changed filter — skip if no relevant code changed)
  ↓
quality_check         (Ruff lint + format)
  ↓
unit_tests            (pytest + coverage + JUnit + OpenAPI artifact)
  ↓ ↘
sonarqube_scan         contract_validation     build
  ↓ ↘                  ↓                       ↓
ci_result              (final aggregator)
  ↓
versioning            (only on main; bumps version, creates GH Release)
  ↓
publish_changelog     (pushes to Confluence)
```

```yaml
# .github/workflows/quality-versioning-pipeline.yaml — actual structure
jobs:
  gatekeeper:
    uses: your-org/shared-workflows/.github/workflows/gatekeeper.yaml@main
    with:
      filter_config: |
        code:
          - 'app/**/*.py'
          - 'tests/**/*.py'
          - 'pyproject.toml'
          - 'poetry.lock'

  quality_check:
    needs: gatekeeper
    if: needs.gatekeeper.outputs.run_code_checks == 'true'
    uses: your-org/shared-workflows/.github/workflows/quality-check.yaml@main
    with:
      python_version: "3.11"
      ruff_format_check_enabled: true
      ruff_linter_enabled: true
    secrets:
      AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
      AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}

  # ... unit_tests, sonarqube_scan, contract_validation, build, versioning, publish_changelog ...
```

**What works**:
- `gatekeeper` job using `paths-filter` outputs — every downstream job conditionally runs only if relevant code changed. Saves CI minutes.
- All shared logic lives once in `shared-workflows`. New microservices inherit consistent QA standards by referencing the same `@main`.
- `ci_result` aggregator — every conditional job gates the final status, even if upstream was skipped.
- Versioning is gated to `main` only with `if: github.ref == 'refs/heads/main'`.

**Issues to consider**:

| # | Issue | Impact |
|---|---|---|
| 1 | All shared workflows pinned at `@main` | Breaking change in shared repo immediately propagates to all consumers |
| 2 | `AZURE_CLIENT_SECRET` stored in repo secrets | Quarterly rotation chore; OIDC eliminates this |
| 3 | No `concurrency:` block at the consumer level | Two pushes to same PR run both; stale results |
| 4 | Some jobs depend on `gatekeeper` but skip via `if:` instead of `needs:` only — slightly less efficient |
| 5 | KeyVault secret fetching happens in every job that needs it — could centralize via Workload Identity Federation |

---

## Example 2: Add Concurrency to the Consumer Workflow (recommended)

```yaml
# top of quality-versioning-pipeline.yaml — add at the workflow level
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  # On main, never cancel — release jobs must finish.
  # On feature branches, cancel stale runs.
  cancel-in-progress: ${{ !contains(github.ref, 'refs/heads/main') }}
```

This single 3-line addition prevents two open PRs from racing and cuts wasted CI minutes when the same branch is pushed twice in quick succession.

---

## Example 3: PR Title Validation (project's `pr-title-validation.yaml`)

The project enforces conventional commits at the PR-title level so squash-merged commits retain parseable prefixes:

```yaml
# .github/workflows/pr-title-validation.yaml — typical pattern
name: PR Title Validation

on:
  pull_request:
    types: [opened, edited, reopened, synchronize]

permissions:
  pull-requests: read

jobs:
  pr-title:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          types: |
            feat
            fix
            perf
            docs
            refactor
            test
            ci
            chore
            build
          requireScope: false
          subjectPattern: ^[A-Z].+$
          subjectPatternError: |
            The subject must start with an uppercase letter and not be empty.
```

**Why this matters**: when squash-merging, the PR title becomes the commit message. Without enforcement, `python-semantic-release` can't parse the history and refuses to bump the version.

---

## Example 4: Standalone Pipeline (no shared workflows — alternative)

For projects without a shared-workflow repository, the same QA pipeline as a single self-contained workflow:

```yaml
name: CI

on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - "app/**"
      - "tests/**"
      - "pyproject.toml"
      - "poetry.lock"
      - ".github/workflows/**"
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ !contains(github.ref, 'refs/heads/main') }}

permissions:
  contents: read
  pull-requests: write

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0    # required for SonarQube + semantic-release

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - uses: snok/install-poetry@v1
        with:
          virtualenvs-create: true
          virtualenvs-in-project: true

      - uses: actions/cache@v4
        with:
          path: .venv
          key: ${{ runner.os }}-poetry-${{ hashFiles('**/poetry.lock') }}
          restore-keys: ${{ runner.os }}-poetry-

      - run: poetry install --no-interaction --no-root

      - name: Ruff check
        run: poetry run ruff check .

      - name: Ruff format
        run: poetry run ruff format --check .

      - name: Pytest
        run: poetry run pytest --cov=app --cov-branch --cov-report=xml

      - uses: SonarSource/sonarqube-scan-action@v7
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

      - uses: SonarSource/sonarqube-quality-gate-action@v1
        timeout-minutes: 5
        env:
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  release:
    needs: qa
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - run: pip install python-semantic-release

      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          semantic-release version
          semantic-release publish
```

This is what a new client repo would look like before consolidating into `shared-workflows`.

---

## Example 5: Migrating `AZURE_CLIENT_SECRET` to OIDC

The project currently uses a stored `AZURE_CLIENT_SECRET`. To migrate:

### Step 1 — workflow side

```yaml
permissions:
  id-token: write       # required for OIDC token issuance
  contents: read

jobs:
  fetch-secrets:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
          # NO client-secret

      - name: Fetch Sonar token from KeyVault
        id: secrets
        run: |
          token=$(az keyvault secret show \
            --vault-name ggtlgprodazeu1aiv1 \
            --name app-sonartoken \
            --query value -o tsv)
          echo "::add-mask::$token"
          echo "sonar_token=$token" >> "$GITHUB_OUTPUT"

      - uses: SonarSource/sonarqube-scan-action@v7
        env:
          SONAR_TOKEN: ${{ steps.secrets.outputs.sonar_token }}
```

### Step 2 — Azure side

In the Azure portal (or via Terraform/Bicep):

1. Create or reuse a Service Principal.
2. Add a `FederatedIdentityCredential`:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:your-org/example-service:ref:refs/heads/main`
   - Audience: `api://AzureADTokenExchange`
3. Grant the SP minimal RBAC on the KeyVault (`Key Vault Secrets User` role).
4. Remove `AZURE_CLIENT_SECRET` from GitHub repo secrets.

**Effect**: no quarterly secret rotation, no leak vector, smaller blast radius if the SP is compromised (no portable credential to exfiltrate).

---

## Example 6: Conditional Workflow Skip (project's gatekeeper pattern)

The project's gatekeeper job conditionally enables downstream jobs based on `paths-filter`. Distilled standalone version for projects without the shared workflow:

```yaml
jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      code: ${{ steps.filter.outputs.code }}
    steps:
      - uses: actions/checkout@v4

      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            code:
              - 'app/**/*.py'
              - 'tests/**/*.py'
              - 'pyproject.toml'
              - 'poetry.lock'

  qa:
    needs: changes
    if: needs.changes.outputs.code == 'true'
    runs-on: ubuntu-latest
    steps:
      # ... QA steps ...
```

This is more efficient than `paths:` filters at the workflow level when the workflow has multiple jobs, only some of which depend on code changes.

---

## Anti-patterns observed in the project

| File | Issue | Fix |
|---|---|---|
| `quality-versioning-pipeline.yaml` | No workflow-level `concurrency` block | Add `concurrency: { group: ..., cancel-in-progress: ${{ !contains(github.ref, 'main') }} }` |
| `quality-versioning-pipeline.yaml` (multiple jobs) | Shared workflows pinned at `@main` | Pin to a tag (`@v1.2.0`) once the shared repo issues releases |
| `quality-versioning-pipeline.yaml` | Stored `AZURE_CLIENT_SECRET` | Migrate to OIDC + Workload Identity Federation |
| `quality-versioning-pipeline.yaml` | `fetch_depth: 50` on versioning job | `0` is required for full tag history; 50 may miss older releases |
| `quality-versioning-pipeline.yaml` | No clear branch protection requiring `ci_result` to pass | Set `ci_result` as a required check in branch protection settings |

---

## Summary table — refactor priority

| Priority | Change | Effort | Impact |
|---|---|---|---|
| P1 | Add workflow-level `concurrency:` | XS | CI minute savings, no race |
| P1 | Migrate `AZURE_CLIENT_SECRET` → OIDC | M | No quarterly rotation, better security |
| P2 | Pin shared workflows to versioned tags | S | Stable consumer behavior |
| P2 | Set `ci_result` as required branch check | XS | Hard quality gate |
| P3 | `fetch_depth: 50` → `0` on versioning | XS | Full tag history available |
