---
name: langchain-azure-openai-patterns
description: Azure OpenAI + LangChain production patterns. AzureChatOpenAI config with token-provider auth, with_structured_output + Pydantic v2, RunnableWithFallbacks for 429 retry, modern token observability via usage_metadata, async ainvoke. Use when building LangChain chains/agents that call Azure-hosted OpenAI deployments. See `llm-agentic-frameworks` for framework selection and `azure-identity-m2m-auth` for credential lifecycle.
updated: 2026-04-27
---

# LangChain + Azure OpenAI Patterns

Production patterns for `langchain-openai` ≥0.3 against Azure OpenAI deployments. Covers the wiring that trips up teams: token-provider auth (vs static tokens that expire after 3600s), `with_structured_output` method tradeoffs, deployment fallback on 429, and the `usage_metadata` path that actually works on Azure.

## When to use

- Wiring `AzureChatOpenAI` for a Python service (chains, agents, async endpoints)
- Migrating from static `openai_api_key=token.token` to managed-identity token providers
- Adding 429/quota fallbacks across primary + mini deployments
- Extracting structured Pydantic objects with schema guarantees
- Tracking token usage / cost per call (`get_openai_callback` is broken on Azure)

For framework choice see `llm-agentic-frameworks`. For `DefaultAzureCredential` and singleton credential patterns see `azure-identity-m2m-auth`.

## Core patterns

| Pattern | One-line rule |
|---|---|
| Token-provider auth | `azure_ad_token_provider=get_bearer_token_provider(cred, scope)` — auto-refreshes; never pass static `token.token` as `openai_api_key` |
| `AzureChatOpenAI` config | Drive `azure_deployment`, `api_version`, `azure_endpoint` from env vars; `temperature=0` for structured extraction |
| `with_structured_output` | `model.with_structured_output(MyModel, method="json_schema", include_raw=True)` — returns `{raw, parsed, parsing_error}` |
| `RunnableWithFallbacks` | `primary.with_fallbacks([mini], exceptions_to_handle=(openai.RateLimitError,))`; set `max_retries=0` on primary so fallback fires immediately |
| `usage_metadata` | `result["raw"].usage_metadata` → `{input_tokens, output_tokens, total_tokens}`; preferred over `response_metadata["token_usage"]` |
| Async invocation | `ainvoke`/`astream`/`abatch` preserve the event loop; sync `.invoke()` blocks it |
| Env-driven deployments | `OPENAI_DEPLOYMENT`, `OPENAI_MINI_DEPLOYMENT`, `OPENAI_API_VERSION` — never hardcode |
| Retry with tenacity | `@retry(retry=retry_if_exception_type(RateLimitError), wait=wait_exponential(min=2, max=60), stop=stop_after_attempt(5))` for call-site retry |
| Streaming token counts | Set `stream_usage=True` on `AzureChatOpenAI` to get `usage_metadata` from `astream` |
| `extra_headers` (APIM) | Pass via `model_kwargs={"extra_headers": {...}}` for subscription keys / correlation IDs |

## Quick reference

```python
from azure.identity import DefaultAzureCredential, get_bearer_token_provider
from langchain_core.prompts import PromptTemplate
from langchain_openai import AzureChatOpenAI
from pydantic import BaseModel
import openai

token_provider = get_bearer_token_provider(
    DefaultAzureCredential(),
    "https://cognitiveservices.azure.com/.default",
)
primary = AzureChatOpenAI(
    azure_deployment=settings.OPENAI_DEPLOYMENT,
    api_version=settings.OPENAI_API_VERSION,
    azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
    azure_ad_token_provider=token_provider,
    temperature=0, max_retries=0, timeout=10,
)
mini = primary.bind(azure_deployment=settings.OPENAI_MINI_DEPLOYMENT, max_retries=6)
llm = primary.with_fallbacks([mini], exceptions_to_handle=(openai.RateLimitError,))

class Order(BaseModel):
    customer: str
    total: float

prompt = PromptTemplate.from_template("Extract structured data from: {markdown}")
chain = prompt | llm.with_structured_output(Order, include_raw=True)

result = await chain.ainvoke({"markdown": md})
parsed: Order = result["parsed"]
usage = result["raw"].usage_metadata    # {input_tokens, output_tokens, total_tokens}
```

## Anti-patterns (top 6)

1. **Static `openai_api_key=token.token`** → `azure_ad_token_provider=get_bearer_token_provider(...)`; static tokens expire after 3600s
2. **`os.environ["OPENAI_API_KEY"] = token.token` mutation in async code** → pass `azure_ad_token_provider` as a constructor arg; env mutation is thread-unsafe and process-global
3. **Regex / string-parsing of LLM output** → `model.with_structured_output(PydanticModel, method="json_schema", strict=True)`
4. **Sync `.invoke()` inside `async def`** → `await chain.ainvoke(...)`; sync calls block the event loop
5. **`with_fallbacks([mini])` without `exceptions_to_handle`** → ANY exception triggers fallback, masking schema bugs; pass `exceptions_to_handle=(openai.RateLimitError,)`
6. **`get_openai_callback()` for Azure cost** → reports $0 (deployment names don't map to OpenAI pricing); use `result["raw"].usage_metadata` + external cost calc

## See also

- `llm-agentic-frameworks` — framework selection, LCEL, LangGraph, LangSmith
- `azure-identity-m2m-auth` — `DefaultAzureCredential`, scope strings, singleton credential

See `reference.md` for the full pattern catalogue and `examples.md` for project-grounded refactors.
