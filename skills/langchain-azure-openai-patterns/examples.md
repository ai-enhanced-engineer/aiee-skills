# LangChain + Azure OpenAI Patterns Examples

Project-grounded implementations from `example-service/example-processor`. Examples annotate the current pattern, the failure mode, and the recommended refactor.

---

## Example 1: AzureChatOpenAI Singleton — Static Token Anti-Pattern + Fix

### Current pattern (`example-processor/example_processor/utils/azure_openai_client_manager.py`)

```python
# example-processor/example_processor/utils/azure_openai_client_manager.py
class AzureOpenaiClientManager:
    _azure_openai_client = None

    @classmethod
    def get_azure_openai_client(cls):
        if cls._azure_openai_client is None:
            credential = CredentialManager.get_credential()
            token = credential.get_token(
                "https://cognitiveservices.azure.com/.default"
            )                                              # line 28
            cls._azure_openai_client = AzureChatOpenAI(    # line 31
                azure_endpoint=AZURE_OPENAI_ENDPOINT,
                openai_api_version=OPENAI_API_VERSION,
                deployment_name=OPENAI_DEPLOYMENT,
                openai_api_key=token.token,                # line 35 — ANTI-PATTERN
                temperature=0,
            )
        return cls._azure_openai_client
```

**Failure mode**: The token is fetched once at singleton init and stored as a string via `openai_api_key=token.token`. Azure AD tokens have a 3600s TTL. After ~1 hour, the long-running queue consumer hits `401 Unauthorized` from the OpenAI endpoint. Restarting the process fixes it temporarily — masking the real bug.

Also note: `deployment_name` is deprecated in favor of `azure_deployment`.

### Recommended refactor

```python
# example-processor/example_processor/utils/azure_openai_client_manager.py
import logging

import openai
from azure.core.exceptions import ServiceRequestError
from azure.identity import get_bearer_token_provider
from config.env import (
    AZURE_OPENAI_ENDPOINT,
    OPENAI_API_VERSION,
    OPENAI_DEPLOYMENT,
    OPENAI_MINI_DEPLOYMENT,
)
from langchain_openai import AzureChatOpenAI
from example_utils.health.services.credentails_manager import CredentialManager

logger = logging.getLogger(__name__)

OPENAI_SCOPE = "https://cognitiveservices.azure.com/.default"


class AzureOpenaiClientManager:
    _client = None

    @classmethod
    def get_client(cls):
        if cls._client is None:
            try:
                credential = CredentialManager.get_credential()
                token_provider = get_bearer_token_provider(credential, OPENAI_SCOPE)

                primary = AzureChatOpenAI(
                    azure_endpoint=AZURE_OPENAI_ENDPOINT,
                    api_version=OPENAI_API_VERSION,
                    azure_deployment=OPENAI_DEPLOYMENT,
                    azure_ad_token_provider=token_provider,    # auto-refresh
                    temperature=0,
                    max_retries=0,                             # fail fast → fallback
                    timeout=10,
                )
                mini = AzureChatOpenAI(
                    azure_endpoint=AZURE_OPENAI_ENDPOINT,
                    api_version=OPENAI_API_VERSION,
                    azure_deployment=OPENAI_MINI_DEPLOYMENT,   # wires the dead env var
                    azure_ad_token_provider=token_provider,
                    temperature=0,
                    max_retries=6,
                )
                cls._client = primary.with_fallbacks(
                    [mini],
                    exceptions_to_handle=(openai.RateLimitError,),
                )
            except ServiceRequestError:
                logger.exception("Service request error connecting to Azure OpenAI")
                raise
            except Exception:
                logger.exception("Failed to connect Azure OpenAI client")
                raise
        return cls._client
```

**Improvements**:

- `azure_ad_token_provider` auto-refreshes via the credential's MSAL cache — no 3600s expiry
- `azure_deployment` (not deprecated `deployment_name`)
- `OPENAI_MINI_DEPLOYMENT` is wired into a fallback chain (was previously dead — see Example 3)
- `exceptions_to_handle=(openai.RateLimitError,)` — schema parse errors no longer mask as fallback events
- `max_retries=0` on primary so fallback fires immediately on 429

