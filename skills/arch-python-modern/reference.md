# Modern Python Standards - Reference

## User-Controlled Filename Sanitization

`pathlib`'s `/` operator treats embedded `/` in user-supplied strings as path separators:

```python
Path("/tmp") / "FW: Pricing 4/16/26.html"
# → PosixPath('/tmp/FW: Pricing 4/16/26.html')  — three segments
```

Without sanitization, `aiofiles.open(path, "wb")` raises `FileNotFoundError` because intermediate directories don't exist — and `os.path.join` has the same hazard with `os.sep`.

**Safe idiom** (POC pattern):
```python
safe_name = raw_filename.replace("/", "_").replace("\\", "_")
path = temp_dir / safe_name   # single segment guaranteed
```

**Order matters**: `Path(raw).name` BEFORE replacing `/` silently strips everything up to the last slash (`Path("FW: Pricing 4/16/26.html").name` → `"26.html"`). Replace separators first, then optionally apply `.name` for `..` defense-in-depth.

**Sanitize-at-consumer-boundary**: when a value flows producer → bus → consumer and is used as a filesystem path, sanitize once at the consumer entry point — one place, self-defending against any future producer regression. Verify the value is FS+logs-only before threading the sanitized form downstream (grep all usages; if any reach DB metadata, external APIs, or UI, preserve the raw value alongside).

**Reuse shared helpers**: if a project already has `example_utils.sanitize_filename`, use it rather than adding a local reimplementation — avoids "two sanitizers, subtly different rules."

## Singleton Concurrency Safety

When a class is instantiated via module-level `global _instance` + lazy `_get_*()` accessor (common in async consumer workers — Service Bus, Kafka, Celery), instance attributes for per-call data race under concurrent invocations.

Detection: `grep "global _<classname_lowercase>"` or `_get_<class>()` accessor functions in the file.

Mitigation: parameter-pass per-call values; reserve `self.x` for instance-level concerns (config, long-lived dependencies, connection pools).

```python
# Anti-pattern: per-call data on a singleton
class DocumentProcessor:
    def process(self, message):
        self.current_file = message.filename  # races on concurrent calls
        ...

# Pattern: parameter-pass
class DocumentProcessor:
    def process(self, message):
        safe_name = sanitize(message.filename)
        self._route(safe_name, message)  # safe_name is local
```

Reference: `DocumentProcessor` (client `example-service`).

## Type Hints (Deep Dive)

### Basic Patterns

```python
# Function signatures
def greet(name: str) -> str:
    return f"Hello, {name}"

# Optional/nullable (Python 3.10+)
def find_user(id: int) -> User | None:
    ...

# Collections (Python 3.9+)
def process(items: list[str], mapping: dict[str, int]) -> set[str]:
    ...
```

### Advanced Patterns

```python
from typing import TypeVar, Callable, ParamSpec

T = TypeVar("T")
P = ParamSpec("P")

# Generic functions
def first(items: list[T]) -> T | None:
    return items[0] if items else None

# Callable types
def retry(func: Callable[P, T], *args: P.args, **kwargs: P.kwargs) -> T:
    ...

# TypedDict for structured dicts
from typing import TypedDict

class UserDict(TypedDict):
    name: str
    age: int
    email: str | None
```

### Protocol for Structural Typing

```python
from typing import Protocol

class Readable(Protocol):
    def read(self, n: int = -1) -> str: ...

def process_readable(r: Readable) -> str:
    return r.read()
```

## Dataclasses

### Basic Usage

```python
from dataclasses import dataclass, field

@dataclass
class User:
    name: str
    email: str
    age: int = 0
    tags: list[str] = field(default_factory=list)
```

### Immutable Dataclasses

```python
@dataclass(frozen=True)
class Point:
    x: float
    y: float

    def distance(self, other: "Point") -> float:
        return ((self.x - other.x)**2 + (self.y - other.y)**2)**0.5
```

### Dataclass vs Pydantic

| Use Case | Choice |
|----------|--------|
| Internal data structures | dataclass |
| API validation | Pydantic |
| Configuration | Pydantic |
| Domain entities | dataclass |
| Serialization needed | Pydantic |

## Async Patterns

### Basic Async/Await

```python
import asyncio

async def fetch_data(url: str) -> dict:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            return await response.json()
```

### Concurrent Operations

