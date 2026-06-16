# GCP FinOps Examples

## Terraform Budget Configuration

```hcl
# modules/budget/main.tf - Reusable budget alerting module

variable "project_id" {}
variable "billing_account_id" {}
variable "environment" {}
variable "monthly_budget_usd" { default = 100 }
variable "notification_topic" {}

resource "google_billing_budget" "environment" {
  billing_account = var.billing_account_id
  display_name    = "${var.environment} Environment Budget"

  budget_filter {
    projects = ["projects/${var.project_id}"]
    labels = {
      environment = var.environment
    }
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = var.monthly_budget_usd
    }
  }

  # Progressive alert thresholds
  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.75
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.9
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  all_updates_rule {
    pubsub_topic = var.notification_topic
  }
}

output "budget_id" {
  value = google_billing_budget.environment.id
}
```

## BigQuery Cost Analysis Scripts

### Monthly Cost by Service

```sql
-- monthly_cost_by_service.sql
-- Run in BigQuery against billing export table

SELECT
  service.description AS service,
  currency AS billing_currency,
  ROUND(SUM(cost), 2) AS total_cost,
  ROUND(SUM(cost) / (SELECT SUM(cost) FROM `project.dataset.gcp_billing_export_v1_*`
    WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)) * 100, 1) AS pct_of_total
FROM `project.dataset.gcp_billing_export_v1_*`
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY service.description, currency
ORDER BY total_cost DESC
LIMIT 20;
```

### Cost by Label (Team/Environment)

```sql
-- cost_by_label.sql
-- Attribute costs to teams via resource labels

SELECT
  labels.value AS team,
  service.description AS service,
  ROUND(SUM(cost), 2) AS total_cost
FROM `project.dataset.gcp_billing_export_v1_*`,
UNNEST(labels) AS labels
WHERE
  labels.key = "team"
  AND DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY team, service
ORDER BY team, total_cost DESC;
```

### Daily Cost Trend

```sql
-- daily_cost_trend.sql
-- Identify spending anomalies

SELECT
  DATE(_PARTITIONTIME) AS date,
  ROUND(SUM(cost), 2) AS daily_cost,
  ROUND(AVG(SUM(cost)) OVER (ORDER BY DATE(_PARTITIONTIME) ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 2) AS rolling_avg_7d
FROM `project.dataset.gcp_billing_export_v1_*`
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY date
ORDER BY date DESC;
```

## Shell Script: Cost Report

```bash
#!/bin/bash
# cost_report.sh - Generate weekly cost report
# Usage: ./cost_report.sh PROJECT_ID

PROJECT_ID="${1:?Usage: $0 PROJECT_ID}"
DATASET="billing_export"
TABLE="gcp_billing_export_v1_*"

echo "=== GCP Cost Report for $PROJECT_ID ==="
echo "Generated: $(date)"
echo ""

# Top 5 services by cost
echo "### Top 5 Services (Last 30 Days) ###"
bq query --use_legacy_sql=false --format=pretty "
SELECT
  service.description AS service,
  ROUND(SUM(cost), 2) AS cost_usd
FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY service
ORDER BY cost_usd DESC
LIMIT 5
"

# Month-over-month change
echo ""
echo "### Month-over-Month Change ###"
bq query --use_legacy_sql=false --format=pretty "
WITH current_month AS (
  SELECT SUM(cost) AS total
  FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
  WHERE DATE(_PARTITIONTIME) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
),
previous_month AS (
  SELECT SUM(cost) AS total
  FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
  WHERE DATE(_PARTITIONTIME) >= DATE_SUB(DATE_TRUNC(CURRENT_DATE(), MONTH), INTERVAL 1 MONTH)
    AND DATE(_PARTITIONTIME) < DATE_TRUNC(CURRENT_DATE(), MONTH)
)
SELECT
  ROUND(c.total, 2) AS current_month_cost,
  ROUND(p.total, 2) AS previous_month_cost,
  ROUND((c.total - p.total) / p.total * 100, 1) AS pct_change
FROM current_month c, previous_month p
"
```

## Budget Alert Handler (Cloud Function)