---

## Example 2: Chain Construction with `with_structured_output` + Token Tracking

### Current pattern (`example-processor/example_processor/services/langchain.py`)

```python
# example-processor/example_processor/services/langchain.py — current
async def __call__(self, markdown_content, pydantic_object, credential):
    ...
    token = await retry_async(
        credential.get_token,
        func_args=("https://cognitiveservices.azure.com/.default",),
    )
    # Set environment variables for Azure OpenAI (original working approach)
    os.environ["OPENAI_API_TYPE"] = "azure_ad"               # line 96 — ANTI-PATTERN
    os.environ["OPENAI_API_KEY"] = token.token               # line 97 — process-global mutation
    apim_endpoint = (
        f"{AZURE_OPENAI_ENDPOINT}/deployments/{OPENAI_DEPLOYMENT}"
        f"/chat/completions?api-version={OPENAI_API_VERSION}"
    )
    self.model = AzureChatOpenAI(                            # line 99 — re-instantiated per call
        azure_endpoint=apim_endpoint,
        model_kwargs={
            "extra_headers": {
                "x-tenant-id": self.tenant_id,
                "x-document-id": self.document_id,
                "x-transaction-id": self.transaction_id,
                "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY,
            }
        },
    )
    structured_model = self.model.with_structured_output(    # line 111
        pydantic_object, include_raw=True
    )
    self.chain = prompt | structured_model
    result = await self.chain.ainvoke({"markdown_content": markdown_content})
    token_usage = get_token_usage_from_response(result["raw"])    # line 125
    return result["parsed"]
```

**Failure modes**:

1. `os.environ` mutation in async code — thread-unsafe, leaks across concurrent requests. The "original working approach" comment hints this was a workaround.
2. `AzureChatOpenAI` re-instantiated on every `__call__` (line 99) — bypasses connection reuse, reconstructs httpx client per request.
3. `get_token_usage_from_response` reads `response_metadata["token_usage"]` (legacy dict) instead of the modern `usage_metadata` attribute on `AIMessage`.

### Recommended refactor

```python
# example-processor/example_processor/services/langchain.py — refactored
from langchain_core.messages import AIMessage
from example_processor.utils.azure_openai_client_manager import AzureOpenaiClientManager


class ExtractChain:
    def __init__(self, tenant_id, document_id, transaction_id, temperature=0):
        self.tenant_id = tenant_id
        self.document_id = document_id
        self.transaction_id = transaction_id
        # Get singleton client with built-in fallback (token-provider auth, no env mutation)
        self._llm = AzureOpenaiClientManager.get_client()

    async def __call__(self, markdown_content, pydantic_object):
        prompt = PromptTemplate(
            template=Prompt.STAGE_PARSE_PROMPT.value,
            input_variables=["markdown_content"],
            partial_variables={"order": pydantic_object.__name__},
        )

        # Bind per-request APIM headers (creates a new Runnable, doesn't mutate the singleton)
        llm = self._llm.bind(
            extra_headers={
                "x-tenant-id": self.tenant_id,
                "x-document-id": self.document_id,
                "x-transaction-id": self.transaction_id,
                "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY,
            }
        )
        chain = prompt | llm.with_structured_output(pydantic_object, include_raw=True)

        try:
            result = await chain.ainvoke({"markdown_content": markdown_content})
        except openai.ContentFilterFinishReasonError as e:
            raise AzureContentFilterError(
                message="Markdown to JSON conversion failed (Azure content filter)",
                stage=Stage.STAGE_PARSE,
                document_id=self.document_id,
                transaction_id=self.transaction_id,
                tenant_id=self.tenant_id,
                original_error=e,
            ) from e

        if result.get("parsing_error"):
            logger.warning(
                "Schema parse failed: %s",
                result["parsing_error"],
                extra=self._log_extra(),
            )

        # Modern token tracking — usage_metadata on AIMessage (LangChain 0.3+)
        raw: AIMessage = result["raw"]
        usage = raw.usage_metadata or {}
        logger.debug(
            "Token usage — input: %d, output: %d, total: %d",
            usage.get("input_tokens", 0),
            usage.get("output_tokens", 0),
            usage.get("total_tokens", 0),
            extra=self._log_extra(),
        )
        return result["parsed"]

    def _log_extra(self):
        return {
            "documentId": self.document_id,
            "transactionId": self.transaction_id,
            "tenantId": self.tenant_id,
        }
```