```python
# Gather multiple operations
async def fetch_all(urls: list[str]) -> list[dict]:
    results = await asyncio.gather(
        *[fetch_data(url) for url in urls],
        return_exceptions=True
    )
    return [r for r in results if not isinstance(r, Exception)]
```

### TaskGroup (Python 3.11+)

```python
async def process_items(items: list[str]) -> list[Result]:
    results = []
    async with asyncio.TaskGroup() as tg:
        for item in items:
            tg.create_task(process_item(item, results))
    return results
```

### Async Context Managers

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def get_connection():
    conn = await create_connection()
    try:
        yield conn
    finally:
        await conn.close()
```

## Path Handling

### pathlib Basics

```python
from pathlib import Path

# Construction
config_dir = Path.home() / ".config" / "myapp"
data_file = Path(__file__).parent / "data" / "config.json"

# Operations
if data_file.exists():
    content = data_file.read_text()
    data_file.write_text(modified_content)

# Iteration
for py_file in Path("src").rglob("*.py"):
    print(py_file.name)
```

### Common Operations

```python
path = Path("/some/path/file.txt")

path.name          # "file.txt"
path.stem          # "file"
path.suffix        # ".txt"
path.parent        # Path("/some/path")
path.parts         # ("/", "some", "path", "file.txt")
path.is_file()     # True/False
path.is_dir()      # True/False
path.resolve()     # Absolute path
path.relative_to() # Relative path
```

## Error Handling

### Specific Exceptions

```python
# Bad
try:
    do_something()
except:  # Catches everything including KeyboardInterrupt
    pass

# Good
try:
    do_something()
except ValueError as e:
    logger.warning(f"Invalid value: {e}")
except FileNotFoundError:
    logger.error("Config file missing")
```

### Custom Exceptions

```python
class DomainError(Exception):
    """Base exception for domain errors."""
    pass

class InvalidOrderError(DomainError):
    """Raised when order validation fails."""
    def __init__(self, order_id: str, reason: str):
        self.order_id = order_id
        self.reason = reason
        super().__init__(f"Order {order_id} invalid: {reason}")
```

### Context Managers

```python
from contextlib import contextmanager

@contextmanager
def transaction(conn):
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

## Docstring Guidelines

### Core Principle

Write meaningful, non-redundant docstrings that add value beyond what's clear from code.

### Do NOT Write Docstrings For:
- `__init__` methods with self-explanatory parameters
- Simple getter/setter methods
- Abstract methods that just repeat type annotations
- Functions where name + type hints make purpose obvious
- Private methods with obvious functionality

### DO Write Docstrings For:
- Module-level descriptions (file purpose and context)
- Complex business logic or algorithms
- Methods with side effects or special behaviors
- Non-obvious return conditions (e.g., returns None on failure)
- Public APIs that other developers use
- Domain services encapsulating business rules

### Format Standards

```python
# GOOD - Meaningful module docstring
"""Authentication utilities with JWT token validation and refresh logic."""

# GOOD - Explains non-obvious behavior
def retry_with_backoff(func, max_attempts=3):
    """Execute function with exponential backoff, returning None on permanent failure."""

# GOOD - Explains complex business logic
def calculate_tax_rate(income, jurisdiction):
    """Apply progressive tax brackets with jurisdiction-specific deductions."""

# BAD - Redundant, restates type signature
def get_user(user_id: int) -> User:
    """Get a user by ID.

    Args:
        user_id: The user ID

    Returns:
        User object
    """

# GOOD - No docstring needed, purpose is clear
def get_user(user_id: int) -> User:
    return database.users.find_by_id(user_id)
```

### Guidelines
- Prefer single-line descriptions when purpose is clear
- Avoid Args/Returns sections that repeat type annotations
- Focus on "why" and "what" rather than "how"
- Use imperative mood ("Validate input" not "Validates input")
- Every word should add value

## Resource Leaks in Client Configuration

### Problem

Passing custom HTTP clients to third-party libraries without proper lifecycle management causes resource leaks.

### Bad Pattern

```python
import httpx
from openai import AsyncOpenAI

# ❌ WRONG - Creates orphaned httpx.AsyncClient
def get_openai_client(api_key: str) -> AsyncOpenAI:
    limits = httpx.Limits(max_keepalive_connections=20)
    return AsyncOpenAI(
        api_key=api_key,
        http_client=httpx.AsyncClient(limits=limits)  # Resource leak!
    )
# The custom AsyncClient is never closed - leaks connections, file descriptors, memory
```

