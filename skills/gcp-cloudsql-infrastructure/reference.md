# Cloud SQL Infrastructure Reference

Detailed configuration patterns for Cloud SQL PostgreSQL provisioning.

## Sizing Calculations

### Memory Requirements

PostgreSQL memory usage:
```
shared_buffers = 25% of RAM (managed by Cloud SQL)
work_mem = 4MB per connection (default)
maintenance_work_mem = 64MB (for vacuums, indexes)

Effective RAM = Total RAM - shared_buffers - OS overhead
```

### Connection Count Formula

```
Max connections = (RAM in MB / 10) - 50

db-f1-micro (614MB): ~11 connections (too low for production)
db-g1-small (1.7GB): ~120 connections
db-standard-1 (3.75GB): ~325 connections
db-standard-2 (7.5GB): ~700 connections
```

### Storage Sizing

```
Initial storage = Current data + 3x growth buffer

Minimum recommendations:
- Dev: 10GB (minimum allowed)
- Staging: 20-50GB
- Production: 50-100GB starting, autogrow enabled
```

---

## VPC Networking

### Private IP Configuration

Cloud SQL with private IP requires:
1. **Private Service Access** configured in VPC
2. **VPC Peering** between your VPC and Google's service VPC
3. **No public IP** on the instance (security best practice)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Your GCP Project                      │
│                                                              │
│  ┌─────────────────┐        ┌─────────────────────────────┐ │
│  │   Cloud Run     │        │     Your VPC Network        │ │
│  │   (Service)     │        │                             │ │
│  │                 │        │  ┌───────────────────────┐  │ │
│  │  ┌───────────┐  │        │  │   Private Service     │  │ │
│  │  │ VPC       │──┼────────┼──│   Access Range        │  │ │
│  │  │ Connector │  │        │  │   10.100.0.0/24       │  │ │
│  │  └───────────┘  │        │  └───────────────────────┘  │ │
│  └─────────────────┘        │            │                │ │
│                              │            │ VPC Peering    │ │
│                              └────────────┼────────────────┘ │
│                                           │                  │
│                              ┌────────────▼────────────────┐ │
│                              │   Google Services VPC       │ │
│                              │   ┌─────────────────────┐   │ │
│                              │   │   Cloud SQL         │   │ │
│                              │   │   (Private IP)      │   │ │
│                              │   │   10.100.0.5        │   │ │
│                              │   └─────────────────────┘   │ │
│                              └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Connection Methods

| From | Method | Latency | Use Case |
|------|--------|---------|----------|
| Cloud Run | VPC Connector | <1ms | Production |
| Cloud Run | Direct VPC Egress | <1ms | Cost optimization |
| Local dev | Cloud SQL Proxy | Variable | Development |
| Cloud Build | Cloud SQL Proxy | Variable | Migrations |

---

## Terraform Patterns

### Instance Configuration

```hcl
resource "google_sql_database_instance" "main" {
  name             = "${var.project}-${var.environment}-db"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier              = var.db_tier  # e.g., "db-g1-small"
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"
    disk_type         = var.environment == "production" ? "PD_SSD" : "PD_HDD"
    disk_size         = var.db_disk_size
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false  # No public IP
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = var.environment == "production"
      backup_retention_settings {
        retained_backups = var.environment == "production" ? 30 : 3
      }
    }

    maintenance_window {
      day          = 7  # Sunday
      hour         = 3  # 3 AM
      update_track = "stable"
    }
  }

  deletion_protection = var.environment == "production"
}
```

### Database and Users

```hcl
resource "google_sql_database" "main" {
  name     = var.database_name
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app" {
  name     = "app_user"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

resource "google_sql_user" "migration" {
  name     = "migration_user"
  instance = google_sql_database_instance.main.name
  password = random_password.migration_password.result
}
```

---

## Performance Tuning

### Key PostgreSQL Parameters

Cloud SQL manages most parameters, but you can tune:

| Parameter | Default | Recommendation |
|-----------|---------|----------------|
| `max_connections` | Auto | Usually sufficient |
| `statement_timeout` | 0 (none) | Set to 30s for safety |
| `log_min_duration_statement` | -1 (off) | 1000ms for slow query logging |

### Enabling Slow Query Logging

```hcl
database_flags {
  name  = "log_min_duration_statement"
  value = "1000"  # Log queries > 1 second
}

database_flags {
  name  = "log_statement"
  value = "ddl"  # Log DDL statements
}
```

---

## Backup and Recovery

### Backup Types

| Type | Frequency | Retention | Recovery Time |
|------|-----------|-----------|---------------|
| Automated | Daily | 3-30 days | 10-30 minutes |
| On-demand | Manual | Until deleted | 10-30 minutes |
| PITR | Continuous | 7 days | Minutes |

### Point-in-Time Recovery (PITR)

```hcl
backup_configuration {
  enabled                        = true
  point_in_time_recovery_enabled = true
  transaction_log_retention_days = 7
}
```

### Recovery Commands

```bash
# Restore from backup
gcloud sql backups restore BACKUP_ID --restore-instance=INSTANCE_NAME

# Clone to specific point in time
gcloud sql instances clone SOURCE_INSTANCE TARGET_INSTANCE \
  --point-in-time="2024-01-15T10:30:00Z"
```

---

## Cost Optimization

### Staging Environment

```hcl
# Cost-optimized staging configuration
tier              = "db-g1-small"      # $28/mo
disk_type         = "PD_HDD"           # $0.09/GB
disk_size         = 20                 # ~$2/mo
availability_type = "ZONAL"            # No HA cost

# Total: ~$30/month
```

### Production Environment

```hcl
# Production configuration with HA
tier              = "db-standard-1"    # $68/mo
disk_type         = "PD_SSD"           # $0.17/GB
disk_size         = 50                 # ~$9/mo
availability_type = "REGIONAL"         # +35% = ~$24/mo

# Total: ~$101/month
```

### Cost Reduction Strategies

| Strategy | Savings | Trade-off |
|----------|---------|-----------|
| db-g1-small → db-f1-micro | 40% | CPU throttling, limited connections |
| SSD → HDD | 47% | Higher latency (10-20ms vs 1-5ms) |
| REGIONAL → ZONAL | 26% | No automatic failover |
| Reduce backup retention | Minor | Less recovery options |

---

## Troubleshooting

### Common Issues

| Error | Cause | Fix |
|-------|-------|-----|
| "Connection refused" | Private IP not configured | Enable VPC peering |
| "Too many connections" | Pool exhaustion | Increase tier or optimize pooling |
| "Disk full" | Autogrow disabled or limit reached | Enable autogrow, increase limit |
| "Instance in maintenance" | Maintenance window active | Wait or reschedule |

### Connectivity Debugging

```bash
# Check instance status
gcloud sql instances describe INSTANCE_NAME

# Verify private IP
gcloud sql instances describe INSTANCE_NAME \
  --format="get(ipAddresses[].ipAddress)"

# Test from Cloud Shell with proxy
cloud_sql_proxy -instances=PROJECT:REGION:INSTANCE=tcp:5432 &
psql -h 127.0.0.1 -U app_user -d database_name
```

### Performance Debugging

```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Find slow queries
SELECT pid, now() - query_start as duration, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - query_start > interval '5 seconds';

-- Check table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;
```
