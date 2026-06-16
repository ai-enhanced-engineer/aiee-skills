# Terraform Patterns Reference

## Module Design

### Standard Module Structure

```
modules/
└── cloud-sql/
    ├── main.tf          # Resources
    ├── variables.tf     # Inputs with validation
    ├── outputs.tf       # Outputs for other modules
    ├── versions.tf      # Provider constraints
    ├── README.md        # Documentation
    └── examples/
        └── basic/
            └── main.tf  # Usage example
```

### Variable Best Practices

```hcl
# variables.tf

# Required variable with validation
variable "environment" {
  description = "Deployment environment"
  type        = string

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "Environment must be 'staging' or 'production'."
  }
}

# Optional with sensible default
variable "instance_count" {
  description = "Number of instances to create"
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count >= 1 && var.instance_count <= 10
    error_message = "Instance count must be between 1 and 10."
  }
}

# Complex type with defaults
variable "network_config" {
  description = "Network configuration"
  type = object({
    vpc_id     = string
    subnet_ids = list(string)
    private    = optional(bool, true)
  })
}

# Sensitive variable
variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}
```

### Output Patterns

```hcl
# outputs.tf

# Simple output
output "instance_id" {
  description = "The ID of the created instance"
  value       = google_compute_instance.main.id
}

# Conditional output
output "public_ip" {
  description = "Public IP if assigned"
  value       = var.assign_public_ip ? google_compute_instance.main.network_interface[0].access_config[0].nat_ip : null
}

# Sensitive output
output "connection_string" {
  description = "Database connection string"
  value       = "postgresql://${var.username}:${var.password}@${google_sql_database_instance.main.private_ip_address}/${var.database_name}"
  sensitive   = true
}

# Structured output
output "instance_details" {
  description = "Full instance details"
  value = {
    id         = google_compute_instance.main.id
    name       = google_compute_instance.main.name
    private_ip = google_compute_instance.main.network_interface[0].network_ip
    zone       = google_compute_instance.main.zone
  }
}
```

## Provider Configuration

### Version Constraints

```hcl
# versions.tf

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"  # Allow 5.x updates
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}
```

### Provider Aliases

```hcl
# providers.tf

provider "google" {
  project = var.project_id
  region  = var.region
}

# For resources in different regions
provider "google" {
  alias   = "us_west"
  project = var.project_id
  region  = "us-west1"
}

# Usage
resource "google_storage_bucket" "west_backup" {
  provider = google.us_west
  name     = "backup-bucket"
  location = "US-WEST1"
}
```

## State Management

### Backend Configuration

```hcl
# backend.tf

terraform {
  backend "gcs" {
    bucket = "company-terraform-state"
    prefix = "projects/my-project/staging"
  }
}
```

### State Commands

```bash
# List all resources in state
terraform state list

# Show specific resource
terraform state show google_sql_database_instance.main

# Move resource (rename)
terraform state mv google_sql_database_instance.old google_sql_database_instance.new

# Remove from state (without destroying)
terraform state rm google_sql_database_instance.manual

# Import existing resource
terraform import google_sql_database_instance.main projects/my-project/instances/my-db

# Force unlock stuck state
terraform force-unlock LOCK_ID

# Pull state to local file
terraform state pull > state.json

# Push modified state (dangerous!)
terraform state push state.json
```

## Data Sources

### Common Patterns

```hcl
# Get current project
data "google_project" "current" {}

# Get current client config (for auth info)
data "google_client_config" "current" {}

# Look up existing resource
data "google_compute_network" "existing" {
  name    = "existing-vpc"
  project = var.project_id
}

# Get secret value
data "google_secret_manager_secret_version" "db_password" {
  secret = "db-password"
}

# Usage
locals {
  db_password = data.google_secret_manager_secret_version.db_password.secret_data
}
```

## Dynamic Blocks

### Conditional Configuration

