# Compliance Frameworks - Examples

Practical implementation patterns and templates for compliance controls.

## SOC 2 Evidence Examples

### Access Control Evidence

#### IAM Policy Export

```json
{
  "roles": [
    {
      "name": "developer",
      "permissions": [
        "cloudsql.instances.connect",
        "logging.logEntries.list",
        "storage.objects.get"
      ],
      "condition": {
        "expression": "resource.name.startsWith('projects/example-staging')"
      }
    },
    {
      "name": "production-deployer",
      "permissions": [
        "run.services.update",
        "secretmanager.versions.access"
      ],
      "members": ["group:production-deploy@example.com"],
      "requires_approval": true
    }
  ],
  "exported_at": "2025-01-15T10:00:00Z"
}
```

#### Quarterly Access Review

```markdown
## Access Review - Q1 2025

**Reviewer:** Security Engineer
**Date:** 2025-01-15
**Scope:** Production infrastructure access

### Users Reviewed

| User | Role | Access Level | Decision | Justification |
|------|------|--------------|----------|---------------|
| alice@example.com | Engineer | production-deployer | Retain | Active deployment duties |
| bob@example.com | Former | admin | Revoke | Terminated 2024-12-01 |
| carol@example.com | Support | read-only | Retain | Customer support role |

### Actions Taken

- [x] Removed bob@example.com from all groups
- [x] Revoked bob@example.com API keys
- [x] Audit of bob's recent access (no anomalies)

### Certification

I certify this access review was conducted in accordance with policy.

**Signature:** [Digital signature]
**Date:** 2025-01-15
```

### Change Management Evidence

#### Pull Request Template

```markdown
## Change Description

[Brief description of the change]

## Security Checklist

- [ ] No secrets in code
- [ ] Input validation added
- [ ] Access controls verified
- [ ] Audit logging included
- [ ] Error messages sanitized

## Testing Evidence

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Security scan clean
- [ ] Staging deployment verified

## Rollback Plan

[How to rollback if issues occur]

## Approvals Required

- [ ] Code reviewer
- [ ] Security review (if security-sensitive)
- [ ] Product owner (if user-facing)
```

### Incident Response Evidence

#### Incident Ticket Template

```markdown
## Incident: [INCIDENT-2025-001]

### Summary
[One-line description]

### Timeline (UTC)

| Time | Event |
|------|-------|
| 2025-01-15 14:30 | Alert triggered |
| 2025-01-15 14:35 | Incident declared |
| 2025-01-15 14:45 | Root cause identified |
| 2025-01-15 15:00 | Mitigation applied |
| 2025-01-15 15:30 | Incident resolved |

### Impact

- **Duration:** 1 hour
- **Users Affected:** ~500
- **Data Exposure:** None
- **Financial Impact:** Estimated $X

### Root Cause

[Detailed description of what caused the incident]

### Resolution

[What was done to resolve the incident]

### Follow-up Actions

- [ ] Post-incident review scheduled
- [ ] Prevention measures identified
- [ ] Documentation updated
- [ ] Monitoring improved

### Lessons Learned

[Key takeaways from the incident]
```

---

## GDPR Implementation Examples

### Privacy Policy Section

```html
<section id="data-processing">
  <h2>How We Process Your Data</h2>

  <h3>For Our Customers (Business Owners)</h3>
  <table>
    <tr>
      <th>Data Category</th>
      <th>Purpose</th>
      <th>Lawful Basis</th>
      <th>Retention</th>
    </tr>
    <tr>
      <td>Account Information</td>
      <td>Provide service</td>
      <td>Contract</td>
      <td>Account lifetime + 30 days</td>
    </tr>
    <tr>
      <td>Usage Analytics</td>
      <td>Improve service</td>
      <td>Legitimate Interest</td>
      <td>12 months</td>
    </tr>
  </table>

  <h3>For Website Visitors (End Users)</h3>
  <table>
    <tr>
      <th>Data Category</th>
      <th>Purpose</th>
      <th>Lawful Basis</th>
      <th>Retention</th>
    </tr>
    <tr>
      <td>Chat Messages</td>
      <td>Provide chat service</td>
      <td>Controller's contract</td>
      <td>Per customer policy</td>
    </tr>
    <tr>
      <td>Session Identifier</td>
      <td>Continuity</td>
      <td>Legitimate Interest</td>
      <td>24 hours</td>
    </tr>
  </table>
</section>
```

### Data Export API

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class DataExport(BaseModel):
    customer_id: str
    export_date: datetime
    profile: dict
    widgets: list[dict]
    conversations: list[dict]
    format: str = "json"

