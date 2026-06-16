---
name: arch-python-modern
description: Modern Python 3.10+ development standards including type hints, async patterns, pathlib, dataclasses, and recommended tooling (uv, Ruff, pytest). Use for Python code review, new feature implementation, refactoring legacy code, or making architecture decisions about Python projects.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/arch-python-modern
updated: 2026-06-03
---

# Modern Python Standards

Development practices for Python 3.10+ focusing on type safety, modern idioms, and efficient tooling.

## Recommended Stack

| Category | Tool |
|----------|------|
| Package Management | uv (preferred) or Poetry |
| Linting/Formatting | Ruff |
| Type Checking | mypy (strict mode) |
| Testing | pytest with coverage |
| Web APIs | FastAPI |
| Data Processing | Polars or Pandas |

## Key Patterns

### Type Hints
- Public functions use type hints — enables static analysis and IDE tooling
- `X | None` for nullable (3.10+), `list[X]` over `List[X]` (3.9+)
- `TypeVar` for generics, `Protocol` for structural typing

### Async
- Use `asyncio` with `TaskGroup` for structured concurrency (3.11+)
- Blocking calls in async context stall the event loop — use `asyncio.gather()` for concurrent I/O

### Path Handling
- `pathlib.Path` over `os.path`; use `.read_text()`, `.write_text()`
- Sanitize user-controlled filenames: `replace("/", "_").replace("\\", "_")` before `Path(name).name`. See `reference.md → User-Controlled Filename Sanitization`.
- Resolve vault/repo roots from a config file, not `Path(__file__).parents[N]` — relocation silently breaks `__file__`-relative walks. See `reference.md → Config-Resolved Roots`.

### Error Handling
- Specific exceptions over bare `except:` — bare form catches SystemExit and KeyboardInterrupt
- Context managers for resources; logging with structlog
- `logging.error("msg", exc_info=e)` — preserves traceback; not f-string interpolation

### Pydantic Settings Validation

`@property` (lazy) → `@field_validator` (per-field) → `@model_validator` (cross-field, after parse). Use `@model_validator` for cross-field security controls. See `reference.md → Pydantic Validators`.

### Pydantic Dual-Purpose Models

Storage + API response in one model: use a thin response model, not `serialization_alias` — alias changes affect GCS/DB output. See `reference.md → Pydantic Dual-Purpose Models`.

### Pydantic Value Objects
Compare with `str()` on both sides: `str(a) != str(b)` — prevents silent type-mismatch failures.

### StrEnum for Status Fields
Use `StrEnum` for status fields. ORM defaults: `default=WidgetStatus.ACTIVE`, not `default="active"` (bare strings go out of sync).

### Computed Fields
Use `@computed_field @property` — included in `.model_dump()` and JSON schema. Avoid `__init__` assignment (bypasses Pydantic validation lifecycle).

### Module Dispatch

- Per-module `MODE` constant + uniform `render()` / `write()` / `main()` triple lets one orchestrator dispatch heterogeneous modules with no per-module branching.
- Registry-driven orchestrator: `dict` mapping selector → `(callable, mode, defaults)` — adding a module is a one-line change. See `reference.md → Module Dispatch Patterns`.

## Experiment Script Isolation

`[project.optional-dependencies]` groups keep AI/ML deps out of the production image. Install via `uv pip install -e ".[experiments]"`; pair with mypy `exclude` + pytest `norecursedirs`. See `reference.md → Experiment Script Isolation`.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| `os.path.join()` | `Path() / "file"` |
| `%` formatting | f-strings |
| `pip install` | `uv add` |
| `flake8` | `Ruff` |
| `List[str]` | `list[str]` |
| `Optional[X]` | `X \| None` |
| `populate_by_name=True` on request models | Keep `False` — widens API input surface by accepting both alias and field name |
| Mutable default args | `field(default_factory=list)` |
| `time.time()` for elapsed | `time.perf_counter()` |
| Custom `http_client=` without lifecycle | Let library manage client |
| `default="active"` (bare string) | `default=WidgetStatus.ACTIVE` (StrEnum) |
| `except Exception as err: logging.exception("msg")` | `except Exception: logging.exception("msg")` — `err` unused (ruff F841); exception captured from call stack |
| `Path(__file__).parents[N]` for repo root | Resolve root from config file — `__file__`-relative walks break on relocation |

See `reference.md` for: type hints, dataclasses, async patterns, path handling, error handling, docstrings, resource leaks, tooling config, git tracking in ignored dirs, LRU cache with model_copy(), config-resolved roots, module dispatch patterns.

See `examples.md` for: project structure, type-safe config, async HTTP client, repository pattern, modern testing, FastAPI endpoints, structured logging, Django+OpenCV pipeline.
