# Ruff Examples

## 1. Annotated Production `ruff.toml`

This is the live `ruff.toml` from `example-service` — a FastAPI service with 40 rule categories enabled. Every ignore is annotated with the actual reason it's scoped out.

```toml
target-version = "py311"   # enables UP rewrites for 3.11+ syntax
line-length = 88           # Black default; matches `ruff format` default
indent-width = 4
fix = true                 # auto-apply safe fixes on `ruff check`
unsafe-fixes = false       # never auto-apply semantic-altering rewrites

# Standard exclusion list — VCS, build artifacts, virtualenvs, type stubs.
exclude = [
    ".bzr", ".direnv", ".eggs", ".git", ".git-rewrite", ".hg", ".nox",
    ".pants.d", ".pytype", ".ruff_cache", ".svn", ".tox", ".venv",
    "__pypackages__", "_build", "buck-out", "build", "dist",
    "node_modules", "venv", "*.pyi",
]

[lint]
# 40-category comprehensive selection. Categories grouped by purpose:
select = [
    # Core quality
    "E", "W", "F", "I",
    # Bug prevention
    "B", "BLE", "FBT", "ERA", "T10",
    # Security
    "S",
    # Modernization
    "UP", "PTH", "TCH",
    # Simplification
    "SIM", "RET", "RSE", "PIE",
    # Naming
    "N",
    # Complexity
    "PL", "C4", "COM", "ISC",
    # Imports
    "ICN", "TID", "INP",
    # Exception handling
    "TRY", "EM",
    # Framework / domain
    "DJ",
    # Misc hygiene
    "A", "ARG", "DTZ", "EXE", "YTT", "SLOT", "SLF", "Q", "PT", "T20", "RUF",
]

ignore = [
    # ── Style ──
    "E501",     # line-too-long → handled by `ruff format`, not the linter
    # ── Bugbear ──
    "B008",     # function calls in default args → FastAPI uses `Depends()` here
    "B904",     # `raise ... from err` → not always desired in middleware re-raises
    # ── Security ──
    "S101",     # assert detected → asserts used for internal invariants; tests override anyway
    "S104",     # binding to 0.0.0.0 → required for containers
    "S105",     # hardcoded password → triggers on token-shaped strings; managed externally
    "S106",     # hardcoded password (kw arg) → same as above
    "S107",     # hardcoded password (default arg) → same as above
    "S108",     # /tmp file usage → controlled, intentional
    # ── Print / debug ──
    "T201",     # print statement → allowed in dev; formatter excludes scripts/tests
    # ── Pylint complexity (tuned via [lint.pylint] instead) ──
    "PLR0913",  # too-many-arguments
    "PLR0912",  # too-many-branches
    "PLR0915",  # too-many-statements
    "PLR2004",  # magic value in comparison → too strict for HTTP status / port checks
    # ── Formatter conflicts (MUST ignore when using `ruff format`) ──
    "COM812",   # trailing comma → formatter handles
    "ISC001",   # implicit string concat → formatter handles
    # ── Exception messages ──
    "EM101",    # raw string in exception → short messages inline are clearer
    "EM102",    # f-string in exception → same as above
    "TRY003",   # long messages outside class → too rigid for service-level errors
    "TRY300",   # move statement to `else` block → too rigid
    # ── Naming ──
    "N815",     # mixedCase variable → underscore-prefixed protocol attrs
    "N802",     # function name lowercase → some library callbacks need camelCase
    "N803",     # argument name lowercase → some library callbacks need camelCase
    # ── Simplify / blind except ──
    "SIM105",   # contextlib.suppress() → not always more readable than try/except/pass
    "SIM117",   # combine context managers → multi-line `with` is acceptable
    "BLE001",   # broad except → intentional in middleware boundaries
    # ── Boolean trap ──
    "FBT001",   # boolean positional → allowed; FBT002 (default) still enforced
]

fixable = ["ALL"]   # `--fix` may apply any selected rule
unfixable = []

# Allow underscore-prefixed unused vars (e.g., `_unused`)
dummy-variable-rgx = "^(_+|(_+[a-zA-Z0-9_]*[a-zA-Z0-9]+?))$"

[lint.per-file-ignores]
# Tests use pytest idioms that violate many production rules.
"**/tests/*.*" = [
    "S101",      # asserts are idiomatic
    "SLF001",    # tests inspect private members
    "S105", "S106", "S107",   # fake credentials in fixtures
    "ARG",       # unused fixture arguments
    "FBT",       # bool positional in helpers
    "PT009",     # allow self.assert* style
    "A001", "A002",  # builtin shadowing in fixtures
    "PT006", "PT011", "PT027",  # parametrize/raises looseness
    "DTZ001", "DTZ003",         # naive datetimes in tests
    "SIM117",    # multi `with`
    "TRY",       # try/except looseness
    "N806",      # uppercase locals in tests
    "PTH123",    # `open()` allowed
    "F841",      # unused locals (pytest fixtures)
    "INP001",    # tests dir is not a package
    "B017",      # `pytest.raises(Exception)` is fine in unit tests
    "F811",      # fixture redefinitions
    "N999",      # package-name vs directory-name mismatch
]

# Re-export modules: unused imports are intentional public API.
"__init__.py" = ["F401", "N999"]

# CLI/dev scripts: print and assert are allowed.
"scripts/*.*" = ["T201", "S101", "N999"]

# Hyphenated package directory — Python identifier rule N999 cannot be satisfied.
"example-processor/**/*" = ["N999"]

[lint.mccabe]
max-complexity = 10

[lint.pylint]
# Production-tuned complexity thresholds. Defaults are too strict for service code.
max-args = 10        # default 5  — service constructors aggregate many deps
max-branches = 15    # default 12 — routing/dispatch logic legitimately complex
max-returns = 8      # default 6  — Result-style early exits
max-statements = 60  # default 50 — service methods can be substantive

[lint.isort]
known-first-party = ["app", "settings", "tests"]
force-single-line = false
combine-as-imports = true   # merges `from x import a` and `from x import a as b`

[format]
quote-style = "double"
indent-style = "space"
skip-magic-trailing-comma = false   # respect trailing commas as line-break hints
line-ending = "auto"
docstring-code-format = true        # format Python inside docstring code blocks
docstring-code-line-length = "dynamic"

# Formatter excludes — test reports stay byte-stable; scripts may be intentionally compact.
exclude = [
    "__pycache__/**/*",
    "test-reports/**/*",
    "scripts/**/*",
    "**/tests/**/*",
]
```