@router.get("/api/v1/dashboard/data-export")
async def export_my_data(
    current_user: Customer = Depends(get_current_customer)
) -> DataExport:
    """
    GDPR Article 15 & 20: Right to Access & Portability

    Exports all personal data in machine-readable format.
    Response time: Within 30 days (usually instant).
    """
    return DataExport(
        customer_id=str(current_user.id),
        export_date=datetime.utcnow(),
        profile={
            "company_name": current_user.company_name,
            "contact_email": current_user.contact_email,
            "tier": current_user.tier,
            "created_at": current_user.created_at.isoformat(),
        },
        widgets=await get_customer_widgets(current_user.id),
        conversations=await get_customer_conversations(current_user.id),
    )
```

### Data Deletion Workflow

```python
from enum import Enum
from datetime import datetime
import hashlib

class DeletionStatus(Enum):
    REQUESTED = "requested"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"

class DataDeletionRequest(BaseModel):
    request_id: str
    customer_id_hash: str  # Store hash, not actual ID
    requested_at: datetime
    status: DeletionStatus
    completed_at: datetime | None
    locations_cleared: list[str]

async def process_deletion_request(customer_id: str) -> DataDeletionRequest:
    """
    GDPR Article 17: Right to Erasure

    Deletes all customer data from all systems.
    """
    request = DataDeletionRequest(
        request_id=generate_request_id(),
        customer_id_hash=hashlib.sha256(customer_id.encode()).hexdigest(),
        requested_at=datetime.utcnow(),
        status=DeletionStatus.IN_PROGRESS,
        completed_at=None,
        locations_cleared=[]
    )

    # Delete from each location
    locations = [
        ("PostgreSQL", delete_from_postgres),
        ("Redis", delete_from_redis),
        ("Cloud Storage", delete_from_gcs),
        ("Logs", anonymize_in_logs),
    ]

    for name, delete_func in locations:
        try:
            await delete_func(customer_id)
            request.locations_cleared.append(name)
        except Exception as e:
            request.status = DeletionStatus.FAILED
            await alert_security_team(request, e)
            raise

    request.status = DeletionStatus.COMPLETED
    request.completed_at = datetime.utcnow()

    # Log deletion (GDPR allows keeping deletion records)
    await log_deletion_audit(request)

    return request
```

### Consent Management

```python
from datetime import datetime
from pydantic import BaseModel

class ConsentRecord(BaseModel):
    consent_id: str
    customer_id: str
    consent_type: str  # "marketing", "analytics", etc.
    granted: bool
    granted_at: datetime | None
    withdrawn_at: datetime | None
    consent_text: str  # Exact text shown to user
    ip_address: str
    user_agent: str

class ConsentManager:
    async def record_consent(
        self,
        customer_id: str,
        consent_type: str,
        granted: bool,
        request: Request
    ) -> ConsentRecord:
        """
        Record consent with full audit trail.
        GDPR Article 7: Conditions for consent.
        """
        return await self.repository.create(
            ConsentRecord(
                consent_id=generate_id(),
                customer_id=customer_id,
                consent_type=consent_type,
                granted=granted,
                granted_at=datetime.utcnow() if granted else None,
                withdrawn_at=datetime.utcnow() if not granted else None,
                consent_text=self.get_consent_text(consent_type),
                ip_address=request.client.host,
                user_agent=request.headers.get("user-agent", ""),
            )
        )

    async def check_consent(
        self,
        customer_id: str,
        consent_type: str
    ) -> bool:
        """Check if valid consent exists."""
        record = await self.repository.get_latest(customer_id, consent_type)
        return record is not None and record.granted
```

---

## SOC 2 Audit Logging — Log Schema and Exception Handling

### Log Entry Schema

```json
{
  "customer_id": "cust_abc123",
  "category": "billing_inquiry",
  "confidence": 0.92,
  "content_hash": "5d41402abc4b2a76b9719d911017c592",
  "timestamp": "2025-01-15T14:30:00Z",
  "action": "classify_message"
}
```

**Key design decisions:**
- `content_hash` uses MD5 of message content — no PII in logs
- `confidence` enables audit trail for classification accuracy
- `customer_id` ensures tenant isolation in multi-tenant queries

### Exception Handling Pattern

```python
from sqlalchemy.exc import IntegrityError, OperationalError

async def log_audit_event(event: AuditEvent) -> None:
    """Log with graceful degradation — audit failures propagate to ensure logging integrity."""
    try:
        await repository.insert(event)
    except IntegrityError:
        # Duplicate event — log warning but don't crash
        logger.warning("Duplicate audit event", event_id=event.id)
    except OperationalError:
        # Database unavailable — this MUST propagate
        logger.error("Audit logging failed — database unavailable", exc_info=True)
        raise  # Audit failures should not be silently swallowed
```

**Testing criteria:**
- Every assertion should be falsifiable (no tautological tests)
- Test both IntegrityError and OperationalError paths
- Verify no PII appears in log output via content inspection

---

## Audit Logging Examples

### Structured Audit Log

```python
import structlog
from datetime import datetime
from enum import Enum

