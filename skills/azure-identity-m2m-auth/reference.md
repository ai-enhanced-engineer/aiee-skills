# Azure AD M2M Authentication Reference

Detailed reference for `azure-identity` + MSAL Python patterns. Companion to `SKILL.md`.

## Failure-Layer Disambiguation

A `DefaultAzureCredential`-backed call can fail at three distinct layers with different error signatures and different owning teams:

| Layer | Trigger | Error signature | Fix path | Team owner |
|-------|---------|----------------|---------|-----------|
| **Authentication** | Credential chain exhausts before token is issued | `ClientAuthenticationError` listing each rung's failure reason | `az login`, correct env vars, or valid SP credentials | Developer / DevOps |
| **Conditional Access** | Token issuance denied at Entra | Error 53003 / "Device state: Unregistered" | Device registration, CA policy exemption, or service-principal escape | IT / Entra admin |
| **Resource RBAC** | Token issued and accepted; resource rejects principal at role layer | `AuthorizationFailure` (Storage), `amqp:client-error` (Service Bus), `403 Forbidden` (REST APIs) | Role grant at the resource scope | Resource / subscription owner |

**AAD tokens are tenant-scoped, not subscription-scoped**: `DefaultAzureCredential` requests resource scopes (`https://servicebus.azure.net/.default`). Token issuance happens at the tenant level. `az account set --subscription` changes the active CLI subscription but has zero effect on resource RBAC enforcement. "Switch to the right subscription" is never a fix for `AuthorizationFailure` or `amqp:client-error`.

**Empirical suppression of the "wrong subscription" challenge**: run the experiment once (switch subscription, re-run the failing call) and record the identical failure to pre-empt the predictable first-question in standup. The evidence closes the line of inquiry without a meeting derail.

**Same account, different failure layers**: the same `_ext` contractor account can hit Conditional Access on one API (CA gate at Entra) and Resource RBAC on another (token issued, role missing) in the same session. Each resource and each CA policy is independently configured.

---

## 1. `DefaultAzureCredential` Chain

### Resolution order (azure-identity 1.25.x)

1. `EnvironmentCredential` — `AZURE_CLIENT_ID` + `AZURE_TENANT_ID` + (`AZURE_CLIENT_SECRET` or `AZURE_CLIENT_CERTIFICATE_PATH`)
2. `WorkloadIdentityCredential` — AKS pods with OIDC-projected service account tokens (preferred for AKS prod)
3. `ManagedIdentityCredential` — App Service, Functions, AKS node identity, Container Apps
4. `AzureCliCredential` — local dev (runs `az account get-access-token`)
5. `AzureDeveloperCliCredential` — local dev via `azd`
6. `AzurePowerShellCredential` — local dev
7. `VisualStudioCodeCredential` — local dev (deprecated path, often broken)

### Production lockdown

```python
from azure.identity import DefaultAzureCredential

# Lock down to managed identity paths only
credential = DefaultAzureCredential(
    exclude_environment_credential=True,         # if not using env vars
    exclude_azure_cli_credential=True,           # NEVER in prod
    exclude_azure_developer_cli_credential=True,
    exclude_powershell_credential=True,
    exclude_visual_studio_code_credential=True,
)
```

### Explicit credential (recommended on known compute type)

```python
from azure.identity import ManagedIdentityCredential

# System-assigned managed identity
credential = ManagedIdentityCredential()

# User-assigned managed identity (if multiple are attached)
credential = ManagedIdentityCredential(client_id="<user-assigned-mi-client-id>")
```

### Continuation policy (1.14.0+)

Developer credentials (CLI, PowerShell, VS Code) no longer stop the chain on failure — all are attempted. Deployed credentials (Managed Identity, Workload Identity) DO stop the chain with `CredentialUnavailableError`. This means:

- A misconfigured Managed Identity in production raises immediately (good — fail loud).
- Mixing dev/prod credentials in the same chain works as expected — dev fallbacks attempt all paths.

### Debug logging (dev only)

```python
import logging
logging.getLogger("azure.identity").setLevel(logging.DEBUG)
# OR
credential = DefaultAzureCredential(logging_enable=True)
```

`AZURE_LOG_LEVEL=DEBUG` exposes HTTP session details; production environments typically restrict this to avoid leaking auth headers into logs.

---

## 2. MSAL Confidential Client Flow

### Minimal pattern

