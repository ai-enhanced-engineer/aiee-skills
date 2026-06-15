# AWS CI/CD Patterns — Examples

## CI Workflow — Lint, Test, Docker Build Gate

```yaml
name: CI
on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  id-token: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install uv && uv sync
      - run: uv run ruff check .
      - run: uv run pytest --cov=src --cov-fail-under=80

  docker-build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/build-push-action@v5
        with:
          push: false
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## Deploy Workflow — ECR Push + App Runner

```yaml
name: Deploy
on:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - name: Login to ECR
        id: ecr-login
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: |
            ${{ steps.ecr-login.outputs.registry }}/my-api:${{ github.sha }}
            ${{ steps.ecr-login.outputs.registry }}/my-api:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Deploy to App Runner
        if: ${{ vars.APP_RUNNER_AUTO_DEPLOY != 'true' }}
        run: |
          aws apprunner start-deployment \
            --service-arn ${{ vars.APP_RUNNER_SERVICE_ARN }}
```

## Terraform Workflow — Plan on PR, Apply on Merge

```yaml
name: Terraform
on:
  pull_request:
    paths: ["infra/**"]
  push:
    branches: [main]
    paths: ["infra/**"]

permissions:
  contents: read
  id-token: write
  pull-requests: write

jobs:
  terraform:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: infra
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AWS_TERRAFORM_ROLE_ARN }}
          aws-region: ${{ vars.AWS_REGION }}

      - uses: hashicorp/setup-terraform@v3

      - run: terraform init
      - run: terraform plan -out=tfplan
      - run: terraform apply -auto-approve tfplan
        if: github.ref == 'refs/heads/main'
        # CRITICAL: Never use cancel-in-progress: true on apply jobs
```

## Reusable Workflow Context

### Explicit Boolean Input for Push Control

```yaml
on:
  workflow_call:
    inputs:
      push_image:
        type: boolean
        default: false
```

## Deploy Safety Examples

### Shell Injection Guard for workflow_dispatch

```yaml
- name: Validate image tag
  run: |
    if [[ ! "$IMAGE_TAG" =~ ^[a-zA-Z0-9._-]{1,128}$ ]]; then
      echo "::error::Invalid IMAGE_TAG format"; exit 1
    fi
  env:
    IMAGE_TAG: ${{ inputs.image_tag }}
```

### Health Check with Fail-Exit Flag

```bash
ok=0
for i in $(seq 1 10); do
  curl -sf http://localhost/health && ok=1 && break || sleep 3
done
[ $ok -eq 1 ] || exit 1
```

### Migration Retry in SSM Deploy

```bash
ok=0
for i in $(seq 1 10); do
  docker exec <container> python manage.py migrate --noinput && ok=1 && break || sleep 3
done
[ $ok -eq 1 ] || { docker logs --tail 20 <container>; exit 1; }
```