### Why this config is shaped this way

- **`ignore` is large but intentional** — every entry is a documented project-specific decision, not a way to silence noise. Audit trail lives next to the rule.
- **Formatter conflicts are explicit** — `COM812` and `ISC001` are *always* ignored when `ruff format` is in use. Without these, every commit would oscillate between linter and formatter.
- **Pylint complexity is tuned, not disabled** — global `PLR0913/0912/0915` ignores are paired with `[lint.pylint]` thresholds so the rule still fires above realistic limits.
- **Tests get a wide override** — pytest, fixtures, and `assert` patterns are fundamentally different from production code. The override block is large but scoped.
- **`N999` recurs** — the project uses hyphenated directory names that cannot be Python identifiers. Override scope is precise (only the affected dirs).

## 2. Pre-commit Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.15.12               # pin to a specific Ruff release
    hooks:
      - id: ruff                  # 1. linter (auto-fix safe issues)
        args: [--fix]
      - id: ruff-format           # 2. formatter — must run AFTER linter
```

Install + run:

```bash
pre-commit install                   # install git hook
pre-commit run --all-files           # one-shot run on entire repo
```

## 3. GitHub Actions CI Snippet

```yaml
# .github/workflows/ci.yml
name: CI

on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv pip install --system "ruff==0.15.12"   # match pre-commit version

      - name: Ruff lint
        run: ruff check --output-format=github .       # inline PR annotations

      - name: Ruff format check
        run: ruff format --check .                     # diff-only, exits non-zero if changes needed
```

`--output-format=github` produces GitHub Actions annotations that render directly as inline comments on the PR diff — reviewers see violations on the affected lines without leaving the PR view.

`ruff format --check` is the read-only equivalent of `ruff format`: it walks the tree, computes the diff, and exits non-zero if any file would change. No writes occur.

## 4. Migration: flake8 + black + isort → Ruff

Rough order of operations for a brownfield migration. Each step is committable on its own.

### Step 1 — Drop Black, run `ruff format`

```bash
# Remove old tooling
pip uninstall -y black
# Add Ruff
uv add --dev "ruff>=0.15.0"
# Format the whole tree once with Ruff (Black-compatible output)
ruff format .
```

Commit. Diff should be tiny (Ruff format is >99.9% Black-compatible). Spot-check f-string formatting since Ruff formats `{expr}` interiors and Black does not.

### Step 2 — Replace flake8 with `ruff check`

Translate `.flake8` / `setup.cfg` rules into a `ruff.toml`:

```toml
target-version = "py311"
line-length = 88

[lint]
select = ["E", "W", "F"]    # flake8-equivalent baseline
ignore = ["E501", "COM812", "ISC001"]
```

Run `ruff check --fix .`. Commit auto-fixes separately.

### Step 3 — Drop isort, enable `I`

```bash
pip uninstall -y isort
```

```toml
[lint]
select = ["E", "W", "F", "I"]    # add isort

[lint.isort]
known-first-party = ["app", "settings"]
combine-as-imports = true
```

Run `ruff check --fix .` to apply import sorting. Commit.

### Step 4 — Expand rule families incrementally

Add one family per PR via `extend-select`. Suggested order:

```toml
extend-select = ["B"]     # bugbear — high signal, easy fixes
# next PR:
extend-select = ["B", "UP"]   # pyupgrade — safe modernizations
# next PR:
extend-select = ["B", "UP", "SIM", "C4"]   # simplifications
# next PR:
extend-select = ["B", "UP", "SIM", "C4", "S"]   # security (with per-file-ignores for tests)
```

After each PR runs clean, fold `extend-select` entries into the main `select` list.

### Step 5 — Update pre-commit + CI

Replace `black`, `flake8`, `isort` hooks with the single `astral-sh/ruff-pre-commit` block (see section 2). Update CI to call `ruff check` and `ruff format --check`.

### Step 6 — Tune Pylint thresholds (optional)

If selecting `PL`, the defaults will fire on most service code. Add `[lint.pylint]` overrides (see annotated config above) before enabling, or expect a large initial cleanup.

### Acceptance criteria

- `ruff check .` exits 0 on the full tree
- `ruff format --check .` exits 0
- `pre-commit run --all-files` exits 0
- CI workflow shows inline annotations on a deliberately-broken PR (verifies `--output-format=github`)
- No remaining references to `black`, `flake8`, or `isort` in `pyproject.toml`, `.pre-commit-config.yaml`, or CI workflows
