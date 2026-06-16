# AWS App Runner — Reference

## Service Configuration

| Setting | Dev/Staging | Production |
|---------|------------|------------|
| CPU | 0.25 vCPU | 1 vCPU |
| Memory | 0.5 GB | 2 GB |
| Min instances | 1 | 1-2 |
| Max instances | 2 | 10 |
| Max concurrency | 10 | 100 |

## Secrets Manager Integration

Reference secrets in App Runner — injected as env vars at runtime:

```hcl
runtime_environment_secrets = {
  DATABASE_URL = aws_secretsmanager_secret.db_url.arn
  API_KEY      = aws_secretsmanager_secret.api_key.arn
}
```

Requires instance role with `secretsmanager:GetSecretValue` on referenced secret ARNs. Secrets are pulled at deployment time — rotation requires redeployment.

## VPC Connector

For accessing private resources (RDS, ElastiCache). VPC connectors are outbound only — no VPC ingress support. Requires private subnets across 3+ AZs.

Security group chaining pattern:
1. App Runner connector SG: allows outbound to destination SG
2. RDS/ElastiCache SG: allows inbound from connector SG

## Health Check Configuration

| Parameter | Recommended Value |
|-----------|------------------|
| Protocol | HTTP |
| Path | `/health` |
| Interval | 10s |
| Timeout | 5s |
| Healthy threshold | 1 |
| Unhealthy threshold | 5 |

## Pricing Model

| Component | Rate |
|-----------|------|
| Provisioned container memory (idle) | $0.007 / GB-hour |
| Active container vCPU | $0.064 / vCPU-hour |
| Active container memory | $0.007 / GB-hour |
| Automatic deployment build | $0.005 / build-minute |

Scale-to-zero is not supported — API enforces `MinSize >= 1`.

## Terraform Deprecation

The `aws_apprunner_service` Terraform resource will be deprecated in a future provider version ([#47161](https://github.com/hashicorp/terraform-provider-aws/issues/47161)) due to App Runner maintenance mode.
