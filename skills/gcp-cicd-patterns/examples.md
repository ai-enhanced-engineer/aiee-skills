# GCP CI/CD Examples

## Cloud Build: Complete CI Pipeline

```yaml
# cloudbuild.yaml - CI pipeline for Cloud Run app
steps:
  # Run tests
  - id: 'test'
    name: 'python:3.11-slim'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        pip install -r requirements.txt
        pytest tests/ -v

  # Build container
  - id: 'build'
    name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}:${SHORT_SHA}'
      - '-t'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}:latest'
      - '.'

  # Scan for vulnerabilities
  - id: 'scan'
    name: 'aquasec/trivy:latest'
    args:
      - 'image'
      - '--exit-code=1'
      - '--severity=CRITICAL,HIGH'
      - '--ignore-unfixed'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}:${SHORT_SHA}'

  # Push to Artifact Registry
  - id: 'push'
    name: 'gcr.io/cloud-builders/docker'
    args:
      - 'push'
      - '--all-tags'
      - '${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}'

  # Deploy to staging
  - id: 'deploy-staging'
    name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - '${_SERVICE}'
      - '--image=${_REGION}-docker.pkg.dev/${PROJECT_ID}/${_REPO}/${_SERVICE}:${SHORT_SHA}'
      - '--region=${_REGION}'
      - '--platform=managed'
      - '--no-traffic'
      - '--tag=canary'

substitutions:
  _REGION: us-central1
  _REPO: my-repo
  _SERVICE: my-service

options:
  logging: CLOUD_LOGGING_ONLY
  machineType: 'E2_HIGHCPU_8'

timeout: '1200s'
```

## Cloud Build: GitOps Update

```yaml
# cloudbuild-gitops.yaml - Update env repo after successful build
steps:
  - id: 'clone-env-repo'
    name: 'gcr.io/cloud-builders/git'
    args:
      - 'clone'
      - 'https://github.com/org/env-repo.git'

  - id: 'update-manifest'
    name: 'gcr.io/cloud-builders/gcloud'
    entrypoint: 'bash'
    args:
      - '-c'
      - |
        cd env-repo
        sed -i "s|image:.*|image: ${_IMAGE}:${SHORT_SHA}|g" staging/deployment.yaml
        git config user.email "cloudbuild@example.com"
        git config user.name "Cloud Build"
        git add .
        git commit -m "Update staging to ${SHORT_SHA}"
        git push origin main
```

## Cloud Deploy: Canary Pipeline

```yaml
# deploy/pipeline.yaml
apiVersion: deploy.cloud.google.com/v1
kind: DeliveryPipeline
metadata:
  name: my-app
  labels:
    app: my-app
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
            percentages: [10, 25, 50, 75]
            verify: true
          postdeploy:
            actions: ["notify-slack"]
---
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata:
  name: staging
run:
  location: projects/my-project/locations/us-central1
---
apiVersion: deploy.cloud.google.com/v1
kind: Target
metadata:
  name: production
run:
  location: projects/my-project/locations/us-central1
requireApproval: true
```

## Cloud Run: Traffic Splitting

```bash
#!/bin/bash
# deploy-canary.sh - Manual canary deployment

SERVICE="my-service"
REGION="us-central1"
NEW_IMAGE="gcr.io/project/app:v2"

# Deploy new revision with no traffic
gcloud run deploy $SERVICE \
  --image=$NEW_IMAGE \
  --region=$REGION \
  --no-traffic \
  --tag=canary

# Shift 10% traffic to canary
gcloud run services update-traffic $SERVICE \
  --region=$REGION \
  --to-tags=canary=10

# Monitor metrics...
sleep 300

# If healthy, increase to 50%
gcloud run services update-traffic $SERVICE \
  --region=$REGION \
  --to-tags=canary=50

# Complete rollout
gcloud run services update-traffic $SERVICE \
  --region=$REGION \
  --to-tags=canary=100
```

## Makefile: CI/CD Targets

```makefile
# Makefile for CI/CD operations

PROJECT_ID := my-project
REGION := us-central1
SERVICE := my-service
IMAGE := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/repo/$(SERVICE)

.PHONY: build test push deploy-staging deploy-prod

build:
	docker build -t $(IMAGE):$(shell git rev-parse --short HEAD) .

test:
	docker run --rm $(IMAGE):$(shell git rev-parse --short HEAD) pytest

scan:
	trivy image --exit-code 1 --severity HIGH,CRITICAL $(IMAGE):$(shell git rev-parse --short HEAD)

push: build test scan
	docker push $(IMAGE):$(shell git rev-parse --short HEAD)

deploy-staging: push
	gcloud run deploy $(SERVICE)-staging \
		--image=$(IMAGE):$(shell git rev-parse --short HEAD) \
		--region=$(REGION)

deploy-prod:
	@echo "Creating Cloud Deploy release..."
	gcloud deploy releases create release-$(shell date +%Y%m%d-%H%M%S) \
		--delivery-pipeline=$(SERVICE) \
		--region=$(REGION) \
		--images=app=$(IMAGE):$(shell git rev-parse --short HEAD)
```

## GitHub Actions: GCP Integration

### Terraform Workflow

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  pull_request:
    paths:
      - 'terraform/**'
      - 'modules/**'      # Often forgotten!
      - 'environments/**' # Often forgotten!

jobs:
  plan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/123/locations/global/workloadIdentityPools/github/providers/my-repo'
          service_account: 'terraform@my-project.iam.gserviceaccount.com'

      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init
        working-directory: terraform/

      - name: Terraform Plan
        run: terraform plan -no-color -out=plan.tfplan
        working-directory: terraform/

      - name: Comment Plan
        uses: actions/github-script@v7
        with:
          script: |
            const output = `#### Terraform Plan
            \`\`\`
            ${{ steps.plan.outputs.stdout }}
            \`\`\``;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            })
```

**Service account requirements:**
- `roles/storage.objectAdmin` on state bucket
- `roles/storage.legacyBucketReader` on state bucket
- Various viewer roles for plan operations

### Cloud Run Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloud Run

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write  # Required for Workload Identity

    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/123/locations/global/workloadIdentityPools/github/providers/my-repo'
          service_account: 'github-actions@my-project.iam.gserviceaccount.com'

      - uses: google-github-actions/setup-gcloud@v2

      - name: Build and Push
        run: |
          gcloud builds submit --tag gcr.io/${{ env.PROJECT_ID }}/app:${{ github.sha }}

      - name: Deploy
        run: |
          gcloud run deploy my-service \
            --image=gcr.io/${{ env.PROJECT_ID }}/app:${{ github.sha }} \
            --region=us-central1
```

## Angular Two-Tier CSS Budget Configuration

```json
{
  "type": "anyComponentStyle",
  "maximumWarning": "4kB",
  "maximumError": "6kB"
}
```

Warning at 4kB acts as an early CI signal; error at 6kB blocks the build.

## EAS Build: Fire-and-Forget GitHub Actions

```yaml
eas-build:
  runs-on: ubuntu-latest
  if: github.event_name == 'push'  # Avoid fork PRs + quota waste
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci --legacy-peer-deps
    - run: npm install -g eas-cli@18.6.0  # Pin version
    - run: eas build --non-interactive --no-wait --platform all
      env:
        EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
```

Push-only (`github.event_name == 'push'`) prevents fork PRs from failing on missing secrets and conserves the 30/month free EAS build tier. `--no-wait` delegates the build to EAS infrastructure — no macOS runner needed.