```python
# main.py - Cloud Function to handle budget alerts

import base64
import json
import os
from google.cloud import pubsub_v1

def handle_budget_alert(event, context):
    """
    Process GCP budget alert and route to appropriate channel.

    Deploy: gcloud functions deploy handle_budget_alert \
              --runtime python311 \
              --trigger-topic budget-alerts
    """
    # Decode Pub/Sub message
    data = json.loads(base64.b64decode(event['data']))

    budget_name = data.get('budgetDisplayName', 'Unknown')
    threshold = data.get('alertThresholdExceeded', 0)
    current_spend = data.get('costAmount', 0)
    budget_amount = data.get('budgetAmount', 0)
    currency = data.get('currencyCode', 'USD')

    # Format message
    pct_used = (current_spend / budget_amount * 100) if budget_amount > 0 else 0
    message = (
        f"Budget Alert: {budget_name}\n"
        f"Threshold exceeded: {threshold * 100}%\n"
        f"Current spend: {currency} {current_spend:.2f}\n"
        f"Budget: {currency} {budget_amount:.2f}\n"
        f"Usage: {pct_used:.1f}%"
    )

    # Route by severity
    if threshold >= 1.0:
        # Critical: Page on-call
        send_pagerduty(message, severity="critical")
        send_slack(message, channel="#alerts-critical")
    elif threshold >= 0.75:
        # Warning: Slack notification
        send_slack(message, channel="#cost-alerts")
    else:
        # Info: Just log
        print(message)

    return "OK"


def send_slack(message: str, channel: str):
    """Send to Slack via webhook."""
    import requests
    webhook_url = os.environ.get('SLACK_WEBHOOK_URL')
    if webhook_url:
        requests.post(webhook_url, json={"channel": channel, "text": message})


def send_pagerduty(message: str, severity: str):
    """Send to PagerDuty via Events API."""
    import requests
    routing_key = os.environ.get('PAGERDUTY_ROUTING_KEY')
    if routing_key:
        requests.post(
            "https://events.pagerduty.com/v2/enqueue",
            json={
                "routing_key": routing_key,
                "event_action": "trigger",
                "payload": {
                    "summary": message,
                    "severity": severity,
                    "source": "gcp-budget-alerts"
                }
            }
        )
```

## Makefile: FinOps Automation

```makefile
# Makefile for FinOps operations

PROJECT_ID ?= my-project
BILLING_ACCOUNT ?= 01ABCD-EFGHIJ-KLMNOP

.PHONY: cost-report anomaly-check cleanup-orphans

# Generate weekly cost report
cost-report:
	@./scripts/cost_report.sh $(PROJECT_ID)

# Check for spending anomalies (>20% above rolling average)
anomaly-check:
	@bq query --use_legacy_sql=false \
		"SELECT date, daily_cost, rolling_avg_7d, \
		 ROUND((daily_cost - rolling_avg_7d) / rolling_avg_7d * 100, 1) as pct_above_avg \
		 FROM (...) WHERE pct_above_avg > 20"

# Find and list orphaned resources
cleanup-orphans:
	@echo "=== Orphaned Disks ==="
	@gcloud compute disks list --filter="NOT users:*" --format="table(name,sizeGb,zone)"
	@echo ""
	@echo "=== Orphaned IPs ==="
	@gcloud compute addresses list --filter="status=RESERVED" --format="table(name,address,region)"
	@echo ""
	@echo "=== Unattached Snapshots (>90 days) ==="
	@gcloud compute snapshots list --filter="creationTimestamp<-P90D" --format="table(name,diskSizeGb,creationTimestamp)"

# Apply right-sizing recommendations
right-size-check:
	@gcloud recommender recommendations list \
		--project=$(PROJECT_ID) \
		--location=us-central1 \
		--recommender=google.compute.instance.MachineTypeRecommender \
		--format="table(name,description,primaryImpact.costProjection)"
```

## Resource Labeling Standard

```hcl
# modules/labels/main.tf - Enforce consistent labeling

variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "service" { type = string }
variable "team" { type = string }
variable "cost_center" { default = "engineering" }

locals {
  # Standard labels for all resources
  standard_labels = {
    environment = var.environment
    service     = var.service
    team        = var.team
    cost_center = var.cost_center
    managed_by  = "terraform"
    created_at  = formatdate("YYYY-MM", timestamp())
  }
}

output "labels" {
  value = local.standard_labels
}

# Usage in other modules:
# module "labels" {
#   source      = "../labels"
#   environment = "staging"
#   service     = "api-gateway"
#   team        = "platform"
# }
#
# resource "google_compute_instance" "main" {
#   labels = module.labels.labels
# }
```