```hcl
resource "google_sql_database_instance" "main" {
  name             = var.instance_name
  database_version = "POSTGRES_15"

  settings {
    tier = var.tier

    # Dynamic block for optional backup configuration
    dynamic "backup_configuration" {
      for_each = var.enable_backups ? [1] : []
      content {
        enabled                        = true
        point_in_time_recovery_enabled = var.environment == "production"
        backup_retention_settings {
          retained_backups = var.backup_retention_days
        }
      }
    }

    # Dynamic block from list
    dynamic "database_flags" {
      for_each = var.database_flags
      content {
        name  = database_flags.value.name
        value = database_flags.value.value
      }
    }
  }
}
```

## For Expressions

```hcl
# Transform list
locals {
  instance_names = [for i in range(var.count) : "instance-${i}"]
}

# Filter list
locals {
  production_instances = [for inst in var.instances : inst if inst.environment == "production"]
}

# Create map from list
locals {
  instances_by_name = { for inst in var.instances : inst.name => inst }
}

# Flatten nested structures
locals {
  all_subnets = flatten([
    for network in var.networks : [
      for subnet in network.subnets : {
        network_name = network.name
        subnet_name  = subnet.name
        cidr         = subnet.cidr
      }
    ]
  ])
}
```

## Lifecycle Rules

```hcl
resource "google_compute_instance" "main" {
  name         = var.name
  machine_type = var.machine_type

  lifecycle {
    # Prevent accidental destruction
    prevent_destroy = true

    # Ignore changes to specific attributes
    ignore_changes = [
      metadata["ssh-keys"],
      labels["updated_by"],
    ]

    # Replace before destroy (for zero-downtime)
    create_before_destroy = true

    # Custom replacement trigger
    replace_triggered_by = [
      google_secret_manager_secret_version.config
    ]
  }
}
```

### Secret Management with ignore_changes

**Problem:** Terraform CI/CD with empty default secret values will overwrite production secrets.

**Solution:** Use `lifecycle { ignore_changes }` for manually-managed secrets:

```hcl
resource "google_secret_manager_secret_version" "secret_versions" {
  for_each    = var.secrets
  secret      = google_secret_manager_secret.secrets[each.key].id
  secret_data = var.secrets[each.key]

  # Prevent Terraform from overwriting after initial creation
  lifecycle {
    ignore_changes = [secret_data]
  }
}
```

**Manual rotation:**
```bash
gcloud secrets versions add my-secret --data-file=- <<< "new-value"
```

**When to use:**
- Secrets managed manually or by external rotation tools
- API keys that shouldn't be in Terraform state
- Credentials set once during initial deployment
```

## Moved Blocks (Refactoring)

```hcl
# When renaming resources or moving to modules
moved {
  from = google_sql_database_instance.database
  to   = google_sql_database_instance.main
}

moved {
  from = google_sql_database_instance.main
  to   = module.database.google_sql_database_instance.main
}
```

## Count vs For_Each

```hcl
# Count: for identical resources
resource "google_compute_instance" "workers" {
  count = var.worker_count
  name  = "worker-${count.index}"
}

# For_each with set: for unique resources
resource "google_compute_instance" "named" {
  for_each = toset(["web", "api", "worker"])
  name     = "server-${each.key}"
}

# For_each with map: for resources with different configs
resource "google_compute_instance" "configured" {
  for_each = {
    web    = { machine_type = "e2-medium", disk_size = 50 }
    api    = { machine_type = "e2-standard-2", disk_size = 100 }
    worker = { machine_type = "e2-standard-4", disk_size = 200 }
  }

  name         = "server-${each.key}"
  machine_type = each.value.machine_type

  boot_disk {
    initialize_params {
      size = each.value.disk_size
    }
  }
}
```

## CI/CD IAM Anti-Patterns

> See also: `gcp-cicd-patterns` skill for IAM propagation timing in CI/CD pipelines.

### Self-Permission Chicken-and-Egg

**Problem**: Renaming IAM resources that CI depends on causes CI to lose permissions mid-apply.

**Why it fails:**
```
1. Terraform plan: destroy old IAM binding → create new IAM binding
2. CI starts apply: destroys old binding (CI loses permissions)
3. CI tries to create new binding: PERMISSION_DENIED
```

**Solution**: Apply locally with admin credentials first:

```bash
# 1. Apply locally (has admin permissions)
terraform apply -target=module.iam

