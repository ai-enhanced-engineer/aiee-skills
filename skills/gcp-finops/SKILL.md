---
name: gcp-finops
description: GCP cost engineering and financial operations. Analyze billing, optimize resources, manage budgets, reduce spending. Use when discussing GCP costs, budget optimization, pricing decisions, cost analysis, or spend management.
allowed-tools: Read, Grep, Glob, WebFetch
kb-sources:
  - wiki/software-engineering/gcp-finops
updated: 2026-04-19
---

# GCP FinOps

Cost engineering and financial operations patterns for Google Cloud Platform.

> **Note:** Pricing estimates are approximate and based on us-central1 region. Use the [GCP Pricing Calculator](https://cloud.google.com/products/calculator) for current rates.

## Cost Optimization Framework

### The FinOps Cycle

```
    ┌─────────────┐
    │   INFORM    │ ← Visibility into spending
    │  (analyze)  │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │  OPTIMIZE   │ ← Right-size, eliminate waste
    │  (reduce)   │
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │   OPERATE   │ ← Maintain efficiency
    │  (control)  │
    └─────────────┘
```

## Quick Cost Reference

### Compute (Cloud Run)

| Config | Cost/hour | Monthly (24/7) | Use Case |
|--------|-----------|----------------|----------|
| 0.5 vCPU, 256MB | $0.0144 | $10.50 | Minimal API |
| 1 vCPU, 512MB | $0.0324 | $23.60 | Standard API |
| 2 vCPU, 1GB | $0.0648 | $47.20 | Heavy processing |

**Key insight:** Scale-to-zero saves 80-95% for variable workloads.

#### GPU Instances (Cloud Run with L4)

| Config | Cost/GPU-sec | GPU Cost/hour | GPU Monthly (24/7) | Use Case |
|--------|-------------|---------------|-------------------|----------|
| 4 vCPU, 16GB + L4 (min) | $0.0001867 | ~$0.67 | ~$490 | Light GPU inference |
| 8 vCPU, 32GB + L4 (rec) | $0.0001867 | ~$0.67 | ~$490 | Production GPU inference |

**Note:** Table shows GPU cost only. vCPU/memory charges are additional (see Compute table above). Total cost for 8 vCPU/32GB + L4 is ~$0.67 GPU + ~$0.19 vCPU/mem = ~$0.86/hr.

**Key constraints:**
- Minimum instance spec: 4 vCPU / 16 GiB RAM (hard GCP requirement)
- Recommended: 8 vCPU / 32 GiB RAM for production workloads
- Cold start penalty: 20-40s (GPU initialization)
- Min-instances break-even: ~2,700 jobs/month justifies keeping 1 instance warm
- GPU billing is per-second ($0.0001867/GPU-sec), vCPU/memory billed separately

**Caution:** Agent-generated GPU cost estimates are frequently wrong (e.g., confusing $/hr with $/min — a 60x error). Cross-check against [Cloud Run pricing](https://cloud.google.com/run/pricing) before committing to a budget — unverified estimates have shipped with 60x errors that made the FinOps recommendation actively harmful.

### Database (Cloud SQL)

| Tier | Monthly | RAM | Best For |
|------|---------|-----|----------|
| db-f1-micro | $16 | 0.6GB | Dev only |
| db-g1-small | $28 | 1.7GB | Staging |
| db-standard-1 | $68 | 3.75GB | Small prod |
| db-standard-2 | $136 | 7.5GB | Medium prod |

**Key insight:** +35% for HA (REGIONAL).

### Cache (Memorystore Redis)

**Pricing model:** $0.049/GB/hour (BASIC tier, us-east4)

| Size | BASIC | STANDARD_HA |
|------|-------|-------------|
| 1GB | ~$35/mo | ~$70/mo |
| 2GB | ~$72/mo | ~$144/mo |
| 5GB | ~$180/mo | ~$360/mo |

**Key insights:**
- 2x cost for HA (STANDARD_HA), but includes automatic failover
- Pricing is hourly: $0.049/GB/hour x 730 hours/month = ~$35.77/GB/month
- Custom sizes available: 1GB minimum, 300GB maximum (BASIC tier)
- Region variations: us-east4 typically cheapest, check calculator for others

**Cost calculation formula:**
```
Monthly cost = Memory_GB x $0.049/hour x 730 hours/month x HA_multiplier

Where:
  HA_multiplier = 1.0 (BASIC) or 2.0 (STANDARD_HA)

Example: 2GB STANDARD_HA
  = 2 x $0.049 x 730 x 2.0
  = $143.08/month
```

## Right-Sizing Decision Matrix

| Current State | Recommendation | Savings |
|---------------|----------------|---------|
| CPU <10% utilization | Downsize tier | 30-50% |
| Memory <30% used | Reduce RAM allocation | 20-40% |
| Scale-to-zero disabled | Enable for dev/staging | 80-95% |
| HA in staging | Disable HA | 26-35% |
| SSD in staging | Switch to HDD | 47% |

## Budget Alert Thresholds

| Threshold | Action | Audience |
|-----------|--------|----------|
| 50% | Informational | Team |
| 75% | Review spending | Tech Lead |
| 90% | Reduce non-essential | Team Lead |
| 100% | Emergency review | Management |

See `reference.md` for detailed pricing research methods and optimization patterns.
