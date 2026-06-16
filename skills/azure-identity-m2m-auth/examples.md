# Azure AD M2M Authentication Examples

Project-grounded examples from `example-service`.

---

## Example 1: Project's Current Pattern (annotated)

`app/auth/m2m/token_fetcher.py` uses `ClientSecretCredential` directly:

```python
# app/auth/m2m/token_fetcher.py — actual code (annotated)
import logging
from datetime import UTC, datetime
from azure.identity import ClientSecretCredential

logger = logging.getLogger(__name__)


class B2CTokenFetcher:
    """Fetches Azure B2C tokens using client_credentials flow."""

    def __init__(self, scope: list, tenant_id: str, client_id: str, client_secret: str):
        if not client_id:
            raise ValueError("client_id should be the id of a Microsoft Entra application")
        if not client_secret:
            raise ValueError("secret should be a Microsoft Entra application's client secret")
        if not tenant_id:
            raise ValueError("tenant_id should be the id of a Microsoft Entra application")
        if not scope or not isinstance(scope, list):
            raise (ValueError if not scope else TypeError)("scope should be a non-empty list")

        self.credential = ClientSecretCredential(tenant_id, client_id, client_secret)
        self.scope = scope

    def fetch_token(self):
        # ClientSecretCredential.get_token caches and renews automatically
        token = self.credential.get_token(*self.scope)
        logger.debug(f"Token expires at: {datetime.fromtimestamp(token.expires_on, tz=UTC)}")
        return token.token
```

**What works**:
- `ClientSecretCredential.get_token` caches automatically (azure-identity handles refresh).
- Constructor validates inputs upfront — fails at instantiation, not later at `fetch_token()`.
- Returns just the bearer string — caller doesn't have to navigate `AccessToken` objects.

**Limitations to consider**:
- **Hardcoded credential type** — locks the project to Service Principal forever. If the project moves to AKS or Container Apps, the secret is unnecessary.
- **No retry** — transient Entra ID outage will surface as `ClientAuthenticationError` to the caller.
- **Secret comes from settings** — likely from env var `CLIENT_SECRET`. Should come from KeyVault.

---

## Example 2: Recommended Migration Path

Step-by-step refactor toward Managed Identity:

### Phase 1: Wrap with retry + KeyVault for the secret

```python
# app/auth/m2m/token_fetcher_v2.py
import logging
from datetime import UTC, datetime
from azure.identity import ClientSecretCredential
from azure.core.exceptions import ClientAuthenticationError, ServiceRequestError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

logger = logging.getLogger(__name__)


class B2CTokenFetcher:
    def __init__(self, scope: list[str], tenant_id: str, client_id: str, client_secret: str):
        # ... existing validation ...
        self.credential = ClientSecretCredential(tenant_id, client_id, client_secret)
        self.scope = scope

    @retry(
        wait=wait_exponential(min=1, max=30),
        stop=stop_after_attempt(3),
        retry=retry_if_exception_type((ClientAuthenticationError, ServiceRequestError)),
        reraise=True,
    )
    def fetch_token(self) -> str:
        token = self.credential.get_token(*self.scope)
        logger.debug(
            "Token acquired",
            extra={"expires_at_utc": datetime.fromtimestamp(token.expires_on, tz=UTC).isoformat()},
        )
        return token.token   # do NOT log this
```

### Phase 2: Move secret to KeyVault, fetch at lifespan startup

```python
# app/auth/m2m/setup.py
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from app.auth.m2m.token_fetcher_v2 import B2CTokenFetcher

def build_token_fetcher_from_keyvault(settings) -> B2CTokenFetcher:
    """Bootstraps the token fetcher with the secret pulled from KeyVault."""
    kv_credential = DefaultAzureCredential(
        exclude_azure_cli_credential=True,                    # never in prod
        exclude_azure_developer_cli_credential=True,
        exclude_powershell_credential=True,
        exclude_visual_studio_code_credential=True,
    )
    kv = SecretClient(vault_url=settings.KEYVAULT_URL, credential=kv_credential)
    client_secret = kv.get_secret("app-client-secret").value

    return B2CTokenFetcher(
        scope=[settings.M2M_SCOPE],
        tenant_id=settings.TENANT_ID,
        client_id=settings.CLIENT_ID,
        client_secret=client_secret,
    )
```