# 2. Wait for IAM propagation (up to 7 min globally, 90s usually sufficient)
sleep 90

# 3. Push to trigger CI (which now has new permissions)
git push origin main
```

### State Lock Management in CI/CD

**Problem**: Local `terraform plan` interrupted (Ctrl+C, crash) leaves state locked.

**Pre-Push Checklist:**
- [ ] No local terraform operations in progress
- [ ] State not locked (`terraform state list` runs without error)
- [ ] IAM changes applied locally first (if any)

**Fix stuck locks:**
```bash
terraform force-unlock <LOCK_ID>
```

## IAM Binding Placement Strategy

### Pattern 1: Module-Specific Bindings (recommended for service account permissions)

- **Location**: `modules/service-accounts/main.tf`
- **Use case**: IAM bindings tightly coupled to the service account definition
- **Example**: `liquibase_migration_db_url` and `liquibase_app_level_db_access` bindings
- **Benefit**: Co-location makes all service account permissions discoverable in one place

### Pattern 2: Application-Level Bindings

- **Location**: `terraform/main.tf`
- **Use case**: IAM bindings that depend on environment-specific secrets
- **Example**: Cloud Run service account secret access

### Cross-environment IAM resources

Use `for_each = toset(var.environments)` to handle both staging and production:

```hcl
resource "google_secret_manager_secret_iam_member" "example" {
  for_each = toset(var.environments)

  secret_id = "app-${each.value}-db-url"
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.example.email}"

  depends_on = [google_service_account.example]
}
```

- Single resource definition, instantiated per environment
- Explicit `depends_on` ensures proper creation order

## Systematic Deployment Process

**Critical Rule**: Always follow this sequence - never skip steps

1. **Validate syntax** (fast, catches errors early):
   ```bash
   make validate
   ```

2. **Plan changes** (dry run, preview what will happen):
   ```bash
   make plan-staging  # or make plan-prod
   ```

3. **Review plan output**:
   - Verify resource counts match expectations (X to add, Y to change, Z to destroy)
   - Check for unexpected changes (configuration drift)
   - Review critical resources (databases, IAM, networking)
   - Small drift corrections (like Redis persistence config) are normal

4. **Get user approval** before apply:
   - Explain what will change and why
   - Highlight any risks or costs
   - For production: extra scrutiny required

5. **Apply changes**:
   ```bash
   make apply-staging  # Requires confirmation: "y"
   make apply-prod     # Requires typing: "PRODUCTION"
   ```

6. **Verify critical changes**:
   ```bash
   # Example: Verify IAM policy changes
   gcloud secrets get-iam-policy <secret-name> --project=acme | grep <service-account>
   ```

**Why this matters**: Terraform apply is destructive and irreversible for some resources. The plan step is your safety net.

---

## Environment Separation

### Recommended: Directory per Environment

```
environments/
├── staging/
│   ├── main.tf
│   ├── terraform.tfvars
│   └── backend.tf
└── production/
    ├── main.tf
    ├── terraform.tfvars
    └── backend.tf
```

**Why:** Complete isolation, separate state, clear boundaries.

### Alternative: tfvars Files

```
terraform/
├── main.tf
├── variables.tf
└── environments/
    ├── staging.tfvars
    └── production.tfvars

