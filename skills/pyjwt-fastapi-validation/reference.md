# PyJWT FastAPI Validation Reference

Detailed patterns for server-side Azure AD JWT validation. Companion to SKILL.md.

## 1. `jwt.decode()` API surface (PyJWT 2.12+)

```python
jwt.decode(
    jwt: str | bytes,
    key: str | bytes | PyJWK | AllowedPublicKeys = '',
    algorithms: Sequence[str] | None = None,
    options: dict | None = None,
    audience: str | Iterable[str] | None = None,
    issuer: str | Container[str] | None = None,
    subject: str | None = None,
    leeway: float | datetime.timedelta = 0,
) -> dict[str, Any]
```

### Mandatory claim verification

Verification is **automatic when the parameter is supplied**. If you forget `audience=`, the `aud` claim is not checked.

| Claim | Verified when | Raises |
|---|---|---|
| `exp` | always (default) | `jwt.ExpiredSignatureError` |
| `nbf` | always (default) | `jwt.ImmatureSignatureError` |
| `iat` | if present in token | `jwt.InvalidIssuedAtError` |
| `aud` | `audience=` supplied | `jwt.InvalidAudienceError` |
| `iss` | `issuer=` supplied | `jwt.InvalidIssuerError` |
| `sub` | `subject=` supplied | `jwt.InvalidSubjectError` |

### `leeway` parameter

Compensates for clock skew between issuer and validator (applies to `exp`, `nbf`, `iat`). 30 seconds is a reasonable default; never go above 5 minutes.

### Disabling verification (only for routing)

```python
unverified = jwt.decode(token, options={"verify_signature": False})
token_type = "m2m" if "tid" in unverified else "user"
# THEN do the verified decode using the right key/audience for that type
```

Never let an unverified `jwt.decode` call be the final step before authorizing a request.

## 2. `PyJWKClient` two-tier caching

```python
jwt.PyJWKClient(
    uri: str,
    cache_keys: bool = False,        # Tier 2 (per-key LRU)
    max_cached_keys: int = 16,
    cache_jwk_set: bool = True,      # Tier 1 (whole JWK Set, time-based)
    lifespan: float = 300,           # Tier 1 TTL in seconds
    headers: dict | None = None,
    timeout: float = 30,
    ssl_context = None,
)
```

| Tier | What it caches | Eviction |
|---|---|---|
| 1 — JWK Set | Full JWKS response from the discovery endpoint | Time (`lifespan`) |
| 2 — Signing key | Resolved `PyJWK` per `kid` | LRU (`max_cached_keys`) |

### Production config for Azure AD

```python
jwks_client = jwt.PyJWKClient(
    uri=f"https://login.microsoftonline.com/{settings.M2M_TENANT_ID}/discovery/v2.0/keys",
    cache_jwk_set=True,
    lifespan=86400,         # Microsoft: "check ~every 24 hours"
    cache_keys=True,
    max_cached_keys=8,      # Azure AD typically has 2-3 active keys
)
```

### Lazy rotation handling (built-in)

`get_signing_key_from_jwt(token)` does:
1. `jwt.get_unverified_header(token)` → extract `kid`
2. Look up `kid` in cached JWK Set
3. **Cache miss → refresh JWKS → retry once** → if still missing, raise `jwt.PyJWKClientError`

So even with `lifespan=86400`, an out-of-band Azure key rotation is recovered within the next request. No manual refresh logic needed.

### Multi-replica considerations

Each replica caches independently — this is correct. Keys are public, so cross-replica cache sharing has no security benefit and adds infrastructure dependency. (Contrast with token caching on the acquisition side, where shared caching matters for rate limits.)

## 3. Exception hierarchy

```
Exception
├── jwt.PyJWTError
│   ├── jwt.InvalidTokenError                  # base for decode errors
│   │   ├── jwt.ExpiredSignatureError
│   │   ├── jwt.ImmatureSignatureError
│   │   ├── jwt.InvalidSignatureError
│   │   ├── jwt.InvalidAudienceError
│   │   ├── jwt.InvalidIssuerError
│   │   ├── jwt.InvalidIssuedAtError
│   │   └── jwt.MissingRequiredClaimError
│   └── jwt.PyJWKClientError                   # NOT a subclass of InvalidTokenError
```

Always catch `PyJWKClientError` separately — it's the only branch for JWKS network/lookup failures. A blanket `except jwt.InvalidTokenError:` will let JWKS errors bubble as 500s.

## 4. FastAPI dependency wiring

### Bearer scheme choice

| | `HTTPBearer` | `OAuth2PasswordBearer` |
|-|---|---|
| Use case | M2M, service clients | Interactive human login |
| OpenAPI UI | Lock icon, paste token | Login form |
| Use it for RECO | **Yes** | No |

```python
from fastapi.security import HTTPBearer
bearer_scheme = HTTPBearer(auto_error=True)
# auto_error=True → 403 automatically when no Authorization header
```

### Typed claims model

```python
class AzureADClaims(BaseModel):
    model_config = ConfigDict(extra="allow")  # tolerate Azure's extra claims
    iss: str
    aud: str
    exp: int
    iat: int
    tid: str
    sub: str
    appid: str | None = None     # v1.0 tokens
    azp: str | None = None       # v2.0 tokens (caller's client_id)
    scp: str | None = None       # delegated scopes (space-separated)
    roles: list[str] | None = None  # app roles (M2M tokens)
```