```python
import msal

app = msal.ConfidentialClientApplication(
    client_id="<APP_CLIENT_ID>",
    client_credential="<CLIENT_SECRET>",       # str OR cert dict; load from KeyVault
    authority=f"https://login.microsoftonline.com/{TENANT_ID}",
    token_cache=msal.SerializableTokenCache(), # in-memory by default
)

scopes = ["https://graph.microsoft.com/.default"]
result = app.acquire_token_for_client(scopes=scopes)

if "access_token" in result:
    token = result["access_token"]
else:
    raise RuntimeError(f"Token acquisition failed: {result.get('error_description')}")
```

### Behavioral facts (MSAL Python 1.23+)

- `acquire_token_for_client` automatically searches in-memory cache before hitting Entra ID. Calling `acquire_token_silent` first is now redundant for this flow.
- Tokens for client_credentials flow are typically valid for 3600 seconds (1 hour). MSAL refreshes from cache automatically.
- `acquire_token_silent_with_error()` distinguishes cache miss (returns None) from refresh error (returns error dict). Useful for retry logic.

### Scope format rules

- Use `https://<resource>/.default` — requests all permissions granted to the SP in the app registration.
- Scope list must be a Python `list[str]`, not space-delimited.
- Common Azure scopes:
  - `https://graph.microsoft.com/.default`
  - `https://vault.azure.net/.default`
  - `https://management.azure.com/.default`

### Distributed token cache (Redis)

In-memory cache works for single-process / single-replica services. For multi-replica deployments, share the cache via Redis:

```python
import msal
import redis

class RedisMsalCache(msal.SerializableTokenCache):
    def __init__(self, redis_client: redis.Redis, key: str, ttl: int = 3300):
        super().__init__()
        self._redis = redis_client
        self._key = key
        self._ttl = ttl

    def load(self) -> None:
        data = self._redis.get(self._key)
        if data:
            self.deserialize(data)

    def flush(self) -> None:
        if self.has_state_changed:
            self._redis.setex(self._key, self._ttl, self.serialize())

# Usage: load before acquire, flush after
cache = RedisMsalCache(redis_client, key="msal:m2m:token-cache")
cache.load()
app = msal.ConfidentialClientApplication(..., token_cache=cache)
result = app.acquire_token_for_client(scopes=scopes)
cache.flush()
```

Set Redis TTL slightly shorter than token lifetime (e.g., 3300s vs 3600s) so cache expiry triggers a fresh acquire rather than serving a stale token.

---

## 3. KeyVault Secret Access

### Sync access (most common)

```python
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

credential = DefaultAzureCredential()
client = SecretClient(
    vault_url="https://<vault-name>.vault.azure.net/",
    credential=credential,
)

secret = client.get_secret("my-client-secret")
value = secret.value          # str
version = secret.properties.version
```

### Async variant (FastAPI lifespan)

```python
from contextlib import asynccontextmanager
from azure.identity.aio import DefaultAzureCredential
from azure.keyvault.secrets.aio import SecretClient
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    credential = DefaultAzureCredential()
    kv = SecretClient(vault_url=settings.KEYVAULT_URL, credential=credential)

    secret = await kv.get_secret("msal-client-secret")
    app.state.client_secret = secret.value

    async with credential, kv:
        yield
```

### Caching strategy decision

| Pattern | Use When | TTL |
|---|---|---|
| Fetch once at startup | Short-lived containers, infrequent rotation | Restart container post-rotation |
| TTL-based in-process | Long-running processes, rotation expected | 30–60 min poll |
| Live fetch every request | High-security, frequent rotation | ~10ms latency per call |

**Recommended for M2M services**: bulk-fetch at startup (`lifespan`) + TTL refresh background task or `ClientAuthenticationError`-triggered refresh.

### Rotation detection

KeyVault has no push-based rotation in the Python SDK. Three options:

1. **TTL polling** — background task calls `get_secret` every N minutes, compares `secret.properties.version`.
2. **Event Grid webhook** — subscribe to `SecretNewVersionCreated`, POST to a `/rotate` endpoint on the service.
3. **Restart-on-rotate** — Azure DevOps / GitHub Actions triggers a service redeploy after rotation.

### Cold-start failure mode

If KeyVault is unreachable at startup (network policy, RBAC misconfig), `get_secret` raises `ServiceRequestError` or `ClientAuthenticationError`. Mitigation:

```python
import os
from azure.core.exceptions import ServiceRequestError, ClientAuthenticationError

def load_secret_with_fallback(kv: SecretClient, name: str) -> str:
    try:
        return kv.get_secret(name).value
    except (ServiceRequestError, ClientAuthenticationError) as e:
        env_val = os.environ.get(name.upper().replace("-", "_"))
        if env_val:
            return env_val
        raise RuntimeError(f"KeyVault unreachable and no env fallback for {name!r}") from e
```

