---
name: infra-terraform
description: Modern Terraform patterns for module design, state management, and CI/CD integration. Use for structuring Terraform projects, managing remote state, implementing environment separation, or enforcing code quality.
kb-sources:
  - wiki/software-engineering/infra-terraform
updated: 2026-05-21
---

# Terraform Patterns

Modern Infrastructure as Code patterns for Terraform, emphasizing modularity, safety, and team collaboration.

## Core Principles

| Principle | Implementation |
|-----------|---------------|
| **Treat as code** | Version control, code review, CI/CD |
| **Don't Repeat Yourself** | Modules for reusable patterns |
| **Explicit > Implicit** | tfvars over workspaces, directories over conditionals |
| **Plan before apply** | Review terraform plan before apply |
| **Remote state** | Remote state for production environments |

**Note:** HashiCorp changed Terraform license (BSL). OpenTofu is the community MPL-2.0 fork.

## Standard Module Structure

Standard module: `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, `README.md` + `examples/`. See `reference.md` for full directory tree.

### Design Guidelines

1. **Single responsibility** - One logical component per module
2. **Sensible defaults** - Work out-of-the-box
3. **Validate inputs** - Catch errors early
4. **Explicit outputs** - Clear contract
5. **Semantic versioning** - Tag releases

## State Management

Remote backend required. Enable versioning, locking, encryption, and IAM access control.

| Issue | Solution |
|-------|----------|
| Lock stuck | `terraform force-unlock <ID>` |
| Drift detected | Plan shows unexpected changes |
| Import needed | `terraform import <resource> <id>` |
| State corruption | Restore from versioned backup |

## EC2 Import Workflow

Two-phase approach: achieve **zero-diff** on import first, then apply intentional changes (hardening) as a separate plan/apply.

### Pre-Import Reconnaissance

Best practice: capture ground truth via `describe-instances`, `describe-volumes`, and `describe-addresses` before writing HCL. See `examples.md` for the full reconnaissance command set.

### Drift-Prone Attributes (t2/t3)

Missing these causes perpetual plan drift: `credit_specification`, `monitoring`, `ebs_optimized`, `root_block_device.throughput`, `root_block_device.iops`.

### Import Gotchas

- **AMI**: Pin as literal string, not `data.aws_ami` — data source may resolve to a different AMI, triggering instance replacement (`ami` is ForceNew)
- **EIP association**: Import uses the association ID (`eipassoc-*`), not the allocation ID — retrieve via `describe-addresses --query 'Addresses[0].AssociationId'`
- **SG rename**: AWS SG names are immutable — renaming triggers destroy+recreate. Use `lifecycle { create_before_destroy = true }` to avoid traffic gaps
- **State cleanup**: Before removing `.tf` files, run `terraform state rm` or `terraform destroy -target` for each managed resource to prevent orphans

## Pre-Apply Discovery

Accounts with prior manual provisioning may have resources that conflict with Terraform-managed equivalents. Running recon before the first apply surfaces these — see `examples.md` for pre-apply recon commands.

**Import-then-harden workflow**: recon live state → match HCL to exact live attributes → `terraform import` → plan (verify zero-diff) → add intentional changes → apply.

`data` sources reference existing account-wide singletons (OIDC providers) without claiming ownership. `resource` blocks claim ownership — if the singleton already exists, the apply fails. See `aws-security-hardening` skill for OIDC provider details.

## ECR Configuration

`image_tag_mutability = "MUTABLE"` accommodates pipelines that push `:latest` on every deploy — IMMUTABLE rejects the second push silently. SHA tags still provide traceability. ECR lifecycle policies prune orphaned layers accumulated from MUTABLE tag overwrites.

## Gate Selection for Non-Terraform Infrastructure

The `plan-cost` quality gate assumes infrastructure = Terraform. For shell scripts, systemd units, and CI/CD changes classified under "infrastructure" in `aiee/project.yaml`, fall back to `test-enforcement` or peer review when no `.tf` files are changed.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Deployment YAMLs in infrastructure repo | Keep in service repo, reference via handoff doc |
| Templates mixed with live Terraform | Move to `docs/deployment-templates/` as reference only |
| Static SPA SA in shared `cloud_run_service_accounts` map | Grant only `logging.logWriter` + `artifactregistry.writer` directly (see `gcp-security-hardening` skill) |
| Workspaces for environment separation | Directory per environment or tfvars files |
| Write code first, then import existing resources | Import to state first, then write matching code |
| IAM `for_each` block not audited when service gains new dependency | Cross-reference ALL secrets in staging YAML against service's IAM `*_secrets` block On every deploy |
| Claiming Terraform output is a blocker without checking deploy mechanism | Read the actual deploy pipeline to verify how values are consumed before declaring outputs missing |
| Assuming greenfield on accounts with history | Run pre-apply recon commands before first apply |
| Using `resource` for OIDC provider without checking existence | `data` source by default; see `aws-security-hardening` for OIDC provider details |
| `image_tag_mutability = "IMMUTABLE"` with `:latest` push strategy | Use `MUTABLE` if pipeline pushes `:latest`; SHA tags provide traceability |
| `plan-cost` gate on non-Terraform infrastructure changes | Fall back to `test-enforcement` or peer review for shell/systemd/CI changes |

## Critical Rules

1. **Secrets in tfvars get committed to VCS and leak on any repo clone** — store them in Secret Manager and reference dynamically.
2. **Unlocked provider versions resolve to different releases across machines** — commit `.terraform.lock.hcl` so every run is deterministic.
3. **Unreviewed plans destroy production resources without warning** — read every plan output, especially lines prefixed with `-`.
4. **Untagged module references (`?ref=main`) pull breaking changes silently** — pin with `?ref=v1.2.3` and treat upgrades as explicit decisions.
5. **Drift discovered at apply time means a human is in the loop under pressure** — running `plan` in CI surfaces drift before it becomes an incident.
See `reference.md` for environment separation patterns, state safety, state lock prevention, zero-downtime migration, IAM binding placement, deployment process, cross-repo secret validation, and multi-phase ticket validation.

See `examples.md` for complete module examples, CI/CD pipelines, Makefile patterns, and pre-commit configuration.
