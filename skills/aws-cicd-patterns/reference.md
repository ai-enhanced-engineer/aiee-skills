# AWS CI/CD Patterns — Reference

## Terraform State Locking

As of Terraform 1.11, S3-native locking (`use_lockfile = true`) is the recommended approach. DynamoDB locking still works but is no longer preferred for new projects.

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
```

## ECR Lifecycle Policies

Prune old images to control costs:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep last 10 tagged images",
      "selection": {
        "tagStatus": "tagged",
        "tagPrefixList": ["v"],
        "countType": "imageCountMoreThan",
        "countNumber": 10
      },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Expire untagged after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": { "type": "expire" }
    }
  ]
}
```

## GitHub OIDC Setup (Terraform)

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
  # Note: AWS ignores thumbprint for GitHub OIDC (uses trusted CAs), but Terraform requires the field
}

resource "aws_iam_role" "github_actions" {
  name = "github-actions-deploy"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github.arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:org/repo:ref:refs/heads/main"
        }
      }
    }]
  })
}
```

See `aws-security-hardening` skill for trust policy security considerations and the OIDC validation hierarchy.
