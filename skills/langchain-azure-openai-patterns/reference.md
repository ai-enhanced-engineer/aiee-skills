# LangChain + Azure OpenAI Patterns Reference

Detailed reference for `langchain-openai` ≥0.3 against Azure OpenAI. Companion to `SKILL.md`.

---

## 1. `AzureChatOpenAI` Parameter Reference

| Parameter | Notes |
|---|---|
| `azure_deployment` | Deployment name. Preferred over deprecated `deployment_name`. Drive from `OPENAI_DEPLOYMENT` env var. |
| `api_version` | E.g. `"2025-04-01-preview"`. Drive from `OPENAI_API_VERSION`. Azure retires old versions periodically. |
| `azure_endpoint` | Base resource URL. Reads `AZURE_OPENAI_ENDPOINT` env var if unset. For APIM, may need full deployment URL. |
| `azure_ad_token_provider` | Callable returning a token. **Preferred for production** — auto-refreshes. |
| `azure_ad_token` | Static token string. **Avoid** — expires after 3600s with no refresh. |
| `openai_api_key` | Key-based auth. Reads `AZURE_OPENAI_API_KEY`. Avoid for production; prefer managed identity. |
| `temperature` | Default `0` for deterministic structured extraction. |
| `max_tokens` | `None` lets the model decide. Set explicitly for cost control. |
| `max_retries` | Default `2`. Set to `0` on primary when using `with_fallbacks()` — otherwise the fallback only triggers after `max_retries` failed primary attempts. |
| `timeout` | `request_timeout=10` to prevent hanging before fallback fires. |
| `model_kwargs` | `model_kwargs={"extra_headers": {...}}` for APIM subscription keys, correlation IDs. |
| `stream_usage` | Set `True` to receive `usage_metadata` from `astream`. |

Env vars `AzureChatOpenAI` reads automatically: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `OPENAI_API_VERSION`.

---

## 2. Token-Provider Auth

### Why static tokens fail

A common anti-pattern fetches a token at singleton init and stores it as a string:

```python
# ANTI-PATTERN — token stored statically
credential = DefaultAzureCredential()
token = credential.get_token("https://cognitiveservices.azure.com/.default")
client = AzureChatOpenAI(openai_api_key=token.token, ...)
```

Azure AD tokens have a 3600s TTL. Long-running processes (queue consumers, batch workers, daemons) silently fail ~1 hour after first call with `401 Unauthorized` from the OpenAI endpoint. Cold-start workers paper over the issue locally but production reveals it.

### Correct pattern — `azure_ad_token_provider`

```python
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from langchain_openai import AzureChatOpenAI

token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default",
)

llm = AzureChatOpenAI(
    azure_deployment=settings.OPENAI_DEPLOYMENT,
    api_version=settings.OPENAI_API_VERSION,
    azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=token_provider,
    temperature=0,
    timeout=10,
)
```

`get_bearer_token_provider` returns a closure that calls `credential.get_token(scope)` lazily on each request. The credential's MSAL cache short-circuits 99% of calls (returns cached token if >5 min remaining); refresh happens automatically on near-expiry. No env mutation, no re-instantiation.

For credential lifecycle (singleton, `ManagedIdentityCredential` in production, Workload Identity), see `azure-identity-m2m-auth`.

---

## 3. `with_structured_output`

### Signature

```python
model.with_structured_output(
    schema: PydanticModel | TypedDict | dict,
    *,
    method: Literal["function_calling", "json_mode", "json_schema"] = "json_schema",
    include_raw: bool = False,
    strict: bool | None = None,
)
```

### Method tradeoffs

| Method | Mechanism | Use when |
|---|---|---|
| `json_schema` (default) | OpenAI Structured Outputs API — guaranteed schema match | gpt-4o, gpt-4.1 family. Most reliable. |
| `function_calling` | Tool-calling API; model invokes a tool with JSON args | Older models (gpt-3.5-turbo). Supports `strict`. |
| `json_mode` | Raw JSON mode; schema instructions go in the prompt | Last resort. No structural guarantee from API. |

`strict=True` (with `json_schema` or `function_calling`) validates your schema against OpenAI's supported constraints at chain-build time and guarantees the model outputs match exactly. Recommended for production extraction.

### `include_raw=True` return shape

```python
{
    "raw": AIMessage,           # full response, usage_metadata accessible
    "parsed": PydanticInstance, # or None if parsing failed
    "parsing_error": BaseException | None,
}
```

Use when you need both the typed object and metadata (token counts, finish reason). Without `include_raw`, the chain returns just the parsed Pydantic instance.

### Error handling

```python
result = await chain.ainvoke({"input": text})
if result["parsing_error"]:
    logger.warning("Schema parse failed: %s", result["parsing_error"])
    raise SchemaExtractionError(...)
parsed: MyModel = result["parsed"]
```

