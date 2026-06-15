# GCP Observability Reference

## Cloud Run Configuration

### WebSocket and Long-Lived Connection Timeout

**Problem:** Cloud Run's default `timeoutSeconds: 300` terminates connections at exactly 301 seconds, breaking WebSocket connections, SSE streams, and long-polling.

**Evidence Pattern:** Logs show consistent `request_latency: 301.001s` for WebSocket endpoints with status 101 (Switching Protocols).

**Solution:**

```yaml
# deployments/staging/service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
spec:
  template:
    spec:
      timeoutSeconds: 900  # 15 minutes for WebSocket connections
```

**Apply to existing service:**

```bash
gcloud run services update SERVICE_NAME \
  --timeout=900 \
  --region=REGION
```

**Choosing timeout value:**
- Default: `300s` (5 min) - sufficient for HTTP requests
- WebSocket/SSE: `900s` (15 min) - balance between cost and UX
- Maximum: `3600s` (60 min) - Cloud Run hard limit

---

## Cloud Monitoring Metrics

### Metric Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Gauge** | Point-in-time value | CPU %, memory usage |
| **Delta** | Change since last point | Request count |
| **Cumulative** | Running total | Total bytes sent |

### Key GCP Metrics

```
# Cloud Run
run.googleapis.com/request_count
run.googleapis.com/request_latencies
run.googleapis.com/container/cpu/utilization
run.googleapis.com/container/memory/utilization

# Cloud SQL
cloudsql.googleapis.com/database/cpu/utilization
cloudsql.googleapis.com/database/memory/utilization
cloudsql.googleapis.com/database/postgresql/num_backends
cloudsql.googleapis.com/database/disk/utilization

# Redis
redis.googleapis.com/stats/memory/usage_ratio
redis.googleapis.com/stats/connected_clients
redis.googleapis.com/stats/cache_hit_ratio
```

### Custom Metrics

Create application-specific metrics:

```
custom.googleapis.com/service/request_duration_ms
custom.googleapis.com/business/orders_processed
custom.googleapis.com/queue/depth
```

## SLO Configuration

### Availability SLO

```yaml
# Terraform: google_monitoring_slo
resource "google_monitoring_slo" "availability" {
  service      = google_monitoring_custom_service.my_service.service_id
  slo_id       = "availability-slo"
  display_name = "99.9% Availability"

  goal                = 0.999
  rolling_period_days = 30

  request_based_sli {
    good_total_ratio {
      good_service_filter = <<-EOF
        metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        metric.labels.response_code_class="2xx"
      EOF
      total_service_filter = <<-EOF
        metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
      EOF
    }
  }
}
```

### Latency SLO

```yaml
resource "google_monitoring_slo" "latency" {
  service      = google_monitoring_custom_service.my_service.service_id
  slo_id       = "latency-slo"
  display_name = "P95 Latency < 200ms"

  goal                = 0.95
  rolling_period_days = 30

  request_based_sli {
    distribution_cut {
      distribution_filter = <<-EOF
        metric.type="run.googleapis.com/request_latencies"
        resource.type="cloud_run_revision"
      EOF
      range {
        max = 200  # milliseconds
      }
    }
  }
}
```

## Alerting Policies

### Fast-Burn Alert (Immediate Response)

```yaml
resource "google_monitoring_alert_policy" "fast_burn" {
  display_name = "SLO Fast Burn Alert"
  combiner     = "OR"

  conditions {
    display_name = "Error budget burn rate > 14x"

    condition_threshold {
      filter = <<-EOF
        select_slo_burn_rate(
          "projects/${var.project_id}/services/${var.service_id}/serviceLevelObjectives/${var.slo_id}",
          "1h"
        )
      EOF
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 14

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [var.pagerduty_channel]

  alert_strategy {
    auto_close = "604800s"  # 7 days
  }
}
```

### Slow-Burn Alert (Trend Warning)

```yaml
resource "google_monitoring_alert_policy" "slow_burn" {
  display_name = "SLO Slow Burn Alert"
  combiner     = "OR"

  conditions {
    display_name = "Error budget burn rate > 2x sustained"

    condition_threshold {
      filter = <<-EOF
        select_slo_burn_rate(
          "projects/${var.project_id}/services/${var.service_id}/serviceLevelObjectives/${var.slo_id}",
          "6h"
        )
      EOF
      duration        = "3600s"  # 1 hour sustained
      comparison      = "COMPARISON_GT"
      threshold_value = 2

      trigger {
        count = 1
      }
    }
  }

  notification_channels = [var.slack_channel]
}
```

## Dashboard Design

### Hierarchy Pattern

```
Level 1: Executive Overview
├── All services status (green/yellow/red)
├── Error budget remaining
└── Incident count

Level 2: Service Dashboard
├── Request rate
├── Error rate
├── Latency (P50, P95, P99)
├── Resource utilization
└── SLO burn rate

Level 3: Component Dashboard
├── Database metrics
├── Cache metrics
├── Queue depth
└── Dependency health
```

### Essential Widgets

| Widget | Metrics | Purpose |
|--------|---------|---------|
| **Traffic** | request_count by status | Volume and errors |
| **Latency** | P50, P95, P99 percentiles | Performance distribution |
| **Saturation** | CPU, memory % | Resource pressure |
| **Errors** | 5xx count, error rate | Reliability |
| **SLO** | Budget remaining % | Business health |

## Log-Based Metrics

**Critical:** Always include `resource.type` in filter for Cloud Run metrics:

```
# Correct - scoped to Cloud Run
resource.type="cloud_run_revision"
AND resource.labels.service_name="my-service"
AND severity>=ERROR

# Wrong - too broad, metric may not populate
severity>=ERROR
AND jsonPayload.service="my-service"
```

**Common resource types:**
- `cloud_run_revision` - Cloud Run services
- `cloud_function` - Cloud Functions
- `gce_instance` - Compute Engine VMs
- `k8s_container` - GKE containers

### Creating from Logs

```yaml
resource "google_logging_metric" "error_count" {
  name   = "api-errors"
  filter = <<-EOF
    resource.type="cloud_run_revision"
    severity>=ERROR
    jsonPayload.service="api"
  EOF

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "error_type"
      value_type  = "STRING"
      description = "Type of error"
    }
  }

  label_extractors = {
    "error_type" = "EXTRACT(jsonPayload.error_type)"
  }
}
```

## Uptime Checks

### HTTP Check

```yaml
resource "google_monitoring_uptime_check_config" "https" {
  display_name = "API Health Check"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "api.example.com"
    }
  }

  content_matchers {
    content = "ok"
    matcher = "CONTAINS_STRING"
  }
}
```
