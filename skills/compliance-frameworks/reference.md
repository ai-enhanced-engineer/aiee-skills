# Compliance Frameworks - Reference

Detailed checklists and control mappings for SOC 2, GDPR, and general compliance.

## SOC 2 Type II

### Trust Services Criteria (TSC)

#### Security (CC - Common Criteria)

| Control ID | Requirement | Implementation |
|------------|-------------|----------------|
| **CC1.1** | COSO environment | Documented security policy |
| **CC2.1** | Communication | Security training, onboarding |
| **CC3.1** | Risk assessment | Annual security review |
| **CC4.1** | Monitoring | Continuous logging, alerting |
| **CC5.1** | Control activities | Access reviews, change management |
| **CC6.1** | Logical access | SSO, MFA, RBAC |
| **CC6.2** | Physical access | Cloud provider attestations |
| **CC6.3** | Data disposal | Secure deletion procedures |
| **CC6.6** | Encryption | TLS 1.3, encryption at rest |
| **CC6.7** | Transmission security | Encrypted channels only |
| **CC7.1** | System monitoring | Intrusion detection, SIEM |
| **CC7.2** | Anomaly detection | Automated alerting |
| **CC7.3** | Security incidents | Incident response procedure |
| **CC7.4** | Incident response | Documented playbooks |
| **CC8.1** | Change management | PR reviews, staging environment |
| **CC9.1** | Risk mitigation | Business continuity plan |
| **CC9.2** | Vendor management | Third-party risk assessment |

#### Availability (A)

| Control ID | Requirement | Implementation |
|------------|-------------|----------------|
| **A1.1** | Capacity planning | Auto-scaling, resource monitoring |
| **A1.2** | Recovery | Backup and restore procedures |
| **A1.3** | Disaster recovery | Multi-region failover |

#### Processing Integrity (PI)

| Control ID | Requirement | Implementation |
|------------|-------------|----------------|
| **PI1.1** | Data quality | Input validation, schema enforcement |
| **PI1.2** | Processing accuracy | Automated testing, monitoring |
| **PI1.3** | Output completeness | End-to-end transaction logging |

#### Confidentiality (C)

| Control ID | Requirement | Implementation |
|------------|-------------|----------------|
| **C1.1** | Data classification | Classification policy |
| **C1.2** | Disposal | Secure deletion procedures |

#### Privacy (P)

| Control ID | Requirement | Implementation |
|------------|-------------|----------------|
| **P1.1** | Notice | Privacy policy |
| **P2.1** | Choice/Consent | Opt-in mechanisms |
| **P3.1** | Collection limitation | Data minimization |
| **P4.1** | Use/Retention | Retention policy |
| **P5.1** | Access | Data export endpoint |
| **P6.1** | Disclosure | Third-party data sharing policy |
| **P7.1** | Quality | Data accuracy mechanisms |
| **P8.1** | Monitoring | Privacy incident tracking |

### Audit Preparation Checklist

```markdown
## 3 Months Before Audit

- [ ] Engage SOC 2 auditor
- [ ] Define audit scope (which trust principles)
- [ ] Conduct gap assessment
- [ ] Remediate critical findings
- [ ] Begin evidence collection

## 1 Month Before Audit

- [ ] Complete all control implementations
- [ ] Organize evidence repository
- [ ] Conduct internal audit walkthrough
- [ ] Train team on auditor interactions
- [ ] Prepare system descriptions

## During Audit (Type II - 3-12 month period)

- [ ] Provide evidence upon request
- [ ] Facilitate auditor interviews
- [ ] Address any findings promptly
- [ ] Maintain normal operations (evidence of controls working)
```

### Evidence Repository Structure

```
evidence/
├── policies/
│   ├── security-policy.pdf
│   ├── incident-response.pdf
│   └── acceptable-use.pdf
├── access-controls/
│   ├── iam-roles-export.json
│   ├── access-reviews-q1.xlsx
│   └── mfa-enforcement.png
├── change-management/
│   ├── pr-approval-policy.md
│   ├── deployment-logs/
│   └── staging-testing-evidence/
├── monitoring/
│   ├── alert-configurations.json
│   ├── incident-tickets/
│   └── vulnerability-scans/
└── vendor/
    ├── gcp-soc2-report.pdf
    ├── openai-security-practices.pdf
    └── third-party-assessment.xlsx
```