### Known issues

- Pre-`langchain-openai` 0.2.3 leaked `include_raw` into the OpenAI API call. Pin ≥0.2.3.
- Streaming + `with_structured_output` returns partial JSON strings, not partial Pydantic objects. Use `astream_events` for richer streaming.
- Streaming `usage_metadata` requires `stream_usage=True` on the model.

---

## 4. Retry & Fallback Strategy

### `RunnableWithFallbacks` — chain-topology switching

```python
import openai
from langchain_openai import AzureChatOpenAI

primary = AzureChatOpenAI(
    azure_deployment=settings.OPENAI_DEPLOYMENT,        # e.g. gpt-4.1
    api_version=settings.OPENAI_API_VERSION,
    azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=token_provider,
    temperature=0,
    max_retries=0,        # CRITICAL — fail fast so fallback triggers immediately
    timeout=10,
)

mini_fallback = AzureChatOpenAI(
    azure_deployment=settings.OPENAI_MINI_DEPLOYMENT,   # e.g. gpt-4.1-mini
    api_version=settings.OPENAI_API_VERSION,
    azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=token_provider,
    temperature=0,
    max_retries=6,        # last resort: backoff via underlying openai client
)

llm = primary.with_fallbacks(
    [mini_fallback],
    exceptions_to_handle=(openai.RateLimitError,),
)

chain = prompt | llm.with_structured_output(Order, include_raw=True)
```

**Rules**:

- `exceptions_to_handle` filters which exceptions trigger fallback. Without it, ANY exception (including Pydantic schema errors) cascades, masking bugs.
- Set `max_retries=0` on primary. LangChain otherwise retries `max_retries` times before the fallback sees the error.
- Last fallback should retry with backoff (the openai client handles this internally when `max_retries ≥ 3`).
- This is **sequential escalation** (primary fails → mini takes over for that call), not round-robin load balancing.

**LangChain 1.0 compatibility note**: GitHub issue #33129 reports `RunnableWithFallbacks` failures with certain middleware in 1.0. Pin `langchain-core <1.0` or test ≥1.0.1 if affected.

### Tenacity — call-site retry with jitter

```python
from tenacity import (
    retry, retry_if_exception_type,
    stop_after_attempt, wait_exponential,
)
import openai

@retry(
    retry=retry_if_exception_type(openai.RateLimitError),
    wait=wait_exponential(multiplier=1, min=2, max=60),
    stop=stop_after_attempt(5),
    reraise=True,
)
async def invoke_with_retry(chain, inputs):
    return await chain.ainvoke(inputs)
```

Use tenacity when you need fine-grained jitter or per-call observability. Use `with_fallbacks()` when deployment switching belongs in the chain topology. They compose: tenacity around a `with_fallbacks()` chain gives both primary→mini escalation AND retry-after-both-fail.

---

## 5. Token & Cost Observability

### Modern path — `usage_metadata` on `AIMessage`

```python
result = await chain.ainvoke(inputs)
raw: AIMessage = result["raw"]
usage = raw.usage_metadata
# {
#   "input_tokens": 1024,
#   "output_tokens": 312,
#   "total_tokens": 1336,
#   "input_token_details": {...},   # cache_read, audio breakdowns
#   "output_token_details": {...},  # reasoning tokens
# }
```

`usage_metadata` is the structured, version-stable attribute on `AIMessage` (LangChain 0.3+). Prefer it over `response_metadata["token_usage"]` (raw OpenAI dict, less stable).

### Why `get_openai_callback()` is broken on Azure

```python
# DOES NOT WORK CORRECTLY ON AZURE
from langchain_community.callbacks.manager import get_openai_callback

with get_openai_callback() as cb:
    chain.invoke(input)
print(cb.total_cost)    # often $0
```

Issues (per LangChain GitHub):

