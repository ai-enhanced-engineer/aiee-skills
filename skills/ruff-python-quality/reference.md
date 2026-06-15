# Ruff Reference

## Rule Category Catalogue

Ruff aggregates 40+ Python linter plugins behind single-letter prefixes. The default rule set is small (`E` + `F`); everything below requires explicit `select` or `extend-select`.

| Prefix | Plugin | What it catches | Priority |
|--------|--------|-----------------|----------|
| `E` | pycodestyle | Style errors (indentation, whitespace, blank lines) | Core |
| `W` | pycodestyle | Style warnings (trailing whitespace, deprecated syntax) | Core |
| `F` | Pyflakes | Logical errors: unused imports, undefined names, redefined symbols | Core |
| `I` | isort | Import sort order and grouping | Core |
| `B` | flake8-bugbear | Likely bugs (mutable defaults, `B008` calls in defaults) | High |
| `UP` | pyupgrade | Modernize syntax for `target-version` (`Optional[X]` → `X \| None`) | High |
| `SIM` | flake8-simplify | Simplification opportunities (`SIM105` → `contextlib.suppress`) | High |
| `S` | flake8-bandit | Security: hardcoded secrets, subprocess shell, asserts in prod | High |
| `N` | pep8-naming | PEP 8 naming for classes, functions, variables | High |
| `PL` | Pylint | Complexity (too-many-args, too-many-branches, magic values) | High |
| `RUF` | Ruff-specific | Implicit optional, ambiguous unicode, Ruff-native checks | High |
| `C4` | flake8-comprehensions | Unnecessary or wasteful comprehensions | Medium |
| `PTH` | flake8-use-pathlib | Replace `os.path` with `pathlib.Path` | Medium |
| `TCH` | flake8-type-checking | Move type-only imports into `TYPE_CHECKING` blocks | Medium |
| `ARG` | flake8-unused-arguments | Unused function/method arguments | Medium |
| `DTZ` | flake8-datetimez | `datetime` calls missing `tz=` | Medium |
| `TRY` | tryceratops | Exception-handling patterns | Medium |
| `EM` | flake8-errmsg | Raw / f-strings in exception messages | Medium |
| `FBT` | flake8-boolean-trap | Boolean positional arguments | Medium |
| `COM` | flake8-commas | Trailing comma enforcement (conflicts with formatter) | Low |
| `ISC` | flake8-implicit-str-concat | Implicit string concatenation (conflicts with formatter) | Low |
| `ERA` | eradicate | Commented-out code | Low |
| `T20` | flake8-print | `print()` statements | Low |
| `T10` | flake8-debugger | `breakpoint()` / pdb usage | Low |
| `A` | flake8-builtins | Shadowing Python builtins | Low |
| `BLE` | flake8-blind-except | Blind `except Exception` | Low |
| `PIE` | flake8-pie | Misc unnecessary code patterns | Low |
| `PT` | flake8-pytest-style | pytest best practices | Tests |
| `Q` | flake8-quotes | Quote style enforcement | Low |
| `RET` | flake8-return | Return statement consistency | Low |
| `SLF` | flake8-self | Private member access from outside class | Low |
| `YTT` | flake8-2020 | `sys.version` comparisons | Low |
| `INP` | flake8-no-pep420 | Missing `__init__.py` (namespace packages) | Low |
| `EXE` | flake8-executable | Shebang line issues | Low |
| `ICN` | flake8-import-conventions | Conventional aliases (`import numpy as np`) | Low |
| `RSE` | flake8-raise | Unnecessary `()` in `raise` | Low |
| `TID` | flake8-tidy-imports | Ban imports / require absolute imports | Low |
| `SLOT` | flake8-slots | Missing `__slots__` on classes | Low |
| `DJ` | flake8-django | Django anti-patterns | Project |
| `AIR` | Airflow | Airflow patterns | Project |

## Per-File Ignores

Per-file-ignores are scoped overrides matched by glob. Always prefer them over global `ignore` for context-specific exceptions.

```toml
[lint.per-file-ignores]
"__init__.py"      = ["F401"]                              # re-exports are intentional
"**/tests/**/*"    = ["S101","SLF001","ARG","FBT","PT011"] # test idioms
"scripts/**/*"     = ["T201","S101"]                       # scripts may print/assert
"migrations/**/*"  = ["E501","N806"]                       # generated/legacy code
"conftest.py"      = ["F401"]                              # fixture re-exports
```

Common scoping rules:

