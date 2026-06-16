# GCP FinOps Reference

Detailed cost engineering patterns and pricing research methods.

## Pricing Research Methodology

### Step 1: Identify Resource Components

For any GCP service, break down into:

```
Total Cost = Compute + Storage + Network + Operations
```

**Example: Cloud SQL**
```
Cloud SQL Cost = Instance (compute)
               + Storage (disk)
               + Backups (if stored)
               + Network (egress)
               + HA (if enabled, +35%)
```

### Step 2: Use GCP Pricing Calculator

1. Navigate to: https://cloud.google.com/products/calculator
2. Add each component
3. Select region (us-central1 is often cheapest)
4. Compare monthly vs committed use discounts

### Step 3: Validate with Billing Export

```sql
-- BigQuery: Monthly cost by service
SELECT
  service.description,
  SUM(cost) as total_cost,
  SUM(usage.amount) as total_usage
FROM `project.dataset.gcp_billing_export_v1_*`
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY service.description
ORDER BY total_cost DESC
```

### Step 4: GCP Billing Console Analysis Pattern

When investigating costs in the GCP Billing Console, follow this checklist to avoid common gotchas:

**Analysis Checklist:**

1. **Enable "Show cumulative" toggle** in the billing console
   - Without this, you see daily charges instead of total spend
   - Cumulative view shows running total, easier to track against budgets

2. **Filter by service AND time period**
   - Select specific service (e.g., "Memorystore for Redis")
   - Set date range to match the period you're analyzing
   - This gives accurate per-service costs for the period

3. **Correlate instance creation dates with billing periods**
   - Check when resources were created: `gcloud <resource> list --format="table(name,createTime)"`
   - Prorate costs if instance only existed for part of the period
   - Formula: `Actual Monthly Cost = Cumulative Charge ÷ Months Deployed`

**Example Workflow:**

```bash
# 1. Check when Redis instance was created
gcloud redis instances describe my-redis-instance \
  --region=us-east4 \
  --format="value(createTime)"
# Output: 2025-11-15T10:00:00Z (created mid-November)

# 2. GCP Billing Console shows $72 cumulative for November-December

# 3. Calculate actual monthly cost
#    Instance existed: Nov 15 - Dec 31 = 1.5 months
#    Actual monthly = $72 ÷ 1.5 = $48/month (not $72!)
```

**Common Mistake:**

```
❌ WRONG: "Billing shows $72 for 2 months, so monthly cost is $72"
✅ RIGHT: "Instance created Nov 15, so billing period is 1.5 months.
           Actual monthly = $72 ÷ 1.5 = $48/month"
```

**IMPORTANT:** Always verify billing currency before cost analysis.

GCP billing may be in local currency (CAD, EUR, etc.), not USD. Check:

```bash
# View billing account details (includes currency)
gcloud billing accounts list

# Or check recent transactions
gcloud billing accounts list --format="table(name,currency)"
```

**Currency conversion gotcha:**
- Documented costs often assume USD
- Actual billing may be CAD, EUR, GBP, etc.
- Example: CA$87.76 over 2 months = ~$35 USD/month (not $5/month documented)

**Pro tip:** Add `currency` field to BigQuery cost analysis:
```sql
SELECT
  service.description,
  currency as cost_currency,
  SUM(cost) as total_cost
FROM `project.dataset.gcp_billing_export_v1_*`
WHERE DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY service.description, currency
ORDER BY total_cost DESC
```

---

## Cost Optimization Patterns

### Pattern 1: Scale-to-Zero

**Applies to:** Cloud Run, Cloud Functions

```hcl
# Before: Always-on
min_instance_count = 1  # $23/month for 1 vCPU

# After: Scale-to-zero
min_instance_count = 0  # $2-5/month typical for staging
```

**Savings:** 80-95% for variable workloads

**Trade-off:** Cold start latency (2-10 seconds)

### Pattern 2: Right-Size Database

**Decision framework:**

| Peak Connections | Recommended Tier | Monthly |
|------------------|------------------|---------|
| <10 | db-f1-micro | $16 |
| 10-50 | db-g1-small | $28 |
| 50-150 | db-standard-1 | $68 |
| 150-300 | db-standard-2 | $136 |

**Research method:**
```sql
-- PostgreSQL: Check max connections used
SELECT max(numbackends) FROM pg_stat_database;
```

### Pattern 3: Storage Tiering

| Access Frequency | Storage Class | $/GB/mo |
|------------------|---------------|---------|
| Frequent | Standard | $0.020 |
| Monthly | Nearline | $0.010 |
| Quarterly | Coldline | $0.004 |
| Yearly | Archive | $0.0012 |

**Example:** Move old logs to Coldline = 80% savings

### Pattern 4: Committed Use Discounts

| Commitment | Discount | Break-Even |
|------------|----------|------------|
| 1 year | 37% | 5 months |
| 3 year | 55% | 6 months |

**When to commit:**
- Production workloads stable for >6 months
- Baseline usage predictable
- Not planning major architecture changes

---

## TCO Analysis Framework

### Components

```
Total Cost of Ownership (TCO) =
  Direct Costs
    + Compute (Cloud Run, GKE, Compute Engine)
    + Storage (Cloud SQL, GCS, Firestore)
    + Network (Egress, Load Balancers)
    + Operations (Monitoring, Logging)

  + Indirect Costs
    + Engineering time to manage
    + Incident response overhead
    + Migration/training costs
```

