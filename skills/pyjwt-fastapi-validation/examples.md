# PyJWT FastAPI Validation Examples

Project-grounded implementations from `example-service`.

## Example 1: Adding a new protected endpoint

Goal: expose `GET /v1/recommendations/{account_id}` that requires a valid Azure AD M2M token.

### Step 1 — Lifespan singleton for `PyJWKClient`

`app/main.py`:

```python
from contextlib import asynccontextmanager
import jwt
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.jwks_client = jwt.PyJWKClient(
        uri=f"https://login.microsoftonline.com/{settings.M2M_TENANT_ID}/discovery/v2.0/keys",
        cache_jwk_set=True,
        lifespan=86400,         # 24h, aligns with Microsoft's check-frequency guidance
        cache_keys=True,
        max_cached_keys=8,
    )
    yield
    # PyJWKClient has no explicit teardown

app = FastAPI(lifespan=lifespan)
```

### Step 2 — Settings with prod guard

`app/settings.py`:

```python
from pydantic import BaseSettings, model_validator

class Settings(BaseSettings):
    AUTH_BYPASS: bool = False
    ENV: str = "local"
    M2M_TENANT_ID: str
    M2M_CLIENT_ID: str

    @model_validator(mode="after")
    def guard_auth_bypass_in_prod(self) -> "Settings":
        if self.AUTH_BYPASS and self.ENV == "prod":
            raise ValueError("AUTH_BYPASS=true forbidden in prod")
        return self
```

### Step 3 — Auth dependency (`app/auth/dependencies.py`)

```python
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict
from typing import Annotated

bearer_scheme = HTTPBearer(auto_error=True)

class AzureADClaims(BaseModel):
    model_config = ConfigDict(extra="allow")
    iss: str
    aud: str
    exp: int
    tid: str
    sub: str
    azp: str | None = None
    roles: list[str] | None = None

def get_jwks_client(request: Request) -> jwt.PyJWKClient:
    return request.app.state.jwks_client

async def authenticate(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    jwks_client: Annotated[jwt.PyJWKClient, Depends(get_jwks_client)],
) -> AzureADClaims:
    if settings.AUTH_BYPASS:
        return AzureADClaims(
            iss="https://login.microsoftonline.com/test/v2.0",
            aud=settings.M2M_CLIENT_ID, exp=9999999999,
            tid="test-tenant", sub="test-sp",
        )

    token = credentials.credentials
    try:
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token, signing_key,
            algorithms=["RS256"],
            audience=settings.M2M_CLIENT_ID,
            issuer=f"https://login.microsoftonline.com/{settings.M2M_TENANT_ID}/v2.0",
            leeway=30,
        )
        return AzureADClaims(**payload)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired", headers={"WWW-Authenticate": "Bearer"})
    except jwt.PyJWKClientError:
        raise HTTPException(401, "Unable to find signing key", headers={"WWW-Authenticate": "Bearer"})
    except jwt.InvalidTokenError as e:
        raise HTTPException(401, f"Invalid token: {type(e).__name__}", headers={"WWW-Authenticate": "Bearer"})

CurrentClaims = Annotated[AzureADClaims, Depends(authenticate)]
```

### Step 4 — Router with router-level auth

`app/routers/recommendation.py`:

```python
from fastapi import APIRouter, Depends
from app.auth.dependencies import authenticate, CurrentClaims

reco_router = APIRouter(
    prefix="/v1/reco",
    tags=["recommendations"],
    dependencies=[Depends(authenticate)],   # all routes protected
)

@reco_router.get("/recommendations/{account_id}")
async def get_recommendations(
    account_id: str,
    claims: CurrentClaims,    # FastAPI deduplicates: authenticate runs once
) -> list[Recommendation]:
    # claims.azp identifies the calling service principal
    return await recommendation_service.recommend(
        account_id, requested_by=claims.azp
    )
```

## Example 2: Migrating from per-request JWKS fetch

The project's existing `app/auth/jwt.py` builds `PyJWKClient` inside the dependency on every request. The migration:

### Before