---

## GDPR Compliance

### Lawful Basis for Processing

| Basis | When Applicable | Evidence Required |
|-------|-----------------|-------------------|
| **Consent** | Marketing, optional features | Opt-in records, consent language |
| **Contract** | Core service delivery | Service agreement, terms |
| **Legitimate Interest** | Analytics, security | LIA documentation |
| **Legal Obligation** | Tax records, subpoenas | Legal requirements |

### Data Subject Rights Implementation

#### Right to Access (Article 15)

```python
# Implementation pattern
class DataExportService:
    async def export_customer_data(self, customer_id: str) -> DataExport:
        """Export all customer data in machine-readable format."""
        return DataExport(
            customer_profile=await self.get_profile(customer_id),
            conversations=await self.get_all_conversations(customer_id),
            widgets=await self.get_widgets(customer_id),
            export_date=datetime.utcnow(),
            format="json"
        )
```

#### Right to Erasure (Article 17)

```python
# Implementation pattern
class DataDeletionService:
    async def delete_customer_data(self, customer_id: str) -> DeletionConfirmation:
        """Delete all customer data (right to be forgotten)."""
        # 1. Identify all data locations
        locations = await self.scan_data_locations(customer_id)

        # 2. Delete from each location
        for location in locations:
            await self.delete_from_location(location, customer_id)

        # 3. Verify deletion
        remaining = await self.scan_data_locations(customer_id)
        assert len(remaining) == 0

        # 4. Log deletion (without PII)
        await self.log_deletion_event(customer_id_hash=hash(customer_id))

        return DeletionConfirmation(
            completed_at=datetime.utcnow(),
            locations_cleared=len(locations)
        )
```

### Data Processing Records (Article 30)

| Field | Description | Example |
|-------|-------------|---------|
| **Controller** | Data controller identity | Acme Corp |
| **Purpose** | Why data is processed | Provide chat widget service |
| **Categories** | Types of data | Messages, visitor metadata |
| **Recipients** | Who receives data | OpenAI (processor) |
| **Transfers** | Cross-border transfers | US (OpenAI), EU (customers) |
| **Retention** | How long kept | Per customer policy |
| **Security** | Technical measures | Encryption, access controls |

### Privacy by Design Checklist

```markdown
## New Feature Privacy Review

- [ ] What personal data is collected?
- [ ] Is collection necessary (data minimization)?
- [ ] What is the lawful basis?
- [ ] Where is data stored?
- [ ] Who has access?
- [ ] How long is it retained?
- [ ] How can it be deleted?
- [ ] Is it transferred outside EU?
- [ ] Are third parties involved?
- [ ] Is privacy notice updated?
```

---

## Common Control Mappings

### Access Control Implementation

| Layer | Control | Tool |
|-------|---------|------|
| **Identity** | SSO, MFA | Google Workspace, Okta |
| **Authorization** | RBAC | Custom roles, IAM policies |
| **Database** | RLS | PostgreSQL policies |
| **API** | JWT validation | FastAPI middleware |
| **Secrets** | Rotation | GCP Secret Manager |

### Audit Logging Requirements

| Event | Details to Log | Retention |
|-------|----------------|-----------|
| **Authentication** | User, timestamp, success/fail, IP | 1 year |
| **Authorization** | Resource, action, decision | 1 year |
| **Data Access** | User, resource, query | 90 days |
| **Data Modification** | User, old/new values (hashed) | 1 year |
| **Admin Actions** | User, action, target | 2 years |

### Encryption Standards

| Context | Minimum Standard | Recommended |
|---------|------------------|-------------|
| **In Transit** | TLS 1.2 | TLS 1.3 |
| **At Rest (DB)** | AES-256 | AES-256-GCM |
| **At Rest (Files)** | AES-256 | AES-256-GCM |
| **Passwords** | bcrypt (cost 10) | bcrypt (cost 12+) |
| **API Keys** | SHA-256 hash | Argon2id |

---

## Vendor Risk Assessment

### Third-Party Evaluation Checklist