### Example: Staging Environment TCO

```
Direct Costs (Monthly):
  Cloud SQL db-g1-small:     $28
  Redis 1GB BASIC:           $12
  Cloud Run (scale-to-zero): $5
  VPC Connector:             $3
  Cloud Storage (10GB):      $0.20
  Logging (1GB):             $0.50
  ─────────────────────────────────
  Total Direct:              $48.70

Indirect Costs (Monthly):
  Engineering maintenance:    $0 (fully automated)
  Incident response:         ~$50 (amortized)
  ─────────────────────────────────
  Total Indirect:            $50

TCO:                         ~$100/month
```

---

## Budget Management

### Setting Up Budgets

```hcl
# Terraform budget configuration
resource "google_billing_budget" "staging" {
  billing_account = var.billing_account_id
  display_name    = "Staging Environment Budget"

  budget_filter {
    projects = ["projects/${var.project_id}"]
    labels = {
      environment = "staging"
    }
  }

  amount {
    specified_amount {
      currency_code = "USD"
      units         = "100"  # $100/month
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }
  threshold_rules {
    threshold_percent = 0.75
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  all_updates_rule {
    pubsub_topic = google_pubsub_topic.budget_alerts.id
  }
}
```

### Alert Automation

```python
# Cloud Function to handle budget alerts
def handle_budget_alert(event, context):
    """Process budget alert and notify appropriate channel."""
    import base64
    import json
    from google.cloud import pubsub_v1

    data = json.loads(base64.b64decode(event['data']))

    threshold = data['alertThresholdExceeded']
    current_spend = data['costAmount']
    budget_amount = data['budgetAmount']

    if threshold >= 1.0:
        # Critical: Page on-call
        send_pagerduty_alert(current_spend, budget_amount)
    elif threshold >= 0.75:
        # Warning: Slack notification
        send_slack_notification(current_spend, budget_amount)
    else:
        # Info: Just log
        print(f"Budget at {threshold*100}%: ${current_spend} of ${budget_amount}")
```

---

## GCP CLI Quick Reference

### Memorystore Redis Commands

**List instances (requires --region):**
```bash
# WRONG: Missing region parameter
gcloud redis instances list
# Error: argument --region: required

# CORRECT: Explicit region required
gcloud redis instances list --region=us-east4

# List all regions (slower but comprehensive)
for region in $(gcloud redis instances list-regions --format="value(name)"); do
  echo "=== $region ==="
  gcloud redis instances list --region=$region 2>/dev/null
done
```

**Describe instance:**
```bash
gcloud redis instances describe INSTANCE_NAME \
  --region=REGION \
  --format="yaml(memorySizeGb,tier,currentLocationId,createTime)"
```

**Get cost-relevant details:**
```bash
# Memory size (drives cost)
gcloud redis instances describe INSTANCE_NAME \
  --region=REGION \
  --format="value(memorySizeGb)"

# Tier (BASIC vs STANDARD_HA affects 2x cost)
gcloud redis instances describe INSTANCE_NAME \
  --region=REGION \
  --format="value(tier)"
```

**Common gotchas:**
- `--region` is REQUIRED (not optional like other gcloud commands)
- Region must match instance region (can't use --region=global)
- Use `gcloud redis regions list` to find available regions

---

## Cost Attribution

### Resource Labeling Strategy

```hcl
# Standard labels for all resources
locals {
  common_labels = {
    environment = var.environment
    service     = var.service_name
    team        = "platform"
    cost_center = "engineering"
    managed_by  = "terraform"
  }
}

resource "google_sql_database_instance" "main" {
  settings {
    user_labels = local.common_labels
  }
}
```

### BigQuery Cost Analysis by Label

```sql
-- Monthly cost by service label
SELECT
  labels.value as service,
  SUM(cost) as total_cost
FROM `project.dataset.gcp_billing_export_v1_*`,
UNNEST(labels) as labels
WHERE
  labels.key = "service"
  AND DATE(_PARTITIONTIME) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
GROUP BY service
ORDER BY total_cost DESC
```

---

## Monthly Cost Review Workflow

### Week 1: Data Collection

1. Export billing data to BigQuery
2. Run cost attribution queries
3. Compare to previous month

### Week 2: Analysis

1. Identify top 5 cost drivers
2. Calculate cost per user/request
3. Flag anomalies (>20% increase)

### Week 3: Optimization

1. Right-size underutilized resources
2. Enable scale-to-zero where applicable
3. Archive unused storage

### Week 4: Reporting

1. Update cost dashboards
2. Present findings to team
3. Plan next month's optimizations

---

## Common Cost Mistakes

| Mistake | Impact | Prevention |
|---------|--------|------------|
| HA in staging | +35% | Use ZONAL for non-prod |
| SSD in staging | +89% | Use HDD for staging |
| Always-on Cloud Run | +90% | Enable scale-to-zero |
| No budget alerts | Surprise bills | Set 50/75/90/100% alerts |
| Untagged resources | No visibility | Enforce labels via policy |
| Orphaned disks | $0.17/GB/mo | Regular cleanup scripts |