```python
# app/main.py — lifespan hook
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        app.state.token_fetcher = build_token_fetcher_from_keyvault(settings)
        # Pre-fetch initial token so first request doesn't pay the latency
        app.state.token_fetcher.fetch_token()
    except Exception:
        logger.exception("Failed to initialize M2M token fetcher")
        logger.warning("App starting without M2M authentication")
    # ... rest of lifespan ...
```

### Phase 3 (terminal): Move to Managed Identity

Once the service runs on AKS / Container Apps:

```python
# app/auth/m2m/token_fetcher_mi.py
from azure.identity import ManagedIdentityCredential

class ManagedIdentityTokenFetcher:
    """No client secret needed — Azure compute platform issues tokens."""

    def __init__(self, scope: list[str], client_id: str | None = None):
        # client_id is optional — set when using user-assigned MI
        self.credential = ManagedIdentityCredential(client_id=client_id) if client_id else ManagedIdentityCredential()
        self.scope = scope

    def fetch_token(self) -> str:
        token = self.credential.get_token(*self.scope)
        return token.token
```

The `ConfidentialClientApplication` / client secret are gone entirely. The pod's identity issues tokens directly via the Azure metadata service.

---

## Example 3: MSAL `ConfidentialClientApplication` Pattern

For projects that need MSAL's explicit cache control (e.g., distributed Redis cache):

```python
# Alternative: use MSAL ConfidentialClientApplication directly
import msal
from tenacity import retry, stop_after_attempt, wait_exponential

class MsalTokenFetcher:
    def __init__(self, client_id: str, client_secret: str, tenant_id: str, scope: list[str]):
        self.app = msal.ConfidentialClientApplication(
            client_id=client_id,
            client_credential=client_secret,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            token_cache=msal.SerializableTokenCache(),
        )
        self.scope = scope

    @retry(wait=wait_exponential(min=1, max=30), stop=stop_after_attempt(3), reraise=True)
    def fetch_token(self) -> str:
        # acquire_token_for_client checks cache internally (MSAL 1.23+)
        result = self.app.acquire_token_for_client(scopes=self.scope)
        if "access_token" not in result:
            raise RuntimeError(f"Token acquisition failed: {result.get('error_description')}")
        return result["access_token"]
```

When to choose MSAL over `ClientSecretCredential`:
- You need a custom `token_cache` (Redis, file, encrypted disk).
- You want to inspect `result["expires_in"]` or other claims for instrumentation.
- You're integrating with a multi-tenant app (different `authority` per request).

For most service-to-service M2M flows, `ClientSecretCredential` (azure-identity) is simpler and sufficient.

---

## Example 4: KeyVault Bulk-Fetch at Startup

```python
# settings/keyvault.py
from contextlib import asynccontextmanager
from azure.identity.aio import DefaultAzureCredential
from azure.keyvault.secrets.aio import SecretClient
from fastapi import FastAPI

# Map of secret-name → app.state attribute
SECRETS_TO_FETCH = {
    "app-client-secret": "client_secret",
    "app-mongodb-uri": "mongodb_uri",
    "app-sonar-token": "sonar_token",
}


@asynccontextmanager
async def keyvault_lifespan(app: FastAPI):
    credential = DefaultAzureCredential(
        exclude_azure_cli_credential=True,
        exclude_powershell_credential=True,
        exclude_visual_studio_code_credential=True,
    )
    kv = SecretClient(vault_url=settings.KEYVAULT_URL, credential=credential)

    async with credential, kv:
        for kv_name, attr_name in SECRETS_TO_FETCH.items():
            try:
                secret = await kv.get_secret(kv_name)
                setattr(app.state, attr_name, secret.value)
            except Exception:
                logger.exception(f"Failed to fetch {kv_name}")
                # Decide: hard-fail or env fallback? Depends on the secret's criticality.
                env_fallback = os.environ.get(attr_name.upper())
                if env_fallback:
                    setattr(app.state, attr_name, env_fallback)
                else:
                    raise RuntimeError(f"KeyVault unreachable and no env fallback for {kv_name}")
        yield
```

