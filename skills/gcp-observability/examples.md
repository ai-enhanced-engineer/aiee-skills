# GCP Observability Examples

## Complete SLO Setup with Terraform

```hcl
# modules/slo/main.tf - Reusable SLO module

variable "project_id" {}
variable "service_name" {}
variable "availability_target" { default = 0.999 }
variable "latency_target_ms" { default = 200 }
variable "latency_percentile" { default = 0.95 }
variable "notification_channels" { type = list(string) }

# Define the service
resource "google_monitoring_custom_service" "service" {
  service_id   = var.service_name
  display_name = var.service_name
}

# Availability SLO
resource "google_monitoring_slo" "availability" {
  service      = google_monitoring_custom_service.service.service_id
  slo_id       = "${var.service_name}-availability"
  display_name = "${var.service_name} Availability"

  goal                = var.availability_target
  rolling_period_days = 30

  request_based_sli {
    good_total_ratio {
      good_service_filter = <<-EOF
        metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        resource.labels.service_name="${var.service_name}"
        metric.labels.response_code_class="2xx"
      EOF
      total_service_filter = <<-EOF
        metric.type="run.googleapis.com/request_count"
        resource.type="cloud_run_revision"
        resource.labels.service_name="${var.service_name}"
      EOF
    }
  }
}

# Fast-burn alert
resource "google_monitoring_alert_policy" "fast_burn" {
  display_name = "${var.service_name} - Fast Burn (Page)"
  combiner     = "OR"

  conditions {
    display_name = "Burn rate > 14x (1h window)"
    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.availability.id}\", \"1h\")"
      duration        = "0s"
      comparison      = "COMPARISON_GT"
      threshold_value = 14
      trigger { count = 1 }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "Error budget burning at >14x rate. Will exhaust in <1 hour if sustained."
    mime_type = "text/markdown"
  }
}

# Slow-burn alert
resource "google_monitoring_alert_policy" "slow_burn" {
  display_name = "${var.service_name} - Slow Burn (Warn)"
  combiner     = "OR"

  conditions {
    display_name = "Burn rate > 2x sustained (6h window)"
    condition_threshold {
      filter          = "select_slo_burn_rate(\"${google_monitoring_slo.availability.id}\", \"6h\")"
      duration        = "3600s"
      comparison      = "COMPARISON_GT"
      threshold_value = 2
      trigger { count = 1 }
    }
  }

  notification_channels = var.notification_channels
}

output "slo_id" {
  value = google_monitoring_slo.availability.id
}
```

## Structured Logging in Python

```python
# logging_config.py - Cloud-native structured logging

import json
import logging
import sys
from typing import Any

class CloudLoggingFormatter(logging.Formatter):
    """Format logs for Cloud Logging ingestion."""

    SEVERITY_MAP = {
        logging.DEBUG: "DEBUG",
        logging.INFO: "INFO",
        logging.WARNING: "WARNING",
        logging.ERROR: "ERROR",
        logging.CRITICAL: "CRITICAL",
    }

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "severity": self.SEVERITY_MAP.get(record.levelno, "DEFAULT"),
            "message": record.getMessage(),
            "logging.googleapis.com/sourceLocation": {
                "file": record.pathname,
                "line": record.lineno,
                "function": record.funcName,
            },
        }

        # Add trace context if available
        if hasattr(record, "trace_id"):
            log_entry["logging.googleapis.com/trace"] = (
                f"projects/{record.project_id}/traces/{record.trace_id}"
            )

        # Add custom fields
        if hasattr(record, "extra"):
            log_entry.update(record.extra)

        # Add exception info
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


def setup_logging(service_name: str, level: int = logging.INFO) -> logging.Logger:
    """Configure structured logging for Cloud Run."""
    logger = logging.getLogger(service_name)
    logger.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CloudLoggingFormatter())
    logger.addHandler(handler)

    return logger


# Usage
logger = setup_logging("api-gateway")

# Simple log
logger.info("Request processed")

# Log with context
logger.info(
    "Order created",
    extra={
        "extra": {
            "order_id": "123",
            "customer_id": "456",
            "amount": 99.99,
        }
    }
)
```

## Dashboard as Code