- Cost calculation looks up model name in an OpenAI pricing table. Azure returns the **deployment name** (e.g. `prod-gpt4`), not the model name. Lookup misses → $0 cost reported.
- Returns 0 for all metrics on streaming calls (#30390).
- Does not track `AzureOpenAIEmbeddings` token usage (#24324).
- Sync-only context manager; `await` calls bypass it.

### Cost calculation pattern

```python
# Drive prices from config — they change
PRICE_PER_1K = {
    "gpt-4.1": {"input": 0.005, "output": 0.015},
    "gpt-4.1-mini": {"input": 0.00015, "output": 0.0006},
}

def estimate_cost(usage: dict, deployment_model: str) -> float:
    p = PRICE_PER_1K[deployment_model]
    return (
        usage["input_tokens"] * p["input"] / 1000
        + usage["output_tokens"] * p["output"] / 1000
    )
```

Azure does not expose per-call cost. Compute externally and emit as a structured log field for downstream aggregation.

### Streaming token counts

Set `stream_usage=True` on `AzureChatOpenAI` to receive a final chunk with `usage_metadata` after `astream` completes. Without it, streaming returns 0 tokens.

---

## 6. Streaming and Async Invocation

### Rule: `await chain.ainvoke(...)` in `async def`

Sync `.invoke()` inside `async def` blocks the event loop, halting all concurrent tasks in the same process. Always use `ainvoke` / `astream` / `abatch` in async contexts.

### `ainvoke` — single async call

```python
result = await chain.ainvoke({"markdown_content": markdown})
# dict if include_raw=True, PydanticModel otherwise
```

### `astream` — chunked streaming

```python
async def stream_response(chain, inputs):
    async for chunk in chain.astream(inputs):
        yield chunk.content   # partial text

# FastAPI SSE
from fastapi.responses import StreamingResponse
return StreamingResponse(stream_response(chain, inputs), media_type="text/event-stream")
```

`astream` with `with_structured_output` yields partial JSON strings, not partial Pydantic instances. Use `astream_events` (LangChain 0.3+) for richer streaming control with intermediate parse states.

### `abatch` — parallel async

```python
results = await chain.abatch(
    [{"markdown_content": md} for md in docs],
    config={"max_concurrency": 5},   # respect TPM limits
)
```

`max_concurrency` is essential — without it, all calls fire simultaneously and trip Azure's per-minute token limits.

---

## 7. Anti-Patterns Deep Dive

| Anti-pattern | Failure mode | Fix |
|---|---|---|
| `openai_api_key=token.token` (static) | `401 Unauthorized` ~3600s after first call; long-running services hang | `azure_ad_token_provider=get_bearer_token_provider(cred, scope)` |
| `os.environ["OPENAI_API_KEY"] = token.token` in async path | Thread-unsafe; mutates global state for all concurrent requests | Pass `azure_ad_token_provider` as constructor arg |
| Hardcoded `azure_deployment="gpt-4.1"` | Breaks env promotion; staging and prod diverge | `azure_deployment=settings.OPENAI_DEPLOYMENT` from env |
| Hardcoded `api_version="2024-02-01"` | Azure retires versions; service breaks on retirement date | Drive from `OPENAI_API_VERSION` env var |
| Regex / string-parsing of LLM output | Fails silently when model varies output format | `with_structured_output(Model, method="json_schema", strict=True)` |
| Sync `.invoke()` inside `async def` | Event loop blocks; throughput collapses to ~1 req/s | `await chain.ainvoke(...)` |
| Per-call `AzureChatOpenAI` instantiation | Reconstructs httpx client per request; bypasses connection pool | Instantiate once at module/singleton level; reuse across calls |
| `with_fallbacks([mini])` (no exceptions filter) | Schema parse errors trigger fallback, masking bugs | `exceptions_to_handle=(openai.RateLimitError,)` |
| `with_fallbacks` + `max_retries=2` on primary | Fallback only fires after ~6s of retries; users see latency cliff | `max_retries=0` on primary |
| `OPENAI_MINI_DEPLOYMENT` defined but never wired | False sense of resilience; no fallback in practice | Wire into `with_fallbacks()` or remove the env var |
| `get_openai_callback()` for Azure cost | Reports `$0`; cost dashboards mislead | `result["raw"].usage_metadata` + external cost calc |
| Streaming without `stream_usage=True` | Token counts return 0; cost tracking silently breaks | `AzureChatOpenAI(..., stream_usage=True)` |
| `abatch` without `max_concurrency` | Trips per-minute TPM limits, cascading 429s | `config={"max_concurrency": 5}` |

---

## References

- [AzureChatOpenAI integration — docs.langchain.com](https://docs.langchain.com/oss/python/integrations/chat/azure_chat_openai)
- [`with_structured_output` — reference.langchain.com](https://reference.langchain.com/python/langchain-openai/chat_models/azure/AzureChatOpenAI/with_structured_output)
- [Managed Identity for Azure OpenAI — Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/managed-identity)
- [LangChain load balancing with fallbacks — Clemens Siebler, 2025](https://clemenssiebler.com/posts/azure_openai_load_balancing_langchain_with_fallbacks/)
- [`get_openai_callback` doesn't return Azure usage (#24324)](https://github.com/langchain-ai/langchain/issues/24324)
- [`get_openai_callback` streaming returns 0 (#30390)](https://github.com/langchain-ai/langchain/issues/30390)
- [`RunnableWithFallbacks` + middleware in LC 1.0 (#33129)](https://github.com/langchain-ai/langchain/issues/33129)
- Foundation skills: `llm-agentic-frameworks`, `azure-identity-m2m-auth`