### Why This Leaks

- OpenAI's `AsyncOpenAI` manages its own httpx client lifecycle internally
- Passing a custom `http_client` creates ambiguous ownership
- The custom client won't be closed when OpenAI client is closed
- Results in leaked connections, file descriptors, and memory on every startup/shutdown cycle

### Correct Approach 1: Let Library Manage Client (Preferred)

```python
# ✅ CORRECT - Use library's default client (with defaults documented)
def get_openai_client(api_key: str) -> AsyncOpenAI:
    """Create OpenAI client with httpx defaults.

    Connection pool defaults (httpx implicit):
        - max_keepalive_connections: 20
        - max_connections: 100
        - keepalive_expiry: 5.0s
    """
    return AsyncOpenAI(api_key=api_key)
```

### Correct Approach 2: Explicit Lifecycle Management

Only use this if custom configuration is truly needed:

```python
# ✅ CORRECT - Manage client lifecycle explicitly
class ClientManager:
    def __init__(self, api_key: str):
        limits = httpx.Limits(max_keepalive_connections=20)
        self.http_client = httpx.AsyncClient(limits=limits)
        self.openai_client = AsyncOpenAI(
            api_key=api_key,
            http_client=self.http_client
        )

    async def close(self):
        await self.openai_client.close()
        await self.http_client.aclose()  # Explicit cleanup

# FastAPI lifespan integration
@asynccontextmanager
async def lifespan(app: FastAPI):
    manager = ClientManager(api_key)
    yield
    await manager.close()  # Guaranteed cleanup
```

### Detection Rule

When passing clients/resources to third-party libraries, verify:
1. Who owns the resource (caller vs library)?
2. Who is responsible for cleanup?
3. Is cleanup guaranteed in all code paths (including exceptions)?

### Prevention

Prefer library defaults over custom configuration. Document defaults instead of overriding them unless there's a measured performance problem.

