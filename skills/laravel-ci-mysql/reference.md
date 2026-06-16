# Laravel CI with MySQL — Reference

## Multi-Job Workflow Skeleton

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: pdo_mysql
      - run: composer install --no-interaction --prefer-dist
      - run: vendor/bin/pint --test

  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: testing
        ports:
          - 3306:3306
        options: >-
          --health-cmd="mysqladmin ping -h localhost -u root -proot"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=10
    env:
      APP_KEY: base64:YOUR_STATIC_KEY_HERE
      APP_ENV: testing
      DB_CONNECTION: mysql
      DB_HOST: 127.0.0.1
      DB_PORT: 3306
      DB_DATABASE: testing
      DB_USERNAME: root
      DB_PASSWORD: root
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
          extensions: pdo_mysql
          coverage: pcov
      - run: composer install --no-interaction --prefer-dist
      - run: php artisan migrate --force
      - run: php artisan test --coverage --min=80
```

The `concurrency` block kills superseded runs on rapid pushes. Critical for cost control when developers push fixup commits faster than CI completes.

## CI Budget Expectations

Initial CI bring-up for a new Laravel project typically requires 3–5 iteration cycles to dial in:
1. Env bootstrap issues (`.env.example` absent)
2. Service container health check timing
3. Formatter idempotency (second Pint pass reveals remaining file)
4. PHP version constant compatibility
5. PHPUnit xml conflict with workflow env

Budget for failures during initial CI setup. After the first project's working `ci.yml` + `justfile` + `.pre-commit-config.yaml` triple is established, subsequent Laravel projects can copy the triple and skip most of the iteration.

## PSR-4 Case Sensitivity on Linux CI

PHP filesystems on macOS and Windows are case-insensitive. Linux (CI) is case-sensitive. A directory declared as `App/Http/Controllers/MemberShip/` in a namespace of `Membership` works locally on macOS but breaks `composer autoload` on Linux CI.

Composer warns with `does not comply with psr-4` but does not fail. The mismatch silently becomes a blocker when Larastan is added. Check composer output for PSR-4 warnings and fix casing before enabling Larastan.

## One-Time Style Cleanup Commit

Before enforcing Pint as a CI gate on a codebase with existing style debt, run `vendor/bin/pint` across the entire tree and commit as a standalone `style:` commit:

```
style: apply Pint autofix across full codebase (72 files)

No behavior changes. Separate commit keeps style churn
out of feature PR diffs. Pre-commit gate now enforced.
```

This prevents the first PR under the new gate from being a giant mixed diff of 1400 formatting changes plus the actual feature work. Reviewers can `git log --oneline` and see clearly which commit introduced style enforcement.

## gh CLI for CI Monitoring

```bash
# Block until CI run completes, exit with run status
gh run watch <run-id> --exit-status

# Compact per-job status summary
gh run view <run-id> --json conclusion,jobs \
  --jq '{conclusion, jobs: [.jobs[] | {name, conclusion}]}'

# Get latest run ID for a branch
gh run list --branch <branch-name> --limit 1 --json databaseId --jq '.[0].databaseId'
```

Chain pattern: `gh run watch $(gh run list --branch feat/my-feature --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status && echo "CI passed"`