```markdown
## Vendor: [Name]

### Security
- [ ] SOC 2 report available?
- [ ] Security questionnaire completed?
- [ ] Penetration test results?
- [ ] Incident notification SLA?

### Privacy
- [ ] DPA signed?
- [ ] GDPR-compliant?
- [ ] Data residency options?
- [ ] Sub-processor list?

### Business
- [ ] Financial stability?
- [ ] Business continuity plan?
- [ ] SLA guarantees?
- [ ] Exit strategy?
```

### Key Vendor Assessments (Acme Corp)

| Vendor | Purpose | Risk Level | Assessment Status |
|--------|---------|------------|-------------------|
| **GCP** | Infrastructure | High | SOC 2 report on file |
| **OpenAI** | LLM provider | High | Security practices reviewed |
| **Cloudflare** | CDN/WAF | Medium | SOC 2 report on file |
| **GitHub** | Source control | Medium | SOC 2 report on file |

---

## SOC 2 Audit Logging Pattern

Production-ready audit logging pattern for SOC 2 compliance (validated in a prior ticket).

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **No PII in logs** | MD5 hashes instead of raw values |
| **Structured format** | JSON with consistent schema |
| **Tenant isolation** | `customer_id` in every log entry |
| **Categorization** | `category` + `confidence` fields |

### Key Fields

Log entries include: `customer_id`, `category`, `confidence`, `content_hash` (MD5, no PII), `timestamp`, `action`.

### Testing Criteria

- Every assertion should be falsifiable
- Test exception paths (IntegrityError, OperationalError)
- Verify no PII leaks in log output

See `examples.md` for log schema, exception handling code, and evidence templates.

---

## CSP Delivery-Point Parity

When a site delivers CSP via multiple points (HTTP response header in `.htaccess`/Nginx/`_headers` AND inline `<meta http-equiv="Content-Security-Policy">` tags), directive strings must be **byte-identical** across delivery points — drift produces silent policy weakening that no test catches.

Two browser quirks:
- `frame-ancestors` is silently dropped in `<meta>` per HTML5 spec but honored in HTTP headers
- `X-Frame-Options` via `<meta http-equiv>` is ignored by all browsers but honored as a header

Add inline maintainer-signal comments next to meta directives that are browser-ignored so the server-side rule isn't accidentally deleted. See `examples.md → CSP Delivery-Point Parity` for the maintainer-signal HTML comment pattern.

Parity-check one-liner:
```bash
diff <(grep -o 'content="[^"]*"' index.html | head -1 | tr ';' '\n' | sort) \
     <(grep 'Content-Security-Policy' _headers | cut -d: -f2- | tr ';' '\n' | sort)
```

---

## OWASP Secure Headers — Minimum Set

Minimum set for a static marketing site (OWASP Secure Headers Project):

| Header | Purpose |
|---|---|
| `Strict-Transport-Security` | HTTPS-only enforcement (HSTS) |
| `X-Frame-Options` | Legacy clickjacking protection |
| `Content-Security-Policy` (with `frame-ancestors 'none'`) | Modern clickjacking + script policy |
| `X-Content-Type-Options: nosniff` | Block MIME sniffing |
| `Referrer-Policy: strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | Lock down camera/mic/geo/payment/usb |
| `Cross-Origin-Opener-Policy: same-origin` | Cross-origin isolation (often missed) |

### Post-Deploy Validation Recipe

```bash
curl -sI <url> | grep -iE 'x-frame|content-security|cross-origin|strict-transport|referrer|permissions'
```

Single grep pass catches the full OWASP minimum set. Standard "did the headers ship?" check after merging any header-config PR.

---

## Incident Response Integration

### Security Incident Classification

| Severity | Criteria | Response Time | Notification |
|----------|----------|---------------|--------------|
| **Critical** | Data breach confirmed | Immediate | CEO, Legal, Affected customers |
| **High** | Potential breach | 4 hours | Security team, Engineering lead |
| **Medium** | Vulnerability exploited | 24 hours | Security team |
| **Low** | Security improvement | Sprint | Backlog |

### Breach Notification Requirements

| Regulation | Timeline | Recipient | Threshold |
|------------|----------|-----------|-----------|
| **GDPR** | 72 hours | Supervisory authority | Risk to rights |
| **GDPR** | Without delay | Data subjects | High risk |
| **SOC 2** | Per contract | Customers | Material incidents |
| **State Laws** | Varies (30-90 days) | Affected individuals | PII breach |
