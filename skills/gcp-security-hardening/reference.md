# GCP Security Hardening Reference

## IAM Configuration

### Role Selection Guide

| Task | Recommended Role | Avoid |
|------|------------------|-------|
| View resources | `roles/viewer` (specific) | `roles/viewer` (project) |
| Deploy Cloud Run | `roles/run.developer` | `roles/run.admin` |
| Read secrets | `roles/secretmanager.secretAccessor` | `roles/secretmanager.admin` |
| Push images | `roles/artifactregistry.writer` | `roles/artifactregistry.admin` |
| Query BigQuery | `roles/bigquery.dataViewer` | `roles/bigquery.admin` |

### Custom Role Best Practices

```yaml
# Only create custom roles when:
# 1. No predefined role fits
# 2. Need to combine permissions
# 3. Need to restrict predefined role

title: "Custom Cloud Run Deployer"
description: "Deploy but not delete Cloud Run services"
stage: "GA"
includedPermissions:
  - run.services.get
  - run.services.list
  - run.services.create
  - run.services.update
  # Explicitly NOT including run.services.delete
```

### IAM Conditions

```hcl
# Time-based access
resource "google_project_iam_member" "temp_access" {
  project = var.project_id
  role    = "roles/viewer"
  member  = "user:contractor@example.com"

  condition {
    title       = "temporary_access"
    description = "Access expires in 7 days"
    expression  = "request.time < timestamp('2025-01-01T00:00:00Z')"
  }
}

# Resource-based access
condition {
  title      = "production_only"
  expression = "resource.name.startsWith('projects/my-project/locations/us-central1/services/prod-')"
}
```

## Least Privilege with Multiple Database Users

**Pattern**: Use different database users for different access levels

**Example from infra-repo**:
- `migration_user`: DDL permissions (CREATE/ALTER/DROP) - used only for schema migrations
- `app_user`: DML permissions with RLS enforcement - used for application runtime queries
- `app_user_auth`: DML permissions bypassing RLS - used for authentication before user context exists

**Key principle**: Grant GitHub Actions workflows access to `app_user` credentials for batch jobs, not `migration_user`:
- ✅ Batch jobs don't need DDL permissions
- ✅ RLS policies enforce customer data isolation
- ✅ Audit trail shows what each user does
- ❌ Don't use migration_user for non-migration tasks (over-privileged)

**IAM equivalent**:
When granting Secret Manager access, consider which credentials the workload actually needs:

```hcl
# ❌ Over-privileged: migration user for batch jobs
secret_id = "app-${each.value}-migration-db-url"  # migration_user with DDL

# ✅ Least privilege: app user for batch jobs
secret_id = "app-${each.value}-db-url"  # app_user with RLS enforcement
```

**Verification**: After granting IAM permissions, verify the binding exists:
```bash
gcloud secrets get-iam-policy <secret-name> --project=<project> | grep <service-account>
```

## Workload Identity Federation

### Pool Configuration

```hcl
# Dedicated project for identity pools
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.identity_project_id
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions Pool"
  description               = "Identity pool for GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.identity_project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Provider"

  # Map GitHub token claims to Google attributes
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Only allow specific repositories
  attribute_condition = <<-EOT
    assertion.repository_owner == "my-org" &&
    assertion.repository.startsWith("my-org/")
  EOT

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}
```

### Service Account Binding

```hcl
# Allow GitHub Actions to impersonate service account
resource "google_service_account_iam_member" "github_actions" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"

  # Restrict to specific repository and branch
  member = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/my-org/my-repo"
}
```

### GKE Workload Identity

```hcl
# Kubernetes service account annotation
resource "kubernetes_service_account" "app" {
  metadata {
    name      = "my-app"
    namespace = "default"
    annotations = {
      "iam.gke.io/gcp-service-account" = google_service_account.app.email
    }
  }
}

# Binding
resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[default/my-app]"
}
```

## Secret Manager

### Secret Rotation Pattern

```hcl
# Secret with automatic rotation
resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password"

  replication {
    auto {}
  }

  rotation {
    rotation_period    = "2592000s"  # 30 days
    next_rotation_time = "2025-01-01T00:00:00Z"
  }

  # Pub/Sub notification on rotation
  topics {
    name = google_pubsub_topic.secret_rotation.id
  }
}

# Version the secret
resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = var.db_password
}
```

### Access Pattern

```hcl
# Grant specific version access
resource "google_secret_manager_secret_iam_member" "accessor" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.app.email}"

  # Only allow access to specific versions
  condition {
    title      = "latest_only"
    expression = "resource.name.endsWith('/versions/latest')"
  }
}
```

## VPC Service Controls

### Perimeter Configuration

```hcl
resource "google_access_context_manager_service_perimeter" "secure" {
  parent = "accessPolicies/${var.access_policy_id}"
  name   = "accessPolicies/${var.access_policy_id}/servicePerimeters/secure_perimeter"
  title  = "Secure Data Perimeter"

  status {
    resources = [
      "projects/${var.project_number}"
    ]

    restricted_services = [
      "bigquery.googleapis.com",
      "storage.googleapis.com",
      "cloudsql.googleapis.com",
    ]

    # Allow specific egress
    egress_policies {
      egress_from {
        identity_type = "ANY_SERVICE_ACCOUNT"
      }
      egress_to {
        resources = ["projects/${var.other_project_number}"]
        operations {
          service_name = "storage.googleapis.com"
          method_selectors {
            method = "google.storage.objects.get"
          }
        }
      }
    }
  }
}
```

