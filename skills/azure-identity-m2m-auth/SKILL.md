---
name: azure-identity-m2m-auth
description: Azure AD machine-to-machine authentication for Python services using azure-identity (DefaultAzureCredential, ManagedIdentityCredential, ClientSecretCredential) and MSAL (ConfidentialClientApplication). Covers KeyVault secret access, token caching, Managed Identity vs Service Principal decision, and AKS Workload Identity. Use for service-to-service auth, KeyVault integration, and credential rotation in Azure-hosted Python microservices.
updated: 2026-05-08
---

# Azure AD M2M Authentication

Service-to-service Azure AD auth patterns for Python: token acquisition, KeyVault integration, and credential lifecycle. Covers when to reach for `azure-identity` (high-level credential chain) vs MSAL `ConfidentialClientApplication` (explicit OAuth2 client_credentials).

## When to use

- Acquiring Azure AD access tokens for downstream Microsoft APIs (Graph, KeyVault, Cosmos, ARM)
- Loading secrets from Azure KeyVault at startup
- Choosing between Managed Identity (Azure-native compute) and Service Principal (portable / CI/CD)
- Migrating off hardcoded `ClientSecretCredential` to `DefaultAzureCredential` or `ManagedIdentityCredential`
- Setting up GitHub Actions → Azure Workload Identity Federation (no stored secret)

For caching primitives (`asyncio.Lock`, `functools.lru_cache`), see `arch-python-modern`. For cross-cloud secret-handling principles, see `aws-security-hardening`.

## Core patterns

| Pattern | One-line rule |
|---|---|
| `DefaultAzureCredential` | Walks credential chain: env → workload identity → managed identity → CLI. Lock down for prod via `exclude_*` flags. |
| `ManagedIdentityCredential` | Use explicitly on Azure compute (AKS, Container Apps, App Service) — no secret to leak |
| `ClientSecretCredential` | Service Principal flow; use only when not on Azure compute. Secret from KeyVault, never env file. |
| MSAL `ConfidentialClientApplication` | Explicit OAuth2 client_credentials. `acquire_token_for_client()` caches internally since MSAL 1.23. |
| KeyVault `SecretClient` | `get_secret(name)` at lifespan startup; bulk-fetch + TTL refresh, not per-request |
| Scope format | `https://<resource>/.default` — Entra ID maps the resource to the SP's app-registration permissions; arbitrary scope strings won't resolve |
| Token TTL | Client_credentials tokens last 3600s; MSAL refreshes from cache automatically |
| Workload Identity | AKS pod with OIDC `ServiceAccount` + `FederatedIdentityCredential` — no client secret needed |

## Quick reference

```python
# Production: DefaultAzureCredential locked down to managed identity paths
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient

credential = DefaultAzureCredential(
    exclude_environment_credential=False,       # allow env if set
    exclude_azure_cli_credential=True,          # never in prod
    exclude_azure_developer_cli_credential=True,
    exclude_powershell_credential=True,
    exclude_visual_studio_code_credential=True,
)

# Bulk-fetch secrets at startup (FastAPI lifespan)
@asynccontextmanager
async def lifespan(app: FastAPI):
    kv = SecretClient(vault_url=settings.KEYVAULT_URL, credential=credential)
    app.state.client_secret = kv.get_secret("msal-client-secret").value
    app.state.sonar_token = kv.get_secret("sonar-token").value
    yield

# MSAL M2M token (single call, cache handled internally since v1.23)
import msal
msal_app = msal.ConfidentialClientApplication(
    client_id=settings.CLIENT_ID,
    client_credential=app.state.client_secret,
    authority=f"https://login.microsoftonline.com/{settings.TENANT_ID}",
)

result = msal_app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
if "access_token" not in result:
    raise RuntimeError(f"Token acquisition failed: {result.get('error_description')}")
token = result["access_token"]
```

## Decision: Managed Identity vs Service Principal

| Workload runs on... | Use |
|---|---|
| AKS pod | Workload Identity (OIDC + ServiceAccount + FederatedIdentityCredential) |
| Container Apps / App Service / Functions | System-assigned or user-assigned Managed Identity |
| GitHub Actions | Workload Identity Federation (Service Principal + OIDC, no stored secret) |
| Local dev | `AzureCliCredential` (via `az login`) |
| On-prem / non-Azure cloud | Service Principal + KeyVault-stored secret, rotate quarterly |

On Azure compute, Managed Identity removes the secret-rotation burden entirely; Service Principal remains the option when the workload is portable or runs off-Azure. Pod Identity (DaemonSet) is deprecated, with Workload Identity as the modern replacement.

## Failure-Layer Disambiguation

Three distinct failure layers with different error signatures and different owning teams — see `reference.md → Failure-Layer Disambiguation` for the full table.

## Anti-patterns (top 5)

1. **Hardcoded client secret** in `settings.py` or `.env` committed to source → Load from KeyVault; use Managed Identity if on Azure
2. **Re-acquire token per request** → MSAL caches internally since 1.23; one `ConfidentialClientApplication` per process
3. **No retry on token fetch** → wrap with `tenacity` exponential backoff for `ClientAuthenticationError`
4. **Logging the token** (`logger.info(f"Result: {result}")`) → log only outcome (`expires_in`), never the value
5. **Storing token in plaintext file** → in-memory only (single-replica) or encrypted Redis (multi-replica)

## Important notes

- **`DefaultAzureCredential` continuation policy changed in 1.14.0** — deployed credentials (Managed Identity) raise `CredentialUnavailableError` immediately on misconfiguration rather than silently falling through to CLI. This is good (fail-loud) but breaks legacy apps relying on the old behavior.
- **`acquire_token_for_client` self-caches since MSAL 1.23** — the older "always call `acquire_token_silent` first" pattern is now redundant for the client_credentials flow.
- **KeyVault has no push-based rotation in the Python SDK** — detect via TTL polling, version comparison, or Event Grid webhook.

See `reference.md` for full pattern catalogue, `examples.md` for project-grounded migration paths.
