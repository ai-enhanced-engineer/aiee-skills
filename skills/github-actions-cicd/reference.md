# GitHub Actions CI/CD for Python — Reference

Detailed reference for GHA-specific syntax + Python tooling. Companion to `SKILL.md`.

For cloud-deployment patterns (OIDC for GCP/AWS, Cloud Run / App Runner / ECR), defer to `gcp-cicd-patterns` and `aws-cicd-patterns`. Conventional Commits format (`feat` / `fix` / `perf` / `BREAKING CHANGE` + `!`) maps to SemVer increments (MINOR / PATCH / PATCH / MAJOR); `python-semantic-release` parses commit history to compute the next version.

---

## 1. Poetry Caching

### The recommended pattern (2025)

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.11"

- name: Install Poetry
  uses: snok/install-poetry@v1
  with:
    virtualenvs-create: true
    virtualenvs-in-project: true   # .venv inside repo root → deterministic path

- name: Cache Poetry virtualenv
  uses: actions/cache@v4
  with:
    path: .venv
    key: ${{ runner.os }}-poetry-${{ hashFiles('**/poetry.lock') }}
    restore-keys: |
      ${{ runner.os }}-poetry-

- name: Install dependencies
  run: poetry install --no-interaction --no-root
```

**Why not `actions/setup-python@v5`'s `cache: 'poetry'`?** It needs Poetry already installed to read `poetry.lock` for the cache key — but installing Poetry before `setup-python` can cause a Python version mismatch. The `snok/install-poetry` pattern sidesteps this entirely.

### Cache key choice

- Key on `**/poetry.lock` hash — stale cache is never silently wrong.
- `restore-keys` allows a partial hit: a different lockfile reuses the previous `.venv` and reinstalls just what changed.
- `--no-interaction` with `poetry install` suppresses prompts that would otherwise hang in non-TTY CI runners.
- Use `--no-root` when not building a distributable; install separately if needed.

---

## 2. SonarQube Scanner

### Action versions (2026)

- `SonarSource/sonarqube-scan-action@v7` — current. Scanner CLI v8, Java 21 embedded JRE.
- The legacy `sonarcloud-github-action` is deprecated — redirect to the v7 action.

### Workflow steps

```yaml
- name: Run tests with coverage
  run: poetry run pytest --cov=app --cov-report=xml

- name: SonarQube Scan
  uses: SonarSource/sonarqube-scan-action@v7.1.0
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    # SONAR_HOST_URL only for self-hosted; SonarCloud reads from sonar-project.properties

- name: SonarQube Quality Gate
  uses: SonarSource/sonarqube-quality-gate-action@v1
  timeout-minutes: 5
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

### `sonar-project.properties`

```properties
sonar.organization=<org-key>
sonar.projectKey=<project-key>
sonar.sources=app
sonar.tests=tests/
sonar.test.exclusions=tests/**
sonar.python.coverage.reportPaths=coverage.xml
```

### Mandatory: `fetch-depth: 0`

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0   # SonarQube needs full git history for blame + new-code detection
```

### v6 → v7 breaking change

In v6+, the `args` option no longer supports full bash syntax (command injection prevention). Multi-value parameters must be newline-separated, not semicolon-separated:

```yaml
# v7 — newlines
- uses: SonarSource/sonarqube-scan-action@v7
  with:
    args: >
      -Dsonar.projectKey=foo
      -Dsonar.organization=bar

# v6 — was: args: -Dsonar.projectKey=foo;-Dsonar.organization=bar
```

---

## 3. Semantic Versioning + Changelog

### Use `python-semantic-release`, not the Node version

For Python services:
- Stamps `pyproject.toml` natively (`tool.poetry.version` or `project.version`).
- No Node runtime required in the release job.
- Understands Python package structure.

### Conventional commit → version bump

| Commit prefix | Version component |
|---|---|
| `fix:`, `perf:` | PATCH |
| `feat:` | MINOR |
| `BREAKING CHANGE:` (footer) or `!` suffix | MAJOR |

### Release workflow

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write       # required to push the version bump commit and tag

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0   # full tag history

      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - run: pip install python-semantic-release

      - name: Run semantic-release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          semantic-release version    # bump version, write CHANGELOG.md, commit, tag
          semantic-release publish    # push tag + create GitHub Release
```

### `pyproject.toml` configuration