```hcl
# dashboard.tf - Service overview dashboard

resource "google_monitoring_dashboard" "service" {
  dashboard_json = jsonencode({
    displayName = "${var.service_name} Overview"

    gridLayout = {
      columns = 2
      widgets = [
        # Row 1: Traffic and Errors
        {
          title = "Request Rate"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${var.service_name}\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_RATE"
                  }
                }
              }
            }]
          }
        },
        {
          title = "Error Rate"
          xyChart = {
            dataSets = [{
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${var.service_name}\" metric.labels.response_code_class!=\"2xx\""
                  aggregation = {
                    alignmentPeriod  = "60s"
                    perSeriesAligner = "ALIGN_RATE"
                  }
                }
              }
            }]
          }
        },
        # Row 2: Latency
        {
          title = "Latency Percentiles"
          xyChart = {
            dataSets = [
              {
                legendTemplate = "P50"
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_PERCENTILE_50"
                    }
                  }
                }
              },
              {
                legendTemplate = "P95"
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_PERCENTILE_95"
                    }
                  }
                }
              },
              {
                legendTemplate = "P99"
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\""
                    aggregation = {
                      alignmentPeriod    = "60s"
                      perSeriesAligner   = "ALIGN_PERCENTILE_99"
                    }
                  }
                }
              }
            ]
          }
        },
        # Row 2: SLO Budget
        {
          title = "Error Budget Remaining"
          scorecard = {
            timeSeriesQuery = {
              timeSeriesFilter = {
                filter = "select_slo_budget_fraction(\"${var.slo_id}\")"
              }
            }
            thresholds = [
              { value = 0.5, color = "YELLOW" },
              { value = 0.2, color = "RED" }
            ]
          }
        }
      ]
    }
  })
}
```

## Log-Based Alert

```hcl
# Alert on specific error pattern in logs

resource "google_logging_metric" "auth_failures" {
  name   = "auth-failures"
  filter = <<-EOF
    resource.type="cloud_run_revision"
    jsonPayload.event="authentication_failed"
    severity>=WARNING
  EOF

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "auth_spike" {
  display_name = "Authentication Failure Spike"
  combiner     = "OR"

  conditions {
    display_name = "Auth failures > 100/min"
    condition_threshold {
      filter          = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.auth_failures.name}\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 100

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = var.security_channels
}
```

## gcloud Commands

```bash
# Prerequisites
gcloud components install alpha  # Required for notification channel management
```

```bash
# List SLOs
gcloud slo list --service=my-service

# Get error budget status
gcloud monitoring slos describe projects/my-project/services/my-service/serviceLevelObjectives/availability-slo

# Create notification channel
gcloud alpha monitoring channels create \
  --display-name="PagerDuty" \
  --type=pagerduty \
  --channel-labels=service_key=YOUR_KEY

# Test alert
gcloud alpha monitoring policies test \
  --policy-from-file=alert-policy.yaml
```

## CLI Log Access Scripts

Wrap gcloud logging queries in shell scripts for quick incident response.

### Recent Errors

```bash
#!/bin/bash
SERVICE="${1:-gateway-service-staging}"
HOURS="${2:-1}"

gcloud logging read "
  resource.type=cloud_run_revision
  AND resource.labels.service_name=\"$SERVICE\"
  AND (severity>=ERROR OR httpRequest.status>=500)
  AND timestamp>=\"$(date -u -v-${HOURS}H +%Y-%m-%dT%H:%M:%SZ)\"
" \
  --limit=50 \
  --format="table(timestamp,severity,jsonPayload.message,httpRequest.status)" \
  --project=PROJECT_ID
```

### Crash Detection

```bash
#!/bin/bash
SERVICE="${1:-gateway-service-staging}"

gcloud logging read "
  resource.type=cloud_run_revision
  AND resource.labels.service_name=\"$SERVICE\"
  AND (
    severity>=CRITICAL
    OR textPayload=~\"(?i)(crash|killed|exit|oom|panic|fatal)\"
    OR jsonPayload.message=~\"(?i)(websocket.*disconnect|connection refused)\"
  )
" \
  --limit=50 \
  --format="table(timestamp,severity,jsonPayload.message)" \
  --project=PROJECT_ID
```

### Real-Time Log Streaming

```bash
gcloud beta run services logs tail SERVICE_NAME \
  --project=PROJECT_ID \
  --region=REGION
```
