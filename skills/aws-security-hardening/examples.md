# AWS Security Hardening — Examples

## IAM Least Privilege Policy (ECR Pull)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:BatchCheckLayerAvailability"
      ],
      "Resource": "arn:aws:ecr:us-east-1:123456789012:repository/my-api"
    },
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    }
  ]
}
```

`GetAuthorizationToken` requires `*` resource (AWS limitation).

## OIDC Trust Policy (Terraform)

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": {
        "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
      },
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
      }
    }
  }]
}
```

## App Runner Execution Role (Minimal)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "secretsmanager:GetSecretValue",
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:123456789012:secret:my-api-*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:us-east-1:123456789012:*"
    }
  ]
}
```

## ECR Repository with Scanning (Terraform)

```hcl
resource "aws_ecr_repository" "api" {
  name = "my-api"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
  }
}
```

## S3 Terraform State Bucket (Terraform)

```hcl
terraform {
  backend "s3" {
    bucket       = "my-project-tfstate"
    key          = "terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true  # S3-native locking (Terraform 1.11+)
    encrypt      = true
  }
}

resource "aws_s3_bucket" "tfstate" {
  bucket = "my-project-tfstate"
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

## Budget Alert (Terraform)

```hcl
resource "aws_budgets_budget" "monthly" {
  name         = "monthly-budget"
  budget_type  = "COST"
  limit_amount = "50"
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["alerts@example.com"]
  }
}
```

## Secrets Manager Reference in App Runner (Terraform)

```hcl
runtime_environment_secrets = {
  DATABASE_URL = aws_secretsmanager_secret.db_url.arn
  JWT_SECRET   = aws_secretsmanager_secret.jwt.arn
}
```

Requires instance role with `secretsmanager:GetSecretValue` on specific secret ARNs. Secrets pulled at deployment time — rotation requires redeployment.

## Secrets Validation — Placeholder Detection

```bash
# In deploy/bootstrap scripts — reject known placeholder values
for secret in $(aws secretsmanager get-secret-value ...); do
  if [[ "$secret" =~ ^(PLACEHOLDER|changeme|TODO) ]]; then
    echo "ERROR: Placeholder secret detected — rotate before deploy"
    exit 1
  fi
done
```