```toml
[tool.semantic_release]
commit_parser = "conventional"
version_toml = ["pyproject.toml:project.version"]

[tool.semantic_release.changelog.default_templates]
changelog_file = "CHANGELOG.md"
```

### PR title validation

A separate workflow validates that PR titles use conventional format. After squash merge, the PR title becomes the commit message — so enforcing conventional format at PR-title time guarantees parseable history for `python-semantic-release`:

```yaml
name: PR Title Check

on:
  pull_request:
    types: [opened, edited, reopened, synchronize]

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
```

---

## 4. Workflow Triggers, Concurrency, Path Filters

### Trigger patterns

```yaml
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
    paths-ignore:
      - "**.md"
      - "docs/**"
  workflow_dispatch:                          # manual trigger from UI
    inputs:
      bump_version:
        type: boolean
        default: false
```

`paths:` on `pull_request` saves CI minutes by skipping runs for doc-only changes. Don't use overly narrow filters on review workflows that also check infra files.

### Concurrency — kill stale PR runs

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

When a new push arrives on the same branch, the running job is killed.

### Conditional cancellation — protect main

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ !contains(github.ref, 'refs/heads/main') }}
```

On `main`, `cancel-in-progress` evaluates to `false` — release jobs are never interrupted.

### Queue depth

GHA concurrency groups allow at most one running + one pending job. A third push cancels the pending job, not the running one. This is expected behavior — design release pipelines around it.

---

## 5. Reusable Workflows

For org-wide patterns (e.g., the project's `your-org/shared-workflows`), use reusable workflows:

```yaml
# In the consumer repo
jobs:
  quality_check:
    uses: your-org/shared-workflows/.github/workflows/quality-check.yaml@main
    with:
      python_version: "3.11"
      ruff_format_check_enabled: true
    secrets:
      AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
      AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
```

```yaml
# In the shared workflow repo (.github/workflows/quality-check.yaml)
on:
  workflow_call:
    inputs:
      python_version:
        type: string
        required: true
      ruff_format_check_enabled:
        type: boolean
        default: true
    secrets:
      AZURE_CLIENT_ID:
        required: true
      AZURE_CLIENT_SECRET:
        required: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # ... steps ...
```

**Pinning**: `@main` is convenient but means consumers see breaking changes immediately. Pin to a tag (`@v1.2.3`) for stable consumers; `@main` only for trusted internal repos.

---

## 6. OIDC for Cloud Auth

Long-lived `AZURE_CLIENT_SECRET` involves quarterly rotation and is a leak vector; OIDC token exchange (Workload Identity Federation) avoids storing the secret entirely:

```yaml
permissions:
  id-token: write     # required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
          # NO client-secret — OIDC token from GHA exchanged for Azure access token
