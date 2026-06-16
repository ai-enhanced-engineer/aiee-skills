# Terraform Patterns Examples

## Complete Module Example

```hcl
# modules/cloud-sql/main.tf

resource "google_sql_database_instance" "main" {
  name             = var.instance_name
  database_version = var.database_version
  region           = var.region
  project          = var.project_id

  deletion_protection = var.environment == "production"

  settings {
    tier              = var.tier
    availability_type = var.high_availability ? "REGIONAL" : "ZONAL"
    disk_size         = var.disk_size
    disk_type         = var.disk_type
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "production"
      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.private_network_id
      require_ssl     = true
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 3  # 3 AM
      update_track = "stable"
    }

    dynamic "database_flags" {
      for_each = var.database_flags
      content {
        name  = database_flags.value.name
        value = database_flags.value.value
      }
    }
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [settings[0].disk_size]  # Managed by autoresize
  }
}

resource "google_sql_database" "main" {
  name     = var.database_name
  instance = google_sql_database_instance.main.name
  project  = var.project_id
}

resource "google_sql_user" "main" {
  name     = var.database_user
  instance = google_sql_database_instance.main.name
  password = var.database_password
  project  = var.project_id
}
```

```hcl
# modules/cloud-sql/variables.tf

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be staging or production."
  }
}

variable "instance_name" {
  description = "Cloud SQL instance name"
  type        = string
}

variable "database_version" {
  description = "PostgreSQL version"
  type        = string
  default     = "POSTGRES_15"
}

variable "tier" {
  description = "Machine tier"
  type        = string
  default     = "db-f1-micro"
}

variable "disk_size" {
  description = "Disk size in GB"
  type        = number
  default     = 10
}

variable "disk_type" {
  description = "Disk type (PD_SSD or PD_HDD)"
  type        = string
  default     = "PD_SSD"
  validation {
    condition     = contains(["PD_SSD", "PD_HDD"], var.disk_type)
    error_message = "Disk type must be PD_SSD or PD_HDD."
  }
}

variable "high_availability" {
  description = "Enable high availability"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "private_network_id" {
  description = "VPC network ID for private IP"
  type        = string
}

variable "database_name" {
  description = "Database name"
  type        = string
}

variable "database_user" {
  description = "Database user"
  type        = string
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

variable "database_flags" {
  description = "Database flags"
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}
```

```hcl
# modules/cloud-sql/outputs.tf

output "instance_name" {
  description = "Instance name"
  value       = google_sql_database_instance.main.name
}

output "private_ip_address" {
  description = "Private IP address"
  value       = google_sql_database_instance.main.private_ip_address
}

output "connection_name" {
  description = "Connection name for Cloud SQL Proxy"
  value       = google_sql_database_instance.main.connection_name
}

output "database_name" {
  description = "Database name"
  value       = google_sql_database.main.name
}
```

## CI/CD Pipeline - GitHub Actions

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  push:
    branches: [main]
    paths: ['terraform/**']
  pull_request:
    paths: ['terraform/**']

env:
  TF_VERSION: '1.6.0'
  WORKING_DIR: 'terraform'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform Format Check
        run: terraform fmt -check -recursive
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Init
        run: terraform init -backend=false
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Validate
        run: terraform validate
        working-directory: ${{ env.WORKING_DIR }}

  plan-staging:
    needs: validate
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
      pull-requests: write

    steps:
      - uses: actions/checkout@v4

      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.SA_EMAIL }}

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Terraform Init
        run: terraform init
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Plan
        id: plan
        run: |
          terraform plan -var-file=environments/staging.tfvars -no-color -out=tfplan
        working-directory: ${{ env.WORKING_DIR }}

      - name: Post Plan to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const plan = `${{ steps.plan.outputs.stdout }}`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Terraform Plan (Staging)\n\`\`\`hcl\n${plan.substring(0, 65000)}\n\`\`\``
            });

  apply-staging:
    needs: plan-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4

      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.SA_EMAIL }}

      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init
        run: terraform init
        working-directory: ${{ env.WORKING_DIR }}

      - name: Terraform Apply
        run: terraform apply -var-file=environments/staging.tfvars -auto-approve
        working-directory: ${{ env.WORKING_DIR }}
```

## Makefile for Terraform

```makefile
# Makefile

.PHONY: init plan apply destroy fmt validate

ENVIRONMENT ?= staging
TF_DIR := terraform
TF_VARS := -var-file=environments/$(ENVIRONMENT).tfvars

init:
	cd $(TF_DIR) && terraform init

plan: init
	cd $(TF_DIR) && terraform plan $(TF_VARS)

apply: init
	cd $(TF_DIR) && terraform apply $(TF_VARS)