- `S101` (assert) — override in tests; assert is idiomatic in pytest
- `F401` (unused import) — override in `__init__.py` re-export modules
- `ARG` — override in tests (fixtures) and abstract method implementations
- `SLF001` (private access) — override in tests that inspect internals
- `T201` (print) — override in scripts and CLI entry points
- `INP001` (implicit namespace package) — override for top-level scripts dirs

## Ruff format vs Black

| Dimension | Ruff format | Black |
|-----------|-------------|-------|
| Output compatibility | >99.9% identical on Black-formatted code | Reference |
| Speed | ~10× faster (Rust) | Baseline |
| Configuration | Quote style, indent, docstring code, line endings | Minimal |
| F-string formatting | Formats `{expr}` interiors | Does not |
| Single binary | Yes — `ruff` lints + formats | Separate tool |
| Magic trailing comma | Respected (`skip-magic-trailing-comma=false`) | Same |

**Migration path**: drop `black` from pre-commit, replace with `ruff-format`. Existing Black-formatted code rarely needs reformatting; review f-string edge cases.

**Single-tool workflow**:

```bash
ruff check --fix .   # lint (auto-apply safe fixes)
ruff format .        # format
```

## Formatter Configuration

```toml
[format]
quote-style = "double"                  # "double" | "single" | "preserve"
indent-style = "space"                  # "space" | "tab"
skip-magic-trailing-comma = false       # true = ignore commas as line-break hints
line-ending = "auto"                    # "auto" | "lf" | "cr-lf" | "native"
docstring-code-format = true            # format Python in docstring code blocks
docstring-code-line-length = "dynamic"  # "dynamic" | integer
```

`docstring-code-format = true` is valuable for documentation-heavy codebases — examples in docstrings stay consistent. Disable if docstring snippets are deliberately compact or untested.

## Pre-commit + CI Integration

`.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.15.12         # pin to a specific release
    hooks:
      - id: ruff           # linter — run first if using --fix
        args: [--fix]
      - id: ruff-format    # formatter — run after linter
```

**Order matters**: when `--fix` is enabled, the lint hook must run before the format hook so reformatting accommodates the fixes.

GitHub Actions (inline PR annotations):

```yaml
- name: Lint
  run: ruff check --output-format=github .
- name: Format check
  run: ruff format --check .
```

`--output-format=github` produces annotations directly on changed lines in the PR diff. `ruff format --check` exits non-zero without writing if any file would change — diff-only enforcement.

## Incremental Adoption

1. Start with defaults (`ruff check .` enables `E`+`F`); run `--fix` for safe auto-fixes
2. Add families one at a time via `extend-select` (e.g., add `I` for imports first)
3. Run report-only in CI until the first fully-clean commit, then promote to a blocking gate
4. Keep `unsafe-fixes = false`; use `--unsafe-fixes` flag only for deliberate migration runs
5. Prefer `per-file-ignores` over expanding the global `ignore` list — keeps audit surface small
6. Pin Ruff version in `pre-commit` and CI; Ruff's rule set evolves quickly

## Anti-Patterns Deep Dive

| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| `ignore = ["S"]` | Masks all current and future security findings | Use `[lint.per-file-ignores]` scoped to tests only |
| Black + Ruff together | Two formatters compete; `COM812`/`ISC001` collide | Replace Black with `ruff format` |
| `# noqa` (no code) | Suppresses all rules silently, including new ones | `# noqa: E501` — always specify |
| Global `S*` ignore | Hides hardcoded secrets and unsafe calls everywhere | Per-file: `"**/tests/**" = ["S101"]` |
| `COM812`/`ISC001` selected without paired ignore | Conflicts with `ruff format` | Always pair with `ignore = ["COM812","ISC001"]` |
| `unsafe-fixes = true` | Auto-applies semantic-changing rewrites | Leave off; opt-in via flag for migrations |
| `PL` selected without tuning thresholds | Defaults (5 args, 12 branches) too strict for service code | `[lint.pylint] max-args=10`, `max-branches=15`, `max-statements=60` |

## References

- [Ruff Rules](https://docs.astral.sh/ruff/rules/) — full per-rule catalog
- [Ruff Configuration](https://docs.astral.sh/ruff/configuration/) — file precedence, all options
- [Ruff Formatter](https://docs.astral.sh/ruff/formatter/) — Black compatibility, deviations
- [ruff-pre-commit](https://github.com/astral-sh/ruff-pre-commit) — official hook (pinned separately from Ruff)
- [Ruff Integrations](https://docs.astral.sh/ruff/integrations/) — IDE/CI/pre-commit guide