**Improvements**:

- No `os.environ` mutation; auth flows through `azure_ad_token_provider` in the singleton
- Singleton model reused across calls; only per-request headers bound via `.bind()`
- Modern `usage_metadata` (returns `{input_tokens, output_tokens, total_tokens}` plus `input_token_details`/`output_token_details` for cache breakdowns)
- `parsing_error` checked explicitly — surfaces schema drift instead of silently returning `None`

---

## Example 3: Wiring the Dead `OPENAI_MINI_DEPLOYMENT` Env Var

### Current pattern (`example-processor/config/env.py`)

```python
# example-processor/config/env.py
OPENAI_DEPLOYMENT = os.getenv("OPENAI_DEPLOYMENT", "")                            # line 29
OPENAI_MINI_DEPLOYMENT = os.getenv("OPENAI_MINI_DEPLOYMENT", "gpt-4.1-mini")      # line 30 — DEAD
```

**Failure mode**: `OPENAI_MINI_DEPLOYMENT` is loaded but never imported by any service module. The chain always uses `OPENAI_DEPLOYMENT`. On 429 quota exhaustion, the call fails hard with no fallback. Operators reading the config see "we have a mini deployment" and assume resilience exists — it doesn't.

### Fix

Two parts:

1. **Import it** in `azure_openai_client_manager.py` (shown in Example 1 above).
2. **Wire it** into `with_fallbacks()` so it actually serves traffic on 429:

```python
# Pattern from Example 1
primary = AzureChatOpenAI(azure_deployment=OPENAI_DEPLOYMENT, max_retries=0, ...)
mini = AzureChatOpenAI(azure_deployment=OPENAI_MINI_DEPLOYMENT, max_retries=6, ...)
llm = primary.with_fallbacks([mini], exceptions_to_handle=(openai.RateLimitError,))
```

If you do not intend to use a fallback model, **remove** `OPENAI_MINI_DEPLOYMENT` from `env.py` to eliminate the false signal. Dead env vars accumulate in deployment configs and confuse on-call engineers.

---

## Example 4: Replacing the Generic `retry_async` with Tenacity

### Current pattern (`example-utils/example_utils/retry_async.py`)

```python
# example-utils/example_utils/retry_async.py
async def retry_async(
    async_callable, func_args=None, func_kwargs=None, max_retries=3, delay_seconds=5
):
    func_args = func_args if func_args is not None else ()
    func_kwargs = func_kwargs if func_kwargs is not None else {}
    for attempt in range(1, max_retries + 1):
        try:
            if iscoroutinefunction(async_callable):
                return await async_callable(*func_args, **func_kwargs)
            return async_callable(*func_args, **func_kwargs)
        except Exception as e:
            log.warning(f"Attempt {attempt} failed: {e}")
            if attempt < max_retries:
                log.info(f"Retrying in {delay_seconds} seconds...")
                await asyncio.sleep(delay_seconds)
            else:
                log.error(f"Max retries {max_retries} reached.")
                raise
```

**Failure modes**:

- `except Exception` — retries every error including `ValueError`, `KeyError`, content filter errors. A bad input retries 3 times with 5s delay before failing — 15s of wasted latency on a deterministic bug.
- Fixed `delay_seconds=5` (no exponential backoff, no jitter) — under 429 storms, all workers retry in lockstep, amplifying the rate-limit pressure.
- No exception filtering — cannot distinguish "transient" from "permanent".

### Recommended refactor — tenacity

