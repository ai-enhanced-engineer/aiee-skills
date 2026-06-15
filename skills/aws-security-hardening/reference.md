# AWS Security Hardening — Reference

## Terraform State Security

S3-native locking is now preferred (Terraform 1.11+). DynamoDB locking still works but is no longer recommended for new projects.

Key requirements for state bucket:
- KMS encryption (`aws:kms`)
- Versioning enabled (rollback capability)
- Public access block (all four flags)
- Access logging enabled

## App Runner IAM Roles

App Runner uses two distinct IAM roles:

- **Access role** — allows App Runner to pull images from ECR during deployment
- **Instance (execution) role** — grants runtime permissions to application code (Secrets Manager, S3, CloudWatch)

Principle: start with minimal permissions, expand based on IAM Access Analyzer findings.

## OIDC Trust Policy Security

Trust policy `sub` claim supports multiple scoping patterns:

| Pattern | Use Case |
|---------|----------|
| `repo:org/repo:ref:refs/heads/main` | Production deploys only |
| `repo:org/repo:environment:staging` | Environment-scoped |
| `repo:org/repo:pull_request` | PR preview environments |

AWS ignores the OIDC thumbprint for GitHub's provider (uses trusted CAs since July 2023), but Terraform requires the field.

## ECR Scanning Modes

| Mode | Coverage | Cost | Use When |
|------|----------|------|----------|
| Basic | OS packages only | Free | Minimum viable scanning |
| Enhanced (Inspector) | OS + app dependencies | Per-scan pricing | Production workloads |

Enhanced scanning supports `CONTINUOUS_SCAN` — re-scans when new CVEs are published, not just on push.

## Budget and Cost Controls

Two complementary approaches:
- **Static budgets** — fixed monthly threshold with percentage-based alerts (e.g., 80%)
- **Cost Anomaly Detection** — ML-based, detects unexpected spend patterns (free, rolling 24-hour window)

Both are recommended in parallel for defense in depth on cost management.

## Security Group Replacement — Detail

CIDR validation pattern — reject `0.0.0.0/0` inputs at the Terraform variable level:

```hcl
validation {
  condition     = alltrue([for cidr in var.allowed_ssh_cidrs : !can(regex("/0$", cidr))])
  error_message = "CIDR blocks ending in /0 are not allowed."
}
```

Schedule SG swaps during low-traffic windows to minimize blast radius on the destroy+recreate cycle. Always run `aws ec2 describe-network-interfaces --filters Name=group-id,Values=<SG-ID>` before destroying — shared SGs (RDS, ALB, Lambda ENI) will break on destroy.

## OIDC Provider — EC2 SSM Activation

When an EC2 instance's SSM agent isn't connecting due to a wrong service principal in the role trust policy, correct it to `ec2.amazonaws.com` and perform an EC2 stop/start to refresh the instance profile credentials. The pre-installed SSM agent registers automatically on restart. An EIP keeps the public IP stable (~2 min downtime).

## SSM for Live Server Ops — Heredoc Pitfall

SSM commands run as root; each element of the `commands` JSON array is a shell line. `\n` inside heredocs passed via SSM JSON gets mangled by the JSON parser. Use `printf 'line1\nline2\n' > file` for multi-line file content instead of `cat <<EOF`.
