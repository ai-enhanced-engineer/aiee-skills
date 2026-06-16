---
name: github-actions-cicd
description: GitHub Actions CI/CD patterns for Python services — Poetry caching, SonarQube scanner, semantic versioning, conventional commits, workflow concurrency, path filters, reusable workflows. Platform-neutral GHA syntax layered on top of cloud-cicd skills (gcp-cicd-patterns, aws-cicd-patterns) which cover deployment patterns. Use for PR validation, quality gates, automated release tagging, and migrating to OIDC.
updated: 2026-06-10
---

# GitHub Actions CI/CD for Python

GitHub Actions–specific syntax and Python tooling integrations. Platform-neutral; deployment patterns for specific clouds live in `gcp-cicd-patterns` / `aws-cicd-patterns`.

## When to use

- Designing a Python QA pipeline (Ruff → pytest → SonarQube → build → release)
- Adding Poetry caching to a workflow
- Integrating SonarQube / SonarCloud quality gate
- Automating semantic versioning from conventional commits
- Adding workflow concurrency to kill stale PR runs
- Migrating from `AZURE_CLIENT_SECRET` / long-lived tokens to OIDC

For cloud-deployment patterns (OIDC for GCP/AWS, Cloud Run / App Runner deploys, environment promotion), see `gcp-cicd-patterns` and `aws-cicd-patterns`. Conventional Commits format (`feat` / `fix` / `perf` / `BREAKING CHANGE`+`!`) maps to SemVer increments (MINOR / PATCH / PATCH / MAJOR); `python-semantic-release` parses commit history to compute the next version.

## Core patterns

| Pattern | One-line rule |
|---|---|
| Poetry cache | `snok/install-poetry@v1` + `actions/cache@v4` keyed on `poetry.lock` hash. `actions/setup-python` `cache: 'poetry'` has chicken-and-egg issues. |
| Path filters | `paths:` on `pull_request` skips runs for doc-only changes |
| Concurrency | `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` — kill stale PR runs |
| Conditional cancel | On `main`, set `cancel-in-progress: ${{ !contains(github.ref, 'main') }}` to never cancel release jobs |
| `fetch-depth: 0` | Required for SonarQube blame and `python-semantic-release` (default `1` breaks both) |
| SonarQube action | `SonarSource/sonarqube-scan-action@v7` (Java 21 embedded JRE). v6→v7 broke `args` syntax. |
| python-semantic-release | Use over Node-based `semantic-release`. Stamps `pyproject.toml` natively, no Node runtime. |
| Reusable workflows | `uses: org/repo/.github/workflows/x.yaml@main` — DRY for org-wide CI patterns |
| OIDC for cloud auth | `permissions: { id-token: write }` + `actions/azure/login@v2` (no client_secret) |

## Quick reference

### Poetry cache + install

```yaml
- uses: actions/setup-python@v5
  with:
    python-version: "3.11"

- uses: snok/install-poetry@v1
  with:
    virtualenvs-create: true
    virtualenvs-in-project: true   # deterministic .venv path

- uses: actions/cache@v4
  with:
    path: .venv
    key: ${{ runner.os }}-poetry-${{ hashFiles('**/poetry.lock') }}
    restore-keys: ${{ runner.os }}-poetry-

- run: poetry install --no-interaction --no-root
```

### SonarQube quality gate

```yaml
- run: poetry run pytest --cov --cov-report=xml

- uses: SonarSource/sonarqube-scan-action@v7
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

- uses: SonarSource/sonarqube-quality-gate-action@v1
  timeout-minutes: 5
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
```

`sonar-project.properties` at repo root:

```properties
sonar.organization=<org-key>
sonar.projectKey=<project-key>
sonar.sources=app
sonar.tests=tests/
sonar.test.exclusions=tests/**
sonar.python.coverage.reportPaths=coverage.xml
```

Mandatory: `actions/checkout@v4` with `fetch-depth: 0`.

### Concurrency + path filters

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
    paths:
      - "app/**"
      - "tests/**"
      - "pyproject.toml"
      - "poetry.lock"
  workflow_dispatch: {}

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ !contains(github.ref, 'refs/heads/main') }}
```

## PHP / Laravel Multi-Job CI

Parallel `lint` + `test` jobs with all configuration injected via the workflow `env:` block — no `.env` bootstrap, no `php artisan key:generate`. Mirrors a pattern used across 4+ AIEE Laravel backend services.

```yaml
env:
  APP_KEY: base64:AAAA...  # static, not generated at runtime
  APP_ENV: testing
  DB_CONNECTION: mysql
  DB_HOST: 127.0.0.1
  DB_DATABASE: testing
  DB_USERNAME: root
  DB_PASSWORD: root

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
```

**When MySQL service is mandatory**: any migration that calls `$table->dropForeign([...])` inside `up()` (not just `down()`) crashes SQLite `:memory:` with `BadMethodCallException`. Run `grep -r 'dropForeign' database/migrations/` before defaulting to SQLite.

**Justfile pattern**: CI inlines underlying tool commands (e.g., `vendor/bin/pint --test`); the `justfile` provides local-dev parity via `just lint`. Keeps CI logs clean, removes a `just`-install step from runners.

| Anti-Pattern | Pattern |
|---|---|
| `vendor/bin/pint --test --dirty` in CI | `--dirty` checks files differing from HEAD in the working tree; CI checkouts have no unstaged changes, so diff is always empty — lint gate silently disabled. Use `pint --test` (full tree) |
| `cp .env.example .env \|\| true` + `artisan key:generate` | `.env.example` is often absent or gitignored; inject `APP_KEY` directly via workflow `env:` |
| Empty `${{ secrets.X }}` substituted into a CLI flag | Produces cryptic argument-parsing errors (e.g., `option requires an argument -- p`). Run `gh secret list` to verify secrets are populated before debugging the command |

## Anti-patterns (top 4)

1. **Secrets in workflow YAML** → use `${{ secrets.X }}` only; OIDC for cloud auth
2. **No concurrency block** → stale and fresh runs race; flaky results, wasted minutes
3. **No `paths:` filter** → README edits trigger full lint + test + Sonar scan
4. **`fetch-depth: 1` (default)** on Sonar/release jobs → SonarQube blame fails; `python-semantic-release` can't find prior tags

## npm Publish Troubleshooting

- **`E404 … PUT` on an existing scoped package is an auth failure, not a missing package.** npm returns a misleading 404 for what is usually an expired or revoked token. Rotate the token secret, then re-run only the failed job in place with `gh run rerun <id> --repo R --failed` (the artifact must still be within retention).
- **Admin-merge gates on CI, not review.** `gh pr merge --admin` bypasses required review but **not** CI — confirm `gh pr checks` are green first. Bypass review, never a red build.

## Important notes

- **`SonarSource/sonarqube-scan-action@v7`** breaking change from v6: the `args` option no longer supports full bash syntax (command injection prevention). Multi-value parameters must be newline-separated, not semicolon-separated.
- **`actions/setup-python@v5`'s `cache: 'poetry'`** has a chicken-and-egg issue — it needs Poetry already installed to read `poetry.lock` for the cache key. The `snok/install-poetry@v1` + manual `actions/cache@v4` pattern works around this.
- **GHA concurrency queue depth is 1** — group allows at most one running + one pending. A third push cancels the pending, not the running.

See `reference.md` for the full pattern catalogue, `examples.md` for the project's reusable-workflow architecture and a standalone-pipeline alternative.