Fetching all secrets in one lifespan hook ensures the app boots into a known state — either it has every secret it needs or it crashes, never half-configured.

---

## Example 5: GitHub Actions → Azure (Workload Identity Federation)

The project's `.github/workflows/quality-versioning-pipeline.yaml` currently uses stored `AZURE_CLIENT_SECRET`. The modern pattern eliminates that:

```yaml
# .github/workflows/release.yaml — recommended migration
name: Release

on:
  push:
    branches: [main]

permissions:
  id-token: write       # required for OIDC
  contents: read

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Federated login — NO stored client_secret
      - uses: azure/login@v2
        with:
          client-id: ${{ vars.AZURE_CLIENT_ID }}
          tenant-id: ${{ vars.AZURE_TENANT_ID }}
          subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
          # No client-secret — uses OIDC token from GitHub

      - name: Read secret from KeyVault
        run: |
          az keyvault secret show \
            --vault-name ${{ vars.AZURE_KEYVAULT_NAME }} \
            --name app-client-secret \
            --query value -o tsv
```

Setup on the Azure side:
1. Create a Service Principal (or use existing).
2. Add a `FederatedIdentityCredential`:
   - Issuer: `https://token.actions.githubusercontent.com`
   - Subject: `repo:your-org/example-service:ref:refs/heads/main`
   - Audience: `api://AzureADTokenExchange`
3. GHA's OIDC provider exchanges the JWT for an Azure access token at runtime.

**Benefit**: No `AZURE_CLIENT_SECRET` stored in GitHub secrets — eliminates a quarterly rotation chore and a credential leak vector.

---

## Anti-patterns observed in the project

| File | Issue | Fix |
|---|---|---|
| `app/auth/m2m/token_fetcher.py` | Client secret passed via constructor — likely sourced from env var | Load from KeyVault at lifespan startup; pin to MI when on AKS |
| `app/auth/m2m/token_fetcher.py` | Logs token expiration but uses f-string directly | Use structured logging: `logger.debug("token.acquired", extra={"expires_at_utc": iso})` |
| `app/auth/m2m/token_fetcher.py` | No retry on `get_token()` | Wrap with `tenacity` for transient Entra ID failures |
| `.github/workflows/quality-versioning-pipeline.yaml` | Stored `AZURE_CLIENT_SECRET` in repo secrets | Migrate to Workload Identity Federation (no stored secret) |

---

## Decision: which fetcher to use today?

For `example-service` deployed on AKS or Container Apps:

```python
# Final recommendation — Managed Identity, no secret needed
from azure.identity import ManagedIdentityCredential

credential = ManagedIdentityCredential()  # system-assigned MI
token = credential.get_token("https://api.company.com/.default").token
```

For the same project deployed on a non-Azure host (rare for a client):

```python
# Service Principal with KeyVault-stored secret
from azure.identity import ClientSecretCredential

credential = ClientSecretCredential(
    tenant_id=settings.TENANT_ID,
    client_id=settings.CLIENT_ID,
    client_secret=app.state.client_secret,   # loaded from KeyVault at lifespan startup
)
token = credential.get_token(settings.M2M_SCOPE).token
```

The MSAL path is reserved for cases where you genuinely need explicit cache control (multi-replica with shared Redis cache) — for most M2M, azure-identity is enough.