Fail fast in production — better to crash and let the orchestrator restart than to run with broken auth.

---

## 4. Managed Identity vs Service Principal

### Decision matrix

| Dimension | Managed Identity | Service Principal |
|---|---|---|
| Secret management | None — Azure handles | Owner's responsibility |
| Rotation burden | Zero (automatic) | Manual; quarterly minimum |
| Portability | Azure compute only | Any environment, any cloud |
| AKS support | System-assigned + user-assigned (Workload Identity) | Yes, with mounted KeyVault secret |
| GitHub Actions | No (use Workload Identity Federation instead) | Yes, with WIF (no stored secret) |
| Multi-cloud | No | Yes |
| Setup complexity | Low | Moderate (registration + secret/cert mgmt) |

### AKS Workload Identity vs Pod Identity

- **AAD Pod Identity** — DaemonSet-based, uses IMDS. **Deprecated**. Migrate away.
- **Workload Identity (OIDC)** — modern replacement; no privileged DaemonSet; OIDC token projected into pod filesystem; `DefaultAzureCredential` picks it up via `WorkloadIdentityCredential` when `AZURE_FEDERATED_TOKEN_FILE` is set.

Setup steps:
1. Enable OIDC issuer on AKS cluster.
2. Create Azure-managed identity.
3. Create Kubernetes `ServiceAccount` with `azure.workload.identity/client-id` annotation.
4. Create `FederatedIdentityCredential` linking the SA subject to the managed identity.
5. Pods using that SA automatically get the token via `DefaultAzureCredential`.

---

## 5. Retry and Resilience

### Token fetch retries

```python
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from azure.core.exceptions import ClientAuthenticationError, ServiceRequestError

@retry(
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((ClientAuthenticationError, ServiceRequestError)),
    reraise=True,
)
def acquire_token_with_retry(msal_app, scopes: list[str]) -> str:
    result = msal_app.acquire_token_for_client(scopes=scopes)
    if "access_token" not in result:
        raise ClientAuthenticationError(
            f"Token acquisition failed: {result.get('error_description')}"
        )
    return result["access_token"]
```

### Lock for concurrent token fetch

If multiple coroutines need the token simultaneously and the cache is empty, serialize with `asyncio.Lock`:

```python
import asyncio

_token_lock = asyncio.Lock()

async def get_token() -> str:
    async with _token_lock:
        # MSAL's internal cache short-circuits if already fetched
        return await asyncio.to_thread(acquire_token_with_retry, msal_app, scopes)
```

This prevents N concurrent first-time acquisitions hitting Entra ID at startup.

---

## Anti-patterns

| Anti-Pattern | Why It Fails | Fix |
|---|---|---|
| Hardcoded client secret in `settings.py` or `.env` | Leaks in git history; no rotation | Load from KeyVault via `SecretClient` at startup; Managed Identity if on Azure |
| Re-acquire token per request | 200–500ms Entra ID round-trip per call; throttling risk | Single `ConfidentialClientApplication` per process; MSAL cache handles refresh |
| No retry on token fetch | Transient Entra ID / KeyVault outage cascades | `tenacity` exp backoff with `retry_if_exception_type((ClientAuthenticationError, ServiceRequestError))` |
| Logging the token / full result dict | `access_token` lands in log aggregation | Log only outcome: `logger.info("Token acquired", extra={"expires_in": result.get("expires_in")})` |
| Plaintext token cache on disk | Bearer credential exposure if file leaks | In-memory only (single-replica) or encrypted Redis (multi-replica) |
| `AzureCliCredential` in production | `az` not installed in pod; chain fails loudly | `exclude_azure_cli_credential=True` on production `DefaultAzureCredential` |
| Mixing `DefaultAzureCredential` and `ClientSecretCredential` in same code | Code path divergence; testing surface explosion | Pick one strategy per service; use `DefaultAzureCredential` in prod, override in tests |
| KeyVault cold-start no fallback | Service hangs at boot; orchestrator never restarts | Fail fast: raise `RuntimeError` with clear message; let the platform restart |

---

## References

- [azure-identity Python README](https://learn.microsoft.com/en-us/python/api/overview/azure/identity-readme)
- [MSAL Python documentation](https://msal-python.readthedocs.io/)
- [Azure Key Vault Secrets SDK](https://learn.microsoft.com/en-us/python/api/overview/azure/keyvault-secrets-readme)
- [Acquire and cache tokens with MSAL](https://learn.microsoft.com/en-us/entra/identity-platform/msal-acquire-cache-tokens)
- [AKS Workload Identity Overview](https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview)
- Foundation: `arch-python-modern`, `aws-security-hardening`
