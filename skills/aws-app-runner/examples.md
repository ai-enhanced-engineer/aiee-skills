# AWS App Runner — Examples

## Complete App Runner Service (Terraform)

```hcl
resource "aws_apprunner_service" "api" {
  service_name = "my-api"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_identifier      = "${aws_ecr_repository.api.repository_url}:latest"
      image_repository_type = "ECR"

      image_configuration {
        port                          = "8080"
        runtime_environment_variables = {
          ENVIRONMENT = "production"
        }
        runtime_environment_secrets = {
          DATABASE_URL = aws_secretsmanager_secret.db_url.arn
        }
      }
    }

    auto_deployments_enabled = true
  }

  instance_configuration {
    cpu    = "1024"   # 1 vCPU
    memory = "2048"   # 2 GB
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  health_check_configuration {
    protocol            = "HTTP"
    path                = "/health"
    interval            = 10
    timeout             = 5
    healthy_threshold   = 1
    unhealthy_threshold = 5
  }

  auto_scaling_configuration_arn = aws_apprunner_auto_scaling_configuration_version.api.arn
}

resource "aws_apprunner_auto_scaling_configuration_version" "api" {
  auto_scaling_configuration_name = "my-api-scaling"
  min_size        = 1
  max_size        = 10
  max_concurrency = 100
}
```

## VPC Connector (Terraform)

```hcl
resource "aws_apprunner_vpc_connector" "private" {
  vpc_connector_name = "private-connector"
  subnets            = var.private_subnet_ids
  security_groups    = [aws_security_group.apprunner.id]
}

resource "aws_apprunner_service" "api" {
  # ... service config ...

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.private.arn
    }
  }
}
```