## Binary Authorization

### Attestor Setup

```hcl
# Create attestor
resource "google_binary_authorization_attestor" "build" {
  name = "build-attestor"

  attestation_authority_note {
    note_reference = google_container_analysis_note.build.name

    public_keys {
      id = data.google_kms_crypto_key_version.attestor.id
      pkix_public_key {
        public_key_pem      = data.google_kms_crypto_key_version.attestor.public_key[0].pem
        signature_algorithm = data.google_kms_crypto_key_version.attestor.public_key[0].algorithm
      }
    }
  }
}

# Policy requiring attestation
resource "google_binary_authorization_policy" "policy" {
  default_admission_rule {
    evaluation_mode  = "REQUIRE_ATTESTATION"
    enforcement_mode = "ENFORCED_BLOCK_AND_AUDIT_LOG"

    require_attestations_by = [
      google_binary_authorization_attestor.build.name
    ]
  }

  # Allow specific images without attestation (for system images)
  admission_whitelist_patterns {
    name_pattern = "gcr.io/google-containers/*"
  }
}
```

## Organization Policies

### Essential Constraints

```hcl
# Disable service account key creation
resource "google_org_policy_policy" "disable_sa_keys" {
  name   = "organizations/${var.org_id}/policies/iam.disableServiceAccountKeyCreation"
  parent = "organizations/${var.org_id}"

  spec {
    rules {
      enforce = "TRUE"
    }
  }
}

# Require OS Login
resource "google_org_policy_policy" "require_os_login" {
  name   = "organizations/${var.org_id}/policies/compute.requireOsLogin"
  parent = "organizations/${var.org_id}"

  spec {
    rules {
      enforce = "TRUE"
    }
  }
}

# Restrict public IPs
resource "google_org_policy_policy" "vm_external_ip" {
  name   = "organizations/${var.org_id}/policies/compute.vmExternalIpAccess"
  parent = "organizations/${var.org_id}"

  spec {
    rules {
      deny_all = "TRUE"
    }
  }
}
```

---

## IAM Permission Hierarchy

```
Organization Policy (constraints)
    └── Folder IAM (inherited)
        └── Project IAM (scoped)
            └── Resource IAM (specific)
```

Grant at the most specific level possible. Organization policies set constraints; resource-level IAM provides the actual permissions.

---

## Zero Trust Architecture

### BeyondCorp Components

| Component | Purpose |
|-----------|---------|
| **Identity-Aware Proxy (IAP)** | Context-aware access to apps |
| **VPC Service Controls** | API security perimeter |
| **Access Context Manager** | Device/location policies |
| **Binary Authorization** | Verified container deployment |

### Network Security

- **Private Google Access** — Access Google APIs without public IP
- **VPC Peering** — Private connectivity between networks
- **Firewall Rules** — Deny by default, allow by exception
- **Cloud NAT** — Outbound internet without public IPs

---

## Container Security

### Image Security

1. **Minimal base images** — distroless, scratch
2. **Vulnerability scanning** — Artifact Registry scanning
3. **Binary Authorization** — Only signed images deploy
4. **No root** — Run as non-root user

### GKE Hardening

- **Workload Identity** — Pod-level service accounts
- **Network Policies** — Limit pod-to-pod communication
- **Pod Security Standards** — Enforce restrictions
- **Private clusters** — No public node IPs

---

## CI Binary Verification

When downloading third-party binaries in CI, fetch and verify the vendor-provided SHA256 sidecar before executing:

```yaml
curl -o binary "$BIN_URL"
curl -o binary.sha256 "${BIN_URL}.sha256"
sha256sum -c binary.sha256 || exit 1
```

**Limitation:** Same-origin sidecar doesn't protect against a compromised origin. For higher assurance, pin expected hashes in the repository.

---

## WIF Validation Commands

Verify the full binding chain — pool existence alone is insufficient:

```bash
# 1. Pool exists
gcloud iam workload-identity-pools describe POOL \
  --location=global --project=PROJECT_ID

# 2. Provider exists
gcloud iam workload-identity-pools providers describe PROVIDER \
  --workload-identity-pool=POOL --location=global --project=PROJECT_ID

# 3. Binding exists
gcloud iam service-accounts get-iam-policy SA_EMAIL

# 4. IAM roles assigned
gcloud projects get-iam-policy PROJECT_ID \
  --flatten="bindings[].members" \
  --filter="bindings.members:SA_EMAIL" \
  --format="table(bindings.role)"
```

---

## WIF Split-Work Pattern

When WIF setup spans multiple tickets:

| State | Meaning | Action |
|-------|---------|--------|
| Code complete, binding pending | Terraform/code merged, WIF binding not yet created | Document explicitly, create follow-up ticket |
| Binding exists, code pending | WIF configured, service not yet deployed | Safe to deploy when ready |