class AuditAction(Enum):
    LOGIN = "login"
    LOGOUT = "logout"
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    EXPORT = "export"

def audit_log(
    action: AuditAction,
    resource_type: str,
    resource_id: str,
    actor_id: str,
    actor_type: str = "customer",
    details: dict | None = None,
    outcome: str = "success"
):
    """
    Create structured audit log entry.

    SOC 2 CC4.1, CC7.2: Monitoring activities
    """
    logger = structlog.get_logger("audit")
    logger.info(
        "audit_event",
        timestamp=datetime.utcnow().isoformat(),
        action=action.value,
        resource_type=resource_type,
        resource_id=resource_id,
        actor_id=actor_id,
        actor_type=actor_type,
        outcome=outcome,
        details=details or {},
    )

# Usage examples
audit_log(
    action=AuditAction.LOGIN,
    resource_type="session",
    resource_id="sess_abc123",
    actor_id="cust_xyz789",
    details={"ip": "192.168.1.1", "mfa_used": True}
)

audit_log(
    action=AuditAction.DELETE,
    resource_type="widget",
    resource_id="widget_abc",
    actor_id="cust_xyz789",
    details={"widget_name": "Support Chat"}
)
```

### Log Query for Audit

```sql
-- Find all access to customer data in last 30 days
SELECT
    timestamp,
    json_extract(payload, '$.action') as action,
    json_extract(payload, '$.resource_type') as resource_type,
    json_extract(payload, '$.actor_id') as actor_id,
    json_extract(payload, '$.outcome') as outcome
FROM audit_logs
WHERE
    timestamp >= CURRENT_DATE - INTERVAL '30 days'
    AND json_extract(payload, '$.resource_type') IN ('customer', 'conversation', 'message')
ORDER BY timestamp DESC;
```

---

## Control Implementation Patterns

### Secret Rotation

```python
from google.cloud import secretmanager
from datetime import datetime, timedelta

class SecretRotator:
    def __init__(self, project_id: str):
        self.client = secretmanager.SecretManagerServiceClient()
        self.project_id = project_id

    async def rotate_api_key(self, secret_name: str) -> str:
        """
        Rotate API key with zero-downtime.

        SOC 2 CC6.1: Logical and physical access controls
        """
        # 1. Generate new key
        new_key = generate_secure_key()

        # 2. Add new version (both versions now valid)
        parent = f"projects/{self.project_id}/secrets/{secret_name}"
        self.client.add_secret_version(
            parent=parent,
            payload={"data": new_key.encode()}
        )

        # 3. Wait for propagation
        await asyncio.sleep(60)

        # 4. Disable old version
        old_versions = self.client.list_secret_versions(parent=parent)
        for version in old_versions:
            if version.state == secretmanager.SecretVersion.State.ENABLED:
                if version.name != latest_version.name:
                    self.client.disable_secret_version(name=version.name)

        # 5. Log rotation
        audit_log(
            action=AuditAction.UPDATE,
            resource_type="secret",
            resource_id=secret_name,
            actor_id="system",
            actor_type="automation",
            details={"reason": "scheduled_rotation"}
        )

        return new_key
```

### Data Classification Decorator

```python
from enum import Enum
from functools import wraps

class DataClassification(Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"

def classified(level: DataClassification):
    """
    Mark endpoint with data classification.
    Enables automatic logging and access control.
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Log access to classified data
            if level in [DataClassification.CONFIDENTIAL, DataClassification.RESTRICTED]:
                audit_log(
                    action=AuditAction.READ,
                    resource_type="classified_endpoint",
                    resource_id=func.__name__,
                    actor_id=get_current_user_id(),
                    details={"classification": level.value}
                )
            return await func(*args, **kwargs)
        wrapper._classification = level
        return wrapper
    return decorator

# Usage
@router.get("/api/v1/dashboard/customers/{customer_id}")
@classified(DataClassification.CONFIDENTIAL)
async def get_customer_details(customer_id: str):
    """Access to customer PII - classified as confidential."""
    ...
```

## CSP Delivery-Point Parity

When a meta-tag CSP includes a directive that's silently ignored (e.g. `frame-ancestors`, which the HTML5 spec drops in `<meta>` but honors in HTTP headers), add an inline maintainer-signal comment so the server-side rule isn't deleted on the assumption that the meta covers it:

```html
<!-- frame-ancestors is browser-ignored in meta tags; enforced server-side via .htaccess -->
<meta http-equiv="Content-Security-Policy" content="...; frame-ancestors 'none'">
```

**Parity-check one-liner** — diff the meta-tag CSP against the server-header CSP. Any non-empty diff = drift between delivery points; worth running on any header-config PR:

```bash
diff <(grep -h Content-Security-Policy *.html | sed 's/.*content="//;s/".*//') \
     <(grep -h Content-Security-Policy .htaccess | sed 's/.*"\([^"]*\)".*/\1/')
```