```

Setup on Azure side: create a `FederatedIdentityCredential` linking the GitHub OIDC issuer + repo + ref to the SP.

For GCP/AWS OIDC patterns, see the respective cloud cicd skills.

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Secrets echoed in workflow logs | Use `${{ secrets.X }}` only; never `echo` secret values |
| Hardcoded `AZURE_CLIENT_SECRET` in repo secrets | Migrate to OIDC + Workload Identity Federation |
| No `concurrency` block | Add `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` |
| No `paths:` filter on heavy pipelines | Filter to `app/**`, `tests/**`, `pyproject.toml`, `poetry.lock` |
| `fetch-depth: 1` on Sonar/release jobs | Use `fetch-depth: 0` on `actions/checkout` — SonarQube blame and semantic-release require full history |
| `actions/setup-python` `cache: 'poetry'` | Use `snok/install-poetry@v1` + manual `actions/cache@v4` — avoids chicken-and-egg with Poetry version |
| `@main` pin on community actions | Pin to specific tag (`@v7.1.0`) to avoid silent breaking changes |
| Quality gate as final job, not a required check | Make `sonarqube-quality-gate-action` a required PR status check in branch protection |

---

## `anthropics/claude-code-action@v1` — PR Review Wiring

### Byte-identical workflow validation

The action validates that the workflow file on the PR branch matches the default branch byte-for-byte, including quote style and trailing newlines. Prettier rewrites `'single'` → `"double"` quotes and strips trailing newlines, breaking the check.

**Fix**: add `.github/workflows/` to `.prettierignore`.

```
# .prettierignore
.github/workflows/
```

**First-time-setup expected failure**: on the first PR after changing the workflow shape, the action's own error message confirms validation will fail until the new shape merges to main. Accept this once; do not push directly to main to shortcut the rule.

### Notebook-style direct-prompt workflow (working pattern)

The `plugins: 'code-review@claude-code-plugins'` invocation runs the action and exits 0 but never writes a PR comment — reviewers see a green check with no output in the UI.

Working pattern — drop `plugins:`, use a direct `prompt:` block:

```yaml
name: Claude Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: "--allowedTools 'Bash(gh pr comment:*),Read,Grep,Glob'"
          prompt: |
            Review this PR for correctness, security, and accessibility.
            Format findings as BLOCK / WARN / PASS.
            End with: gh pr comment ${{ github.event.pull_request.number }} --body "..."
```

Key differences from the plugin invocation:
- `permissions: pull-requests: write + issues: write` required for comment posting
- `claude_args` allowlists `gh pr comment` so the action can write the PR comment
- Prompt ends with an explicit `gh pr comment` call — the action will not post a comment automatically without it

### Admin-merge discipline

When the byte-identical check fails on the first PR after a workflow change, accept the failure — do not admin-merge directly to main to shortcut it. Use admin merge only for non-content infrastructure failures (e.g., GH App auth pending propagation) and only with explicit per-action user authorization.

| Anti-Pattern | Pattern |
|---|---|
| `plugins: 'code-review@claude-code-plugins'` invocation | Direct `prompt:` block with `permissions: pull-requests: write` and explicit `gh pr comment` in the prompt |
| Prettier reformatting `.github/workflows/` files | Add `.github/workflows/` to `.prettierignore` |
| Admin-merging to main when byte-identical check fails on first PR | Accept the first-PR failure; it resolves once the new workflow shape is on main |

---

## Laravel CI: Multi-Job + Env Injection

Pattern established across multiple AIEE Laravel services.

### Parallel lint + test jobs (no .env bootstrap)

Inject all config directly via job-level `env:` — no `cp .env.example .env`, no
`php artisan key:generate`. `APP_KEY` is a static base64 string; DB credentials point at a service
container. Removes ~4 fragile bootstrap steps per job.

```yaml
env:
  APP_KEY: base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
  DB_CONNECTION: mysql
  DB_HOST: 127.0.0.1
  DB_PORT: 3306
  DB_DATABASE: testing
  DB_USERNAME: root
  DB_PASSWORD: root

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.2', extensions: pdo_mysql }
      - run: composer install --no-interaction --prefer-dist
      - run: vendor/bin/pint --test   # full tree, not --dirty

  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: testing
        options: >-
          --health-cmd="mysqladmin ping -h localhost -u root -proot"
          --health-interval=10s
          --health-retries=10
        ports: ['3306:3306']
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with: { php-version: '8.2', extensions: pdo_mysql }
      - run: composer install --no-interaction --prefer-dist
      - run: php artisan test --env=testing
```

### When MySQL service is mandatory

Use MySQL service (not SQLite `:memory:`) when ANY migration uses `$table->dropForeign()`
in its `up()` method. SQLite cannot drop foreign keys and crashes with
`BadMethodCallException: SQLite doesn't support dropping foreign keys`.

### Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `cp .env.example .env` + `php artisan key:generate` in CI | Inject `APP_KEY` and `DB_*` directly via job-level `env:`. `.env.example` is often absent or gitignored. |
| `vendor/bin/pint --test --dirty` in CI | `--dirty` checks unstaged working-tree changes — always empty in CI. Use `pint --test` (full tree) or a diff-scoped `git diff ... | xargs pint --test`. Exit 0 every time; lint gate silently disabled. |
| `phpunit.xml <server>` directives for DB_CONNECTION | `<server>` tags override job-level `env:`. Remove the `<server>` directive or use `<env>` with correct precedence. |

---

## References

- [SonarSource/sonarqube-scan-action](https://github.com/SonarSource/sonarqube-scan-action)
- [SonarQube Python test coverage docs](https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/python-test-coverage)
- [python-semantic-release](https://github.com/python-semantic-release/python-semantic-release)
- [GitHub Docs — Concurrency control](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
- [snok/install-poetry action](https://github.com/marketplace/actions/install-poetry-action)
- [actions/setup-python issue #1167](https://github.com/actions/setup-python/issues/1167)
- Foundation: `gcp-cicd-patterns`, `aws-cicd-patterns`
