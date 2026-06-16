---
name: pyjwt-fastapi-validation
description: Server-side JWT validation in FastAPI for Azure AD–issued M2M tokens. PyJWT 2.x decode pipeline, PyJWKClient two-tier caching, mandatory aud/iss/alg checks, typed Pydantic claims dependency, and AUTH_BYPASS toggle with prod guard. Sibling to azure-identity-m2m-auth (which owns acquisition). Use for protecting FastAPI endpoints, building auth dependencies, debugging 401s, or migrating from custom HMAC validation to PyJWKClient.
updated: 2026-04-27
---

# PyJWT FastAPI Validation

Server-side validation of Azure AD–issued JWTs in FastAPI services — JWKS caching, mandatory claim checks, the typed claims dependency, and a safe test-bypass toggle.

## When to use

- Adding a protected endpoint that accepts an Azure AD bearer token
- Debugging 401s, JWKS fetch storms, or `kid`-not-found errors
- Migrating from per-request JWKS fetches to a singleton `PyJWKClient`
- Reviewing a test-bypass toggle for prod-misconfig risk

This is the **receiving** side. For *acquiring* tokens (DefaultAzureCredential, MSAL, KeyVault), see `azure-identity-m2m-auth`. For where the validator plugs into a FastAPI app (router-level `Depends`, `Annotated` aliases), see `fastapi-patterns`.

## Core patterns

| Pattern | Description |
|---|---|
| `algorithms` pinning | Hardcode `algorithms=["RS256"]`. Reading the header `alg` enables algorithm-confusion / `alg=none` attacks. |
| Mandatory claim params | PyJWT verifies `aud` and `iss` only when supplied; omitting them accepts cross-app or cross-tenant tokens (confused deputy). |
| `PyJWKClient` cache | `cache_jwk_set=True, lifespan=86400` aligns with Microsoft's 24h check guidance; kid-miss triggers an automatic refresh. |
| Singleton client | One `PyJWKClient` per process on `app.state.jwks_client` avoids per-request JWKS round-trips. |
| Exception split | `PyJWKClientError` is **not** a subclass of `InvalidTokenError`; a single `except InvalidTokenError` lets JWKS network errors leak as 500s. |
| Bearer scheme | `HTTPBearer` is the right fit for M2M (no login form); `OAuth2PasswordBearer` is for interactive flows. |
| Typed claims | A Pydantic `AzureADClaims` with `extra="allow"` survives Azure adding new claims without breaking decode. |
| 401 headers | RFC 6750 mandates `WWW-Authenticate: Bearer` on every 401 from this dependency. |
| Bypass + prod guard | A test-bypass branch must be paired with a `@model_validator(mode="after")` that refuses startup if the bypass is enabled in prod. |

## Skeleton

```python
# Decision shape only — full implementation in examples.md (Example 1)
async def authenticate(credentials, jwks_client) -> AzureADClaims:
    if settings.AUTH_BYPASS:
        return _mock_claims()                 # paired with prod-env guard in settings
    signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)
    payload = jwt.decode(
        credentials.credentials, signing_key,
        algorithms=["RS256"],                  # pinned; never from header
        audience=settings.M2M_CLIENT_ID,       # mandatory
        issuer=f"https://login.microsoftonline.com/{settings.M2M_TENANT_ID}/v2.0",
    )
    return AzureADClaims(**payload)
```

## Anti-patterns (top 5)

1. **`algorithms=jwt.get_unverified_header(token)["alg"]`** → algorithm-confusion / `alg=none` attack. Pin `["RS256"]`.
2. **Skipping `audience=` or `issuer=`** → confused deputy: tokens for a different app or tenant are accepted.
3. **`PyJWKClient(uri)` inside the dependency** → 1 HTTPS round-trip per request; rate-limit risk.
4. **`except jwt.InvalidTokenError:` only** → JWKS network failures leak as 500s; catch `PyJWKClientError` separately.
5. **Bypass toggle without env guard** → one mis-deployed env var disables auth in prod silently.

See `reference.md` for the full pattern catalogue and `examples.md` for the lifespan singleton + dependency wiring + per-request-fetch migration walkthrough.