**See also:** [`performance-engineering` > Startup Warmup](../performance-engineering/reference.md#startup-warmup-for-http-connection-pools) for connection pool warmup patterns.

---

## Experiment Script Isolation

Keep AI/ML experiment dependencies out of the production Docker image using an optional dependency group:

```toml
[project.optional-dependencies]
experiments = [
    "openai>=1.0.0",
    "numpy>=1.26.0",
]

[tool.mypy]
exclude = ["^experiments/"]      # mypy skips experiment scripts

[tool.pytest.ini_options]
norecursedirs = ["experiments"]  # pytest skips the directory
```

Install experiment deps locally without affecting the production image:

```bash
uv pip install -e ".[experiments]"
```

Anchor experiment file paths to `Path(__file__).parent` — not relative `Path("experiments/results")` — so scripts work regardless of the working directory the runner uses.

---

## Tooling Configuration

### pyproject.toml

```toml
[project]
name = "myproject"
version = "0.1.0"
requires-python = ">=3.10"

[tool.ruff]
target-version = "py310"
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W", "UP"]

[tool.mypy]
python_version = "3.10"
strict = true
warn_return_any = true

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "-v --cov=src"
```

### Common Commands

```bash
# Package management
uv add package
uv add --dev pytest mypy ruff

# Linting and formatting
ruff check .
ruff format .

# Type checking
mypy src/

# Testing
pytest
pytest --cov=src --cov-report=html
```

---

## Selective Git Tracking in Gitignored Directories

Track specific files in otherwise-ignored directories using negation patterns + force add.

```gitignore
# Ignore directory
research/data/

# Negate specific file (required but not sufficient alone)
!research/data/production_questions.json
```

```bash
# Force add despite gitignore (both steps required)
git add -f research/data/production_questions.json

# After pre-commit formatting modifies tracked files
git add -u  # Re-stage modified tracked files
```

**Why both needed**: Negation tells git "this file is not ignored", but force-add is required to override the ignored parent directory.

**When to use**: Tracking config examples in ignored dirs, committing test fixtures while ignoring outputs, including specific build artifacts.

---

## Pydantic Dual-Purpose Models

When one Pydantic model serves both storage (`.model_dump()` → GCS/DB) and API responses, adding `serialization_alias` to fix a field name changes the storage output and breaks downstream readers.

**Pattern**: create a thin response model that remaps fields without touching the storage model.

```python
class AssistantConfig(BaseModel):
    record_id: str          # serialized as-is to GCS JSON
    ...

class AssistantResponse(BaseModel):
    id: str                    # remapped for API consumers
    ...

    @classmethod
    def from_config(cls, cfg: AssistantConfig) -> "AssistantResponse":
        return cls(id=cfg.record_id, ...)
```

Adding `serialization_alias="id"` to `AssistantConfig.record_id` would rename the key in `.model_dump()`, silently corrupting GCS payloads.

## Pydantic Validators

Three levels, each with a distinct trigger:

| Decorator | Timing | Use Case |
|-----------|--------|----------|
| `@property` | Lazy (on access) | Derived/computed values |
| `@field_validator` | Per-field (during parse) | Single-field constraints |
| `@model_validator` | After parse | Cross-field security controls |

Use `@model_validator(mode="after")` for invariants that span multiple fields (e.g., require `auth_database_url` in production, enforce mutual-exclusion between settings).

## Module Dispatch Patterns

### MODE constant + render/write/main contract

Define a `MODE` string on every report/output module and implement a uniform triple:

```python
# report_modules/summary.py
MODE = "summary"

def render(data: ReportData) -> str:
    """Return the rendered report as a string."""
    ...

def write(data: ReportData, out_dir: Path, *, stem: str = "summary") -> Path:
    """Write rendered output to out_dir; return the written path."""
    path = out_dir / f"{stem}.md"
    path.write_text(render(data))
    return path

def main() -> None:
    """CLI entry point — parses args and calls write()."""
    ...
```

The orchestrator dispatches any module through the same interface, with zero per-module branching:

```python
for module in active_modules:
    module.write(data, out_dir)
```

### Registry-driven orchestrator

Replace N hardcoded entry points with a central registry:

```python
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

@dataclass
class ModuleSpec:
    fn: Callable
    mode: str
    defaults: dict = field(default_factory=dict)

REGISTRY: dict[str, ModuleSpec] = {
    "summary":   ModuleSpec(fn=summary.write,   mode="summary"),
    "timeline":  ModuleSpec(fn=timeline.write,  mode="timeline"),
    "heatmap":   ModuleSpec(fn=heatmap.write,   mode="heatmap"),
}

def run(selector: str, data: ReportData, out_dir: Path) -> Path:
    spec = REGISTRY[selector]
    return spec.fn(data, out_dir, **spec.defaults)
```

Adding a new module: one entry in `REGISTRY`. Removing: delete the entry. No `if/elif` chains, no import sprawl.

## Config-Resolved Roots

`Path(__file__).parents[N]` resolves the repo root relative to the current source file. This works at author time but breaks silently when:

- The file is moved during a refactor
- The package is installed as a wheel (the source tree no longer exists)
- The module is run from an unexpected working directory

**Pattern**: load a config file (`.toml`, `.env`, `pyproject.toml`) to resolve roots explicitly.

```python
# anti-pattern — fragile
REPO_ROOT = Path(__file__).parents[2]
VAULT_ROOT = REPO_ROOT / "vault"

# pattern — portable
import tomllib
with open("pyproject.toml", "rb") as f:
    cfg = tomllib.load(f)
VAULT_ROOT = Path(cfg["tool"]["myapp"]["vault_root"]).expanduser()
```

If a config file isn't available, document the root assumption explicitly and resolve it once at the top of the entry-point script (not deep in library code).

## LRU Cache with model_copy() for Customization

Cache expensive Pydantic object construction without parameters, customize per-request with `model_copy()`.

```python
from functools import lru_cache

@lru_cache(maxsize=1)
def get_demo_result() -> ResearchResult:
    """No parameters = single cache key = effective caching."""
    return ResearchResult(
        query="Default query",
        plan=...,
        report=...
    )

# Customize after caching
result = get_demo_result().model_copy(update={"query": user_query})
```

**Anti-pattern**: Including customizable parameters in the cache key causes the cache to always miss.

**Performance**: ~10x faster (2ms -> 0.6ms) for Pydantic object reuse.

**Testing cache effectiveness**:
```python
def test__caches_result():
    first = get_demo_result()
    second = get_demo_result()
    assert first is second  # Same object identity
```
