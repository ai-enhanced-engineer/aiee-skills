---
name: ruff-python-quality
description: Ruff 0.6+ linter and formatter patterns for Python projects — comprehensive rule selection (40 categories E/F/I/B/UP/SIM/S/N/PL/...), per-file-ignores for tests and __init__.py, ruff format as Black replacement (~10× faster, 99.9% compatible), pre-commit + CI integration. Use for code quality automation, migrating from flake8/black, or tuning ruff.toml. See `arch-python-modern` for broader Python standards.
updated: 2026-04-27
---

# Ruff Python Quality Patterns

Production patterns for Ruff as the single Python linter + formatter. This skill covers the parts that change across projects: which rule families to enable, which to scope per-file, how to coexist with `ruff format` (Black replacement), and how to wire pre-commit + CI.

For modern Python idioms broadly (uv, mypy, type hints), see `arch-python-modern`. This skill is the Ruff-specific deepening.

## When to use

- Configuring `ruff.toml` / `pyproject.toml` for a new or existing service
- Migrating from `flake8` + `black` + `isort` to a single Ruff binary
- Tuning rule selection, per-file-ignores, or Pylint complexity thresholds
- Setting up pre-commit hooks or GitHub Actions inline annotations
- Debugging formatter/linter conflicts (`COM812`, `ISC001`)

## Core patterns

| Pattern | One-line rule |
|---|---|
| Rule prefixes | `E`/`W` pycodestyle, `F` pyflakes, `I` isort, `B` bugbear, `UP` pyupgrade, `SIM` simplify, `S` bandit, `N` naming, `PL` pylint, `RUF` ruff-native |
| Default vs select | Default = `E`+`F`; everything else needs explicit `select` or `extend-select` |
| Per-file-ignores | Glob → list of codes: `"**/tests/**" = ["S101","ARG","FBT"]`, `"__init__.py" = ["F401"]` |
| Format vs Black | `ruff format` is ~10× faster, >99.9% Black-compatible; drops Black entirely |
| Formatter conflict ignores | `COM812`/`ISC001` conflict with `ruff format`; both rules must be ignored when the formatter is active |
| `target-version` | Set explicitly (e.g., `"py311"`) — drives `UP` rewrites and syntax assumptions |
| `# noqa` discipline | Scoped suppression: `# noqa: E501` limits scope; bare `# noqa` silently masks all future violations on the line |
| Pylint tuning | Service code needs higher thresholds than defaults: `max-args=10`, `max-branches=15`, `max-statements=60` |

## Quick reference

```toml
# ruff.toml — sensible defaults
target-version = "py311"
line-length = 88
fix = true
unsafe-fixes = false

[lint]
select = ["E","W","F","I","B","UP","SIM","S","N","PL","RUF","C4","PTH","TCH"]
ignore = ["E501","COM812","ISC001"]   # length handled by formatter; conflicts with format

[lint.per-file-ignores]
"**/tests/**" = ["S101","ARG","FBT","SLF001"]
"__init__.py" = ["F401"]
"scripts/**"  = ["T201","S101"]

[lint.pylint]
max-args = 10
max-branches = 15
max-statements = 60

[format]
quote-style = "double"
docstring-code-format = true
```

## Anti-patterns (top 4)

1. **Blanket-ignoring a family** (`ignore = ["S"]`) — masks all current and future security violations. Scope to per-file-ignores instead.
2. **Mixing Black + Ruff formatter** — two tools fight over trailing commas and string concat (`COM812`/`ISC001`). Replace Black with `ruff format`.
3. **Bare `# noqa`** — silently suppresses every rule on the line, including new ones. Always specify: `# noqa: E501`.
4. **Disabling `S*` rules globally** — hides hardcoded secrets and unsafe subprocess calls everywhere. Override only in `**/tests/**`, never globally.

See `reference.md` for the full 40-rule catalogue and integration deep dive, and `examples.md` for an annotated production `ruff.toml` and migration steps from flake8 + black.

## See also

- `arch-python-modern` — broader Python 3.10+ standards (type hints, async, pathlib, recommended stack)
- `github-actions-cicd` — general CI/CD workflow patterns; this skill covers the Ruff-specific flags
