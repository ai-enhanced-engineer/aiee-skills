---
name: gcp-cloudsql-infrastructure
description: Cloud SQL PostgreSQL infrastructure provisioning and operations. Machine type selection, storage sizing, HA configuration, backup strategies, VPC networking. Use when configuring Cloud SQL instances, planning database capacity, setting up backups, or designing high availability.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/gcp-cloudsql
updated: 2026-05-21
---

# Cloud SQL Infrastructure

Infrastructure-level patterns for Google Cloud SQL PostgreSQL provisioning and operations.

## Machine Type Selection

| Type | vCPU | RAM | Cost/mo | Use Case |
|------|------|-----|---------|----------|
| `db-f1-micro` | Shared | 0.6GB | ~$16 | Dev/test only (CPU throttling) |
| `db-g1-small` | Shared | 1.7GB | ~$28 | Light staging workloads |
| `db-standard-1` | 1 | 3.75GB | ~$68 | Production-like staging |
| `db-standard-2` | 2 | 7.5GB | ~$136 | Small production |
| `db-standard-4` | 4 | 15GB | ~$272 | Medium production |

### Selection Heuristics

| Concurrent Connections | Recommended Tier |
|------------------------|------------------|
| <10 | db-f1-micro (dev only) |
| 10-30 | db-g1-small |
| 30-100 | db-standard-1 |
| 100-300 | db-standard-2 |
| 300+ | db-standard-4 or higher |

## Storage Types

| Type | $/GB/mo | IOPS | Latency | Use Case |
|------|---------|------|---------|----------|
| `PD_HDD` | $0.09 | Lower | 10-20ms | Cost-sensitive staging |
| `PD_SSD` | $0.17 | Higher | 1-5ms | Production, performance testing |

PD_HDD runs ~10–20ms latency vs PD_SSD at ~1–5ms — HDD noticeably degrades response time on query-latency-sensitive workloads.

## High Availability

| Mode | Description | Cost | Use When |
|------|-------------|------|----------|
| `ZONAL` | Single zone | Base | Staging, cost-sensitive prod |
| `REGIONAL` | Multi-zone failover | +35% | Production with SLA requirements |

**Failover time:** 60-120 seconds for REGIONAL HA.

## Backup Strategies

| Environment | Retention | PITR | Rationale |
|-------------|-----------|------|-----------|
| Staging | 3 days | No | Cost savings, easy to recreate |
| Production | 30 days | Yes | Compliance, disaster recovery |

## Quick Decision Matrix

| Scenario | Machine | Storage | HA | Monthly Cost |
|----------|---------|---------|-----|--------------|
| Dev/Test | db-f1-micro | 10GB HDD | ZONAL | ~$17 |
| Staging | db-g1-small | 20GB HDD | ZONAL | ~$30 |
| Prod (small) | db-standard-1 | 50GB SSD | REGIONAL | ~$110 |
| Prod (medium) | db-standard-2 | 100GB SSD | REGIONAL | ~$200 |

See `reference.md` for sizing calculations, VPC networking, and Terraform patterns.
See `examples.md` for complete Terraform configurations.