destroy: init
	cd $(TF_DIR) && terraform destroy $(TF_VARS)

fmt:
	terraform fmt -recursive $(TF_DIR)

validate: init
	cd $(TF_DIR) && terraform validate

# Shortcuts for environments
plan-staging:
	$(MAKE) plan ENVIRONMENT=staging

plan-prod:
	$(MAKE) plan ENVIRONMENT=production

apply-staging:
	$(MAKE) apply ENVIRONMENT=staging

apply-prod:
	@echo "Are you sure? This will modify PRODUCTION."
	@read -p "Type 'yes' to continue: " confirm && [ "$$confirm" = "yes" ]
	$(MAKE) apply ENVIRONMENT=production

# State operations
state-list:
	cd $(TF_DIR) && terraform state list

import:
	@echo "Usage: make import RESOURCE=google_sql_database_instance.main ID=projects/p/instances/i"
	cd $(TF_DIR) && terraform import $(TF_VARS) $(RESOURCE) $(ID)

# Drift detection
drift-check: init
	cd $(TF_DIR) && terraform plan $(TF_VARS) -detailed-exitcode
```

## Pre-commit Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.88.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
        args:
          - --hook-config=--retry-once-with-cleanup=true
      - id: terraform_tflint
        args:
          - --args=--config=__GIT_WORKING_DIR__/.tflint.hcl
      - id: terraform_docs
        args:
          - --args=--config=.terraform-docs.yml
      - id: terraform_trivy
        args:
          - --args=--severity=HIGH,CRITICAL

  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: check-merge-conflict
      - id: end-of-file-fixer
      - id: trailing-whitespace
```

```hcl
# .tflint.hcl
config {
  module = true
}

plugin "google" {
  enabled = true
  version = "0.26.0"
  source  = "github.com/terraform-linters/tflint-ruleset-google"
}

rule "terraform_naming_convention" {
  enabled = true
}

rule "terraform_documented_variables" {
  enabled = true
}

rule "terraform_documented_outputs" {
  enabled = true
}
```

## Root Module with Modules

```hcl
# terraform/main.tf

locals {
  environment = var.environment
  is_prod     = var.environment == "production"
}

module "network" {
  source = "../modules/vpc-network"

  project_id   = var.project_id
  region       = var.region
  network_name = "${var.project_name}-${local.environment}"
}

module "database" {
  source = "../modules/cloud-sql"

  project_id         = var.project_id
  region             = var.region
  environment        = local.environment
  instance_name      = "${var.project_name}-${local.environment}-db"
  private_network_id = module.network.network_id

  # Environment-specific configuration
  tier                  = local.is_prod ? "db-standard-2" : "db-f1-micro"
  disk_type             = local.is_prod ? "PD_SSD" : "PD_HDD"
  disk_size             = local.is_prod ? 100 : 30
  high_availability     = local.is_prod
  backup_retention_days = local.is_prod ? 30 : 3

  database_name     = var.database_name
  database_user     = var.database_user
  database_password = var.database_password
}

module "redis" {
  source = "../modules/redis"

  project_id    = var.project_id
  region        = var.region
  instance_name = "${var.project_name}-${local.environment}-redis"
  network_id    = module.network.network_id

  tier        = local.is_prod ? "STANDARD_HA" : "BASIC"
  memory_size = local.is_prod ? 5 : 1
}
```

## EC2 Import: Pre-Import Reconnaissance Commands

Capture ground truth before writing HCL to avoid drift from missing attributes:

```bash
# Instance attributes (IAM profile, subnet, monitoring, EBS optimization, tags)
aws ec2 describe-instances --instance-ids <ID> \
  --query 'Reservations[0].Instances[0].{IAM:IamInstanceProfile,Subnet:SubnetId,EbsOpt:EbsOptimized,Monitor:Monitoring.State,Tags:Tags}'

# Volume attributes (type, size, throughput, IOPS — drift-prone on t2/t3)
aws ec2 describe-volumes --volume-ids <ID> \
  --query 'Volumes[0].{Type:VolumeType,Size:Size,Throughput:Throughput,Iops:Iops}'

# EIP association (use AssociationId for import, NOT AllocationId)
aws ec2 describe-addresses --allocation-ids <ID> \
  --query 'Addresses[0].{Domain:Domain,AssociationId:AssociationId}'
```

Missing `credit_specification`, `monitoring`, `ebs_optimized`, `root_block_device.throughput`, and `root_block_device.iops` causes perpetual plan drift on t2/t3 instances.

## Pre-Apply Recon

```bash
aws iam list-open-id-connect-providers          # OIDC (account-scoped singleton)
aws iam list-instance-profiles                   # Existing profiles
aws ssm describe-instance-information            # SSM-managed instances
```