```python
class JWTBearer(HTTPBearer):
    async def __call__(self, request: Request) -> bool:
        if settings.AUTH_BYPASS:
            return True

        credentials = await super().__call__(request)
        try:
            url = f"{settings.M2M_ISSUER_BASEURL}/{settings.M2M_TENANT_ID}/discovery/v2.0/keys"
            jwks_client = jwt.PyJWKClient(url)        # NEW client per request
            signing_key = jwks_client.get_signing_key_from_jwt(credentials.credentials)
            jwt.decode(credentials.credentials, signing_key, algorithms=["RS256"])
            return True
        except jwt.PyJWTError:
            raise HTTPException(403, "Invalid token")
```

Problems: (1) JWKS fetched on every request — kills perf and risks rate limits, (2) no `audience=`/`issuer=` checks, (3) returns `True` instead of typed claims.

### After

Move to the lifespan-singleton pattern in Example 1. The key changes:

| Change | Why |
|---|---|
| `PyJWKClient` to `app.state` lifespan | Reuse cached keys across requests |
| Add `audience=` and `issuer=` | Reject confused-deputy + cross-tenant tokens |
| Return `AzureADClaims` not `True` | Handlers can read claims (`claims.azp`) |
| Split `PyJWKClientError` from `InvalidTokenError` | Network errors don't leak as 500 |
| Add `model_validator` on settings | Prevent `AUTH_BYPASS=true` in prod |

## Example 3: Validating M2M tokens for upstream calls

When the RECO API itself calls another Azure-protected service, the *acquisition* side belongs to `azure-identity-m2m-auth`. This skill only covers the *receiving* side.

The two skills meet in the middle: an M2M token issued for the upstream API arrives in the `Authorization` header of a request *to* RECO, so the validator's `audience=settings.M2M_CLIENT_ID` rejects tokens issued for downstream APIs reaching the wrong endpoint.

```python
# Caller (using azure-identity-m2m-auth):
result = msal_app.acquire_token_for_client(
    scopes=[f"api://{settings.RECO_APP_ID}/.default"]   # audience = RECO_APP_ID
)

# Receiver (this skill):
audience=settings.M2M_CLIENT_ID    # = RECO_APP_ID, must match
```

If the caller passes the wrong scope, RECO rejects the token with `InvalidAudienceError` → 401. This is the confused-deputy guarantee.

## Example 4: Role-based access on a sensitive endpoint

```python
def require_role(role: str):
    async def check_role(claims: CurrentClaims) -> AzureADClaims:
        if not claims.roles or role not in claims.roles:
            raise HTTPException(403, f"Required role '{role}' not present")
        return claims
    return check_role

AdminClaims = Annotated[AzureADClaims, Depends(require_role("reco.admin"))]

@admin_router.post("/cache/flush")
async def flush_cache(claims: AdminClaims):
    # claims.sub identifies the admin SP for audit logs
    audit_logger.info(f"cache flush by sub={claims.sub} tid={claims.tid}")
    await cache.flush_all()
```

App roles are configured in the App Registration manifest in Azure portal; `roles` claim only appears in M2M tokens when the calling SP has the role assigned.

## Example 5: Testing protected endpoints

With `AUTH_BYPASS=true` set in the test conftest (see `pytest-fastapi-async` skill), tests can hit protected routes without a real token:

```python
# tests/routers/test_recommendation.py
async def test__recommendations__returns_200_with_bypass(client):
    response = await client.get(
        "/v1/reco/recommendations/account-123",
        # no Authorization header needed — AUTH_BYPASS short-circuits
    )
    assert response.status_code == 200

async def test__recommendations__returns_401_when_bypass_off(monkeypatch, client):
    monkeypatch.setenv("AUTH_BYPASS", "false")
    # but: AUTH_BYPASS is read at settings init (module import time)
    # so monkeypatch.setenv won't help here — recreate the dependency manually
    response = await client.get("/v1/reco/recommendations/account-123")
    assert response.status_code in {401, 403}
```

The auth-failure-path test shows the limitation of `monkeypatch.setenv` for import-time env vars; see `pytest-fastapi-async` for the full pattern.