```python
# example-utils/example_utils/retry.py
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)
import openai
from azure.core.exceptions import ServiceRequestError

# Transient failures worth retrying
TRANSIENT_EXCEPTIONS = (
    openai.RateLimitError,
    openai.APIConnectionError,
    openai.APITimeoutError,
    ServiceRequestError,
)

retry_llm_call = retry(
    retry=retry_if_exception_type(TRANSIENT_EXCEPTIONS),
    wait=wait_exponential_jitter(initial=2, max=60, jitter=2),  # backoff + jitter
    stop=stop_after_attempt(5),
    reraise=True,
)


@retry_llm_call
async def invoke_chain(chain, inputs):
    return await chain.ainvoke(inputs)
```

**Improvements**:

- `retry_if_exception_type` — only retries known-transient errors; lets schema bugs fail fast
- `wait_exponential_jitter` — prevents lockstep retry storms across workers
- `reraise=True` — preserves the original exception type for upstream handlers (vs tenacity's default `RetryError`)
- Composes cleanly with `with_fallbacks()`: tenacity wraps the call site, `with_fallbacks()` handles primary→mini escalation

---

## Example 5: End-to-End — Init + Chain + Invoke + Cost Logging

```python
# example-processor/example_processor/services/order_extraction.py — illustrative
import logging
from langchain_core.messages import AIMessage
from langchain_core.prompts import PromptTemplate

from config.env import APIM_SUBSCRIPTION_KEY
from example_processor.services.utils.cost import estimate_cost
from example_processor.utils.azure_openai_client_manager import AzureOpenaiClientManager
from example_utils.retry import retry_llm_call

logger = logging.getLogger(__name__)


async def extract_record(markdown: str, schema, tenant_id, document_id, transaction_id):
    """End-to-end: singleton LLM with fallback → bind APIM headers → structured chain → cost log."""

    # 1. Reuse the singleton model+fallback from Example 1
    llm = AzureOpenaiClientManager.get_client().bind(
        extra_headers={
            "x-tenant-id": tenant_id,
            "x-document-id": document_id,
            "x-transaction-id": transaction_id,
            "Ocp-Apim-Subscription-Key": APIM_SUBSCRIPTION_KEY,
        }
    )

    # 2. Structured chain — schema-guaranteed extraction
    prompt = PromptTemplate.from_template(
        "Extract the {schema_name} from this markdown:\n\n{markdown_content}"
    )
    chain = prompt | llm.with_structured_output(schema, include_raw=True, strict=True)

    # 3. Invoke with tenacity-wrapped retry (Example 4)
    @retry_llm_call
    async def _invoke():
        return await chain.ainvoke(
            {"markdown_content": markdown, "schema_name": schema.__name__}
        )

    result = await _invoke()

    # 4. Modern token observability + external cost calc
    raw: AIMessage = result["raw"]
    usage = raw.usage_metadata or {}
    cost_usd = estimate_cost(usage, deployment_model="gpt-4.1")
    logger.info(
        "llm.extract_record",
        extra={
            "documentId": document_id,
            "transactionId": transaction_id,
            "tenantId": tenant_id,
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
            "total_tokens": usage.get("total_tokens", 0),
            "cost_usd": round(cost_usd, 6),
        },
    )

    if result.get("parsing_error"):
        logger.warning("Schema parse failed: %s", result["parsing_error"])
        raise ValueError(f"Could not extract {schema.__name__} from markdown")

    return result["parsed"]
```

**What this composes**:

- Token-provider auth from `AzureOpenaiClientManager` (Example 1) — no 3600s expiry
- Per-request APIM headers via `.bind()` (Example 2) — singleton model not mutated
- `with_structured_output(strict=True)` — Pydantic schema enforced at the API layer
- Tenacity retry for transient errors (Example 4) — composes with `with_fallbacks()` from Example 1
- `usage_metadata` + external cost calc — accurate dollar tracking (vs `get_openai_callback()`'s $0)
- Structured log fields — downstream aggregation by deployment, tenant, document