`extra="allow"` is critical — Azure adds claims (`ver`, `oid`, `idp`, `wids`, `xms_*`) without notice. `extra="forbid"` would break on every Azure platform update.

### Router-level vs endpoint-level

Apply at router (cite `fastapi-patterns`):

```python
reco_router = APIRouter(
    prefix="/v1/reco",
    dependencies=[Depends(authenticate)],   # runs on every endpoint
)

@reco_router.get("/recommendations/{account_id}")
async def get_recs(
    account_id: str,
    claims: CurrentClaims,    # FastAPI deduplicates: authenticate runs once per request
):
    ...
```

The router-level `Depends` runs the dependency but discards the return value. Adding `claims: CurrentClaims` to the handler signature reuses the cached result — no double-validation.

### Scope/role enforcement

```python
def require_role(role: str):
    async def check_role(claims: CurrentClaims) -> AzureADClaims:
        if not claims.roles or role not in claims.roles:
            raise HTTPException(403, f"Required role '{role}' not present")
        return claims
    return check_role

AdminClaims = Annotated[AzureADClaims, Depends(require_role("reco.admin"))]
```

Use 401 for "no/invalid token", 403 for "valid token, insufficient privilege."

## 5. AUTH_BYPASS pattern

### Why a settings branch beats per-test `dependency_overrides`

| | Per-test override | `AUTH_BYPASS` settings branch |
|---|---|---|
| Coupling | Per-test, must clear in teardown | One audited branch |
| Forgotten teardown risk | Yes | No |
| Audit trail | Scattered `dependency_overrides` calls | One place to grep |
| Production accident risk | Low (test-only code) | **High** without env guard |

### Production guard (mandatory)

```python
from pydantic import BaseSettings, model_validator

class Settings(BaseSettings):
    AUTH_BYPASS: bool = False
    ENV: str = "local"

    @model_validator(mode="after")
    def guard_auth_bypass_in_prod(self) -> "Settings":
        if self.AUTH_BYPASS and self.ENV == "prod":
            raise ValueError(
                "AUTH_BYPASS=true is forbidden in prod — refusing to start."
            )
        return self
```

The guard fires at app boot. A misconfigured deployment fails fast rather than silently serving unauthenticated traffic.

### Typed mock claims (future-proof)

Returning `True` from the bypass branch works only when handlers don't unpack claims. Returning a typed `AzureADClaims` lets handlers like `claims.tid` keep working in test:

```python
if settings.AUTH_BYPASS:
    return AzureADClaims(
        iss="https://login.microsoftonline.com/test/v2.0",
        aud=settings.M2M_CLIENT_ID or "test-client",
        exp=9999999999, iat=0,
        tid="test-tenant", sub="test-sp",
    )
```

## 6. Migration: ad-hoc HMAC validator → PyJWKClient

Common legacy pattern (don't do this):

```python
# Legacy: per-request JWKS fetch + manual signature check
import requests, jwt
def validate_legacy(token):
    jwks = requests.get(JWKS_URI).json()  # network call EVERY request
    header = jwt.get_unverified_header(token)
    key = next(k for k in jwks["keys"] if k["kid"] == header["kid"])
    return jwt.decode(token, jwt.algorithms.RSAAlgorithm.from_jwk(key), algorithms=["RS256"])
```

Migration steps:
1. Initialize one `PyJWKClient` in `lifespan`, attach to `app.state.jwks_client`.
2. Replace per-request fetch with `jwks_client.get_signing_key_from_jwt(token)`.
3. Add `audience=` and `issuer=` to `jwt.decode()` (legacy code often skipped these).
4. Split exception handling: `PyJWKClientError` separate from `InvalidTokenError`.
5. Add `model_validator` guard for `AUTH_BYPASS`.

## 7. Anti-patterns (extended)

| Anti-pattern | Risk | Fix |
|---|---|---|
| `algorithms` from token header | alg-confusion / `alg=none` | Hardcode `["RS256"]` |
| Skipping `audience=` | Confused deputy across apps | Always pass `audience=settings.M2M_CLIENT_ID` |
| Skipping `issuer=` | Cross-tenant token acceptance | `issuer=f"https://login.microsoftonline.com/{tid}/v2.0"` |
| Per-request `PyJWKClient(uri)` | Network round-trip every call; rate-limit risk | Singleton on `app.state` |
| Caching by token string | Unbounded; tokens differ every call | `PyJWKClient` already caches by `kid` |
| `logger.info(f"token={token}")` | Token is a credential — logs become attack surface | Log only `kid`, `sub`, outcome |
| `AUTH_BYPASS` with no `ENV` guard | Misconfig disables auth in prod | `@model_validator(mode="after")` |
| Final decode with `verify_signature=False` | Any forged JWT accepted | Unverified decode only for routing/type-detection |
| Catch `InvalidTokenError` only | JWKS errors leak as 500 | Catch `PyJWKClientError` separately |
| Importing `M2M_CLIENT_SECRET` here | Wrong side — validation is asymmetric (RS256) | Validation only needs JWKS URI + claim expectations |

## 8. References

- [PyJWT 2.12 usage](https://pyjwt.readthedocs.io/en/latest/usage.html)
- [PyJWT API reference](https://pyjwt.readthedocs.io/en/stable/api.html)
- [Microsoft Entra ID access tokens](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens)
- [FastAPI OAuth2 with JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- Sibling skills: `azure-identity-m2m-auth`, `fastapi-patterns`, `arch-python-modern`
