---
name: compliance-frameworks
description: Security and privacy compliance patterns for B2B SaaS. Use for SOC 2 audit preparation, GDPR compliance, audit logging, PII handling, data subject rights, or building compliance controls into features.
kb-sources:
  - wiki/product/compliance-frameworks
updated: 2026-05-21
---

# Compliance Frameworks Skill

Security and privacy compliance patterns for B2B SaaS products.

## When to Use

- Preparing for SOC 2 Type II audit
- Implementing GDPR data handling requirements
- Conducting compliance gap analysis
- Designing controls for audit evidence
- Building compliance into new features

## Quick Reference

### SOC 2 Trust Principles

| Principle | Key Controls | Priority |
|-----------|--------------|----------|
| **Security** | Access control, encryption, monitoring | Required |
| **Availability** | Uptime SLAs, redundancy, backups | Required |
| **Processing Integrity** | Input validation, error handling | Conditional |
| **Confidentiality** | Data classification, encryption | Common |
| **Privacy** | Consent, access requests, retention | If PII handled |

### GDPR Rights (Data Subject)

| Right | Implementation | Response Time |
|-------|----------------|---------------|
| Access | Data export endpoint | 30 days |
| Erasure | Deletion workflow | 30 days |
| Rectification | Edit profile | Reasonable |
| Portability | Machine-readable export | 30 days |
| Objection | Opt-out mechanisms | Immediate |

### Common Control Categories

| Category | Examples |
|----------|----------|
| **Preventive** | Access controls, input validation, encryption |
| **Detective** | Audit logging, anomaly detection, SIEM |
| **Corrective** | Incident response, patching, rollback |

## Key Patterns

### Control Design

```
Risk Identification → Control Selection → Implementation → Evidence Collection → Audit
```

### Evidence Types

| Type | Examples |
|------|----------|
| **Documentation** | Policies, procedures, diagrams |
| **Configuration** | Terraform, IAM policies, firewall rules |
| **Logs** | Audit trails, access logs, change records |
| **Screenshots** | Dashboard configs, settings, approvals |

## Integration with Development

### PR Checklist (Security-Sensitive Changes)

- [ ] No hardcoded secrets
- [ ] Access controls implemented
- [ ] Audit logging added
- [ ] Input validation present
- [ ] Error messages sanitized

### Compliance by Design

Build compliance into features from the start:

1. **Data Classification** - What data is being handled?
2. **Access Control** - Who can access it?
3. **Audit Trail** - What operations are logged?
4. **Retention** - How long is data kept?
5. **Deletion** - How is data removed?

## SOC 2 Audit Logging Pattern

Production-ready audit logging for SOC 2 (validated in a prior ticket): no PII in logs (MD5 hashes), structured JSON, `customer_id` in every entry, `category` + `confidence` fields. Test every assertion as falsifiable; test exception paths (IntegrityError, OperationalError); verify no PII leaks in log output. See `reference.md § SOC 2 Audit Logging Pattern` for design principles table and key fields. See `examples.md` for log schema and exception handling code.

## CSP Delivery-Point Parity

When CSP is delivered via both HTTP response headers and inline `<meta http-equiv="Content-Security-Policy">` tags, directive strings that differ across delivery points produce silent policy weakening that no test catches. Two browser quirks: `frame-ancestors` is silently dropped in `<meta>` per HTML5 spec; `X-Frame-Options` via `<meta http-equiv>` is ignored by all browsers. Add maintainer-signal comments next to browser-ignored meta directives. See `reference.md § CSP Delivery-Point Parity` for the parity-check `diff` one-liner.

## OWASP Secure Headers — Minimum Set

Minimum set for a static marketing site: `Strict-Transport-Security`, `X-Frame-Options`, `Content-Security-Policy` (with `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin`. See `reference.md § OWASP Secure Headers` for the header table and post-deploy validation recipe.

## Files

- `reference.md` - Detailed checklists, control mappings, audit logging design, OWASP header table
- `examples.md` - Implementation patterns, evidence templates
