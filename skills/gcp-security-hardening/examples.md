# GCP Security Hardening Examples

## GitHub Actions with Workload Identity

```yaml
# .github/workflows/deploy.yml
name: Deploy to GCP

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

      # Authenticate without service account key
      - id: auth
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: 'projects/123456789/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
          service_account: 'deployer@my-project.iam.gserviceaccount.com'

      - uses: google-github-actions/setup-gcloud@v2

      - name: Deploy
        run: |
          gcloud run deploy my-service \
            --image=gcr.io/${{ env.PROJECT_ID }}/app:${{ github.sha }} \
            --region=us-central1
```

## Complete Workload Identity Setup

```hcl
# modules/github-workload-identity/main.tf

variable "project_id" {}
variable "github_org" {}
variable "allowed_repos" { type = list(string) }
variable "service_account_roles" { type = list(string) }

# Identity pool
resource "google_iam_workload_identity_pool" "github" {
  project                   = var.project_id
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
}

# Provider with strict conditions
resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  # Strict conditions: only main branch of allowed repos
  attribute_condition = <<-EOT
    assertion.repository_owner == "${var.github_org}" &&
    assertion.ref == "refs/heads/main"
  EOT

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Service account for deployments
resource "google_service_account" "deployer" {
  project      = var.project_id
  account_id   = "github-deployer"
  display_name = "GitHub Actions Deployer"
}

# Grant roles to service account
resource "google_project_iam_member" "deployer_roles" {
  for_each = toset(var.service_account_roles)

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Allow GitHub repos to impersonate
resource "google_service_account_iam_member" "workload_identity" {
  for_each = toset(var.allowed_repos)

  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${each.value}"
}

output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "service_account_email" {
  value = google_service_account.deployer.email
}
```

## Secure Cloud Run Service

```hcl
# Secure Cloud Run deployment

resource "google_cloud_run_v2_service" "secure_app" {
  name     = "secure-app"
  location = var.region

  template {
    # Use dedicated service account (not default)
    service_account = google_service_account.app.email

    containers {
      image = var.image

      # Read secrets from Secret Manager
      env {
        name = "DB_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      # Resource limits
      resources {
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }
    }

    # VPC connector for private networking
    vpc_access {
      connector = google_vpc_access_connector.connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    # Security settings
    max_instance_request_concurrency = 80
    timeout                          = "300s"
  }

  # Require authentication
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
}

# IAM: Only allow authenticated access
resource "google_cloud_run_v2_service_iam_member" "invoker" {
  name     = google_cloud_run_v2_service.secure_app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.caller.email}"
}

# Block all unauthenticated access
resource "google_cloud_run_v2_service_iam_member" "no_public" {
  name     = google_cloud_run_v2_service.secure_app.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"

  # This binding is explicitly NOT created - using count = 0
  count = 0
}
```

## GKE Security Configuration

```hcl
# Secure GKE cluster

resource "google_container_cluster" "secure" {
  name     = "secure-cluster"
  location = var.region

  # Use Autopilot for managed security
  enable_autopilot = true

  # Or for Standard clusters:
  # Private cluster - no public IPs on nodes
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false  # Allow kubectl from authorized networks
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # Authorized networks for API access
  master_authorized_networks_config {
    cidr_blocks {
      cidr_block   = var.admin_cidr
      display_name = "Admin Network"
    }
  }

  # Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Binary Authorization
  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

  # Network policy
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  # Security posture
  security_posture_config {
    mode               = "BASIC"
    vulnerability_mode = "VULNERABILITY_ENTERPRISE"
  }

  # Shielded nodes
  node_config {
    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }

  # Release channel for automatic updates
  release_channel {
    channel = "STABLE"
  }
}
```

## IAM Audit Configuration

```hcl
# Enable comprehensive audit logging

resource "google_project_iam_audit_config" "all_services" {
  project = var.project_id
  service = "allServices"

  audit_log_config {
    log_type = "ADMIN_READ"
  }

  audit_log_config {
    log_type = "DATA_READ"
    # Exempt high-volume service accounts from data read logs
    exempted_members = [
      "serviceAccount:${google_service_account.monitoring.email}"
    ]
  }

  audit_log_config {
    log_type = "DATA_WRITE"
  }
}

# Alert on suspicious IAM changes
resource "google_logging_metric" "iam_changes" {
  name   = "iam-policy-changes"
  filter = <<-EOF
    protoPayload.methodName="SetIamPolicy"
    OR protoPayload.methodName="google.iam.admin.v1.CreateServiceAccount"
    OR protoPayload.methodName="google.iam.admin.v1.CreateServiceAccountKey"
  EOF

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "iam_alert" {
  display_name = "IAM Policy Changes"
  combiner     = "OR"

  conditions {
    display_name = "IAM changes detected"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.iam_changes.name}\""
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
    }
  }

  notification_channels = var.security_channels
}
```

## Security Checklist Script

```bash
#!/bin/bash
# security-audit.sh - Quick security posture check

PROJECT_ID="${1:-$(gcloud config get-value project)}"

echo "=== GCP Security Audit for $PROJECT_ID ==="

echo -e "\n--- Service Account Keys ---"
gcloud iam service-accounts list --project=$PROJECT_ID --format="table(email)" | while read SA; do
  KEYS=$(gcloud iam service-accounts keys list --iam-account=$SA --managed-by=user --format="value(name)" 2>/dev/null | wc -l)
  if [ "$KEYS" -gt "0" ]; then
    echo "WARNING: $SA has $KEYS user-managed keys"
  fi
done

echo -e "\n--- Public Cloud Run Services ---"
gcloud run services list --project=$PROJECT_ID --format="value(metadata.name)" | while read SVC; do
  POLICY=$(gcloud run services get-iam-policy $SVC --region=us-central1 --format=json 2>/dev/null)
  if echo "$POLICY" | grep -q "allUsers"; then
    echo "WARNING: $SVC allows unauthenticated access"
  fi
done

echo -e "\n--- Cloud SQL Public IPs ---"
gcloud sql instances list --project=$PROJECT_ID --format="table(name,ipAddresses[].type)" | grep -i PRIMARY && echo "WARNING: Found Cloud SQL with public IP"

echo -e "\n--- Audit Logging Status ---"
gcloud projects get-iam-policy $PROJECT_ID --format=json | jq '.auditConfigs // "NOT CONFIGURED"'

echo -e "\n=== Audit Complete ==="
```