# Usage
terraform plan -var-file=environments/staging.tfvars
```

**Why:** Less duplication when environments are similar.

### Avoid: Workspaces for Environments

Workspaces share code, making it easy to apply wrong config.

---

## State Safety

- **Enable versioning** - Recover from corruption
- **Enable locking** - Prevent concurrent modifications
- **Encrypt at rest** - State contains secrets
- **Restrict access** - IAM for state bucket
- **Never edit manually** - Use `terraform state` commands

---

## State Lock Prevention in Local Development

**Problem:** Local `terraform plan` interrupted (Ctrl+C, terminal crash, context switch) leaves state locked.

**Symptoms:**
```bash
terraform apply -var-file=environments/staging.tfvars
# Error: Error acquiring the state lock
# Error: Lock Info:
#   ID: 1770739416507297
#   Operation: OperationTypePlan
```

**Prevention Checklist:**
- [ ] Complete plan operation before switching tasks
- [ ] Run plan and apply in same terminal session
- [ ] Avoid Ctrl+C during Terraform operations
- [ ] Close terminal only after operation completes

**Resolution:**
```bash
# Verify state is locked
terraform state list  # Will error if locked

# Force unlock (get LOCK_ID from error message)
terraform force-unlock LOCK_ID
```

**Best Practice Workflow:**
```bash
# 1. Check for existing locks
terraform state list > /dev/null || echo "State is locked"

# 2. Run plan
make plan-staging

# 3. Immediately review output (don't switch contexts)

# 4. Apply in same session
make apply-staging
```

**Why state locks stick:**
- Ctrl+C during operation (lock release skipped)
- Terminal crash (ungraceful exit)
- Network timeout (operation incomplete)
- Multi-user simultaneous access

---

## Zero-Downtime Resource Migration

**Use Case:** Migrate manually-created GCP resources to Terraform without recreating them.

**Pattern:** Import-First Strategy

### Step 1: Import Existing Resources FIRST

```bash
terraform import 'module.workload_identity.google_iam_workload_identity_pool.github_actions' \
  'projects/PROJECT_ID/locations/global/workloadIdentityPools/POOL_ID'
```

**Note:** For `for_each` resources, use bracket notation: `resource["key"]`

### Step 2: Write Matching Terraform Code

Create Terraform resources that EXACTLY match existing GCP state. Use same resource names, match all configuration attributes, don't add new features yet.

### Step 3: Verify Minimal Changes

```bash
terraform plan -var-file=environments/staging.tfvars
# Expected: No "will be destroyed", minimal "will be changed", additive only
```

### Step 4: Apply Additive Changes

```bash
terraform apply -var-file=environments/staging.tfvars
# Typical: IAM bindings created, metadata updated, zero disruption
```

**Why:** Terraform sees resources in state, only applies differences. No recreation = no downtime.

---

## Static SPA Service Account Pattern

When provisioning a service account for a static SPA (nginx + Angular on Cloud Run), do NOT add it to the shared `cloud_run_service_accounts` map that auto-grants `cloudsql.client`. Grant only minimal roles directly:

- `roles/logging.logWriter`
- `roles/artifactregistry.writer`

Add an inline comment to the SA map explaining the intentional exclusion. See `gcp-security-hardening` skill for least-privilege patterns.

---

## Cross-Repo Secret Validation

App secrets follow the `app-${env}-*` naming pattern (e.g., `app-staging-auth-db-url`, `app-staging-redis-url`). App-specific secrets use `{name}-${env}` (e.g., `jwt-secret-staging`).

On every deploy, cross-reference service YAMLs against the `shared_secrets` module in infrastructure-repo.

---

## Multi-Phase Ticket Validation

Each validation phase catches different classes of issues:

| Phase | Catches | Example |
|-------|---------|---------|
| Refinement (static analysis) | Config mismatches, YAML errors | Missing secret in staging.yaml |
| Codebase validation | Severity corrections, false blockers | `auth_service_account_id` output not actually consumed |
| Implementation planning | Gaps invisible to prior phases | JWT IAM grant missing (only visible when writing the fix) |

