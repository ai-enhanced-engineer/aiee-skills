# Poetry Python Monorepo — Examples


## Example 1: Six-package layout

```
example-service/
├── pyproject.toml          # orchestrator: package-mode = false, commitizen, dev tools
├── poetry.lock
├── VERSION                 # "0.75.0"
├── example-utils/              # leaf — Azure SDK, Pydantic models, langchain-core
│   ├── pyproject.toml
│   ├── poetry.lock
│   ├── VERSION
│   └── example_utils/__init__.py    # __version__ = "0.75.0"
├── example-blob/               # depends on example-utils
├── example-bus/                # depends on example-utils
├── example-crud/               # depends on example-utils
├── example-processor/          # depends on example-utils, example-crud, example-bus
└── example-api/                # depends on example-utils, example-crud, example-blob, example-bus
```

All six packages are at version `0.75.0` — lockstep versioning via a single `cz bump` at the root.

Dependency graph (verified for `example-utils`, `example-crud`, `example-api`; inferred for the rest):

```
example-utils  ←  no internal deps (leaf)
example-crud   ←  example-utils
example-blob   ←  example-utils
example-bus    ←  example-utils
example-processor ← example-utils, example-crud, example-bus
example-api    ←  example-utils, example-crud, example-blob, example-bus
```

`example-utils` is the universal leaf — shared Pydantic models, Azure SDK wrappers, PDF utilities. `example-api` is the top-level consumer. No cycles possible.

## Example 2: Root `pyproject.toml` (orchestrator)

`pyproject.toml` — orchestrator with commitizen `version_files` for all 20 pins.

```toml
[tool.poetry]
name = "example-monorepo"
version = "0.75.0"
description = "Order Processing monorepo"
authors = ["Example Author <dev@example.com>"]
readme = "README.md"
include = ["VERSION", "README.md"]
package-mode = false                         # ← root is not installable

[tool.poetry.group.dev.dependencies]
poetry-plugin-export = "^1.8.0"
commitizen = "^4.0.0"
dunamai = "^1.21.1"
pytest = "8.2.2"
ruff = "^0.12.9"
pylint = "^3.0.3"
pre-commit = "^4.0.1"
isort = "^5.13.2"
pysonar = "^1.1.0.2035"

[tool.commitizen]
name = "cz_conventional_commits"
version = "0.75.0"
tag_format = "v$version"
version_files = [
    "VERSION",
    "pyproject.toml:^version",
    "example-api/VERSION",
    "example-api/pyproject.toml:^version",
    "example-api/app/__init__.py:^__version",
    "example-blob/VERSION",
    "example-blob/pyproject.toml:^version",
    "example-blob/example_blob/__init__.py:^__version",
    "example-bus/VERSION",
    "example-bus/pyproject.toml:^version",
    "example-bus/example_bus/__init__.py:^__version",
    "example-crud/VERSION",
    "example-crud/pyproject.toml:^version",
    "example-crud/example_crud/__init__.py:^__version",
    "example-processor/VERSION",
    "example-processor/pyproject.toml:^version",
    "example-processor/example_processor/__init__.py:^__version",
    "example-utils/VERSION",
    "example-utils/pyproject.toml:^version",
    "example-utils/example_utils/__init__.py:^__version",
]
update_changelog_on_bump = true
bump_message = "release: $new_version [skip ci]"
```

**What `cz bump` updates atomically**: 6 `VERSION` files + 6 `pyproject.toml:^version` lines + 6 `__init__.py:^__version` lines + the root `VERSION` + the root `pyproject.toml:^version` = **20 files** in one commit, one tag.

**Why every entry uses `:^version`**: without the `^` anchor, commitizen would also rewrite lines like `azure-identity = "^1.17.0"` if they happened to share the version string, and would clobber commitizen's own `version = "0.75.0"` line in surprising ways. See [commitizen issue #496](https://github.com/commitizen-tools/commitizen/issues/496).

## Example 3: Sibling `pyproject.toml` with path deps

`example-api/pyproject.toml` — path deps to all four upstream packages.

```toml
[tool.poetry]
name = "example-api"
version = "0.75.0"
packages = [{ include = "app" }]
include = ["VERSION", "README.md", "CHANGELOG.md"]

[tool.poetry.dependencies]
example-blob  = { path = "../example-blob",  develop = true }
example-bus   = { path = "../example-bus",   develop = true }
example-utils = { path = "../example-utils", develop = true }
example-crud  = { path = "../example-crud",  develop = true }
python = "^3.11"
fastapi = "^0.111.0"
pymongo = "^4.15.0"
aiofiles = "^25.1.0"
pillow = "^11.3.0"
pypdf = "^5.1.0"

[tool.poetry-monorepo.deps]
# placeholder for poetry-monoranger-plugin compatibility
```

**Notes**:

- All four siblings use `develop = true` — `uvicorn --reload` picks up edits to `example_utils/`, `example_crud/`, `example_blob/`, `example_bus/` automatically without a `poetry install` re-run.
- Default `package-mode = true` (not set) — `example-api` is buildable into a wheel for Docker.
- `[tool.poetry-monorepo.deps]` block is empty but present — placeholder slot for `poetry-monoranger-plugin` if the team migrates to a shared lockfile later.
- `pymongo ^4.15.0` and `aiofiles ^25.1.0` are duplicated in `example-crud/pyproject.toml`. **Anti-pattern**: these should be pinned only in `example-utils` (or `example-crud` as the data-layer leaf) and inherited via path dep. Per-package lockfiles can resolve different patches → runtime incompatibilities.

## Example 4: Adding a new package (`example-newthing`)

Walkthrough for adding `example-newthing` that depends on `example-utils`:

1. **Scaffold**:
   ```
   example-newthing/
   ├── pyproject.toml
   ├── VERSION                       # "0.75.0" — must match current
   ├── example_newthing/
   │   └── __init__.py                # __version__ = "0.75.0"
   └── tests/
   ```

2. **`example-newthing/pyproject.toml`**:
   ```toml
   [build-system]
   requires = ["poetry_core>=1.0.0"]
   build-backend = "poetry.core.masonry.api"

   [tool.poetry]
   name = "example-newthing"
   version = "0.75.0"
   packages = [{ include = "example_newthing" }]
   include = ["VERSION", "README.md", "CHANGELOG.md"]

   [tool.poetry.dependencies]
   python = "^3.11"
   example-utils = { path = "../example-utils", develop = true }

   [tool.poetry-monorepo.deps]
   ```

3. **Add path dep from consumer** (e.g., `example-api/pyproject.toml`):
   ```toml
   example-newthing = { path = "../example-newthing", develop = true }
   ```

4. **Register in root `[tool.commitizen].version_files`**:
   ```toml
   version_files = [
       # ... existing entries ...
       "example-newthing/VERSION",
       "example-newthing/pyproject.toml:^version",
       "example-newthing/example_newthing/__init__.py:^__version",
   ]
   ```

5. **Install**:
   ```bash
   cd example-newthing && poetry install
   cd ../example-api && poetry lock --no-update && poetry install
   ```

6. **Verify cz bump consistency**: `cz bump --dry-run` — must report version `0.75.0` found in all listed files. If any file is missing or has the wrong version, cz fails fast before writing anything.

7. **Add CI workflow** (`.github/workflows/example-newthing.yaml`):
   ```yaml
   on:
     pull_request:
       paths:
         - "example-newthing/**"
         - "example-utils/**"   # upstream path dep
   ```

## Example 5: Bumping all packages with `cz bump`

Setup: feature branch merges to `main` with commits like:

```
feat(api): add document classification endpoint
fix(crud): handle null _id in upsert
feat(utils): add PDF page extractor
```

Run at repo root:

```bash
$ cz bump --yes
bump: version 0.75.0 → 0.76.0     # ← MINOR, because there were `feat:` commits
tag to create: v0.76.0
increment detected: MINOR

[bump] writing 0.76.0 to VERSION
[bump] writing 0.76.0 to pyproject.toml (line: ^version)
[bump] writing 0.76.0 to example-api/VERSION
[bump] writing 0.76.0 to example-api/pyproject.toml (line: ^version)
[bump] writing 0.76.0 to example-api/app/__init__.py (line: ^__version)
[bump] writing 0.76.0 to example-blob/VERSION
... (16 more files) ...
[bump] writing 0.76.0 to example-utils/example_utils/__init__.py (line: ^__version)

[bump] CHANGELOG.md updated
[bump] commit: release: 0.76.0 [skip ci]
[bump] tag: v0.76.0
```

**Result**:
- One commit (`release: 0.76.0 [skip ci]`) modifying 20 files.
- One tag `v0.76.0`.
- `CHANGELOG.md` updated with the three commits grouped by type.
- `[skip ci]` prevents the QA workflow from re-running on this commit; a separate release workflow triggers off the `v*` tag to build/push Docker images.

**If a file is out of sync**: cz bump fails before writing anything:

```
$ cz bump
ERROR: version found in example-api/VERSION (0.74.0) does not match
  current commitizen version (0.75.0)
```

Fix: bring the file back to `0.75.0` manually, then re-run. This is the safety net for human edits that miss a file — never edit version files by hand without re-running consistency checks.

## Example 6: Dev workflow with `develop = true`

```bash
# initial setup — install all sibling packages editable into example-api's venv
$ cd example-api && poetry install
Installing example-utils (0.75.0 /Users/.../example-utils)         # ← editable
Installing example-crud  (0.75.0 /Users/.../example-crud)          # ← editable
Installing example-blob  (0.75.0 /Users/.../example-blob)          # ← editable
Installing example-bus   (0.75.0 /Users/.../example-bus)           # ← editable
Installing fastapi (0.111.4)
...

# run with hot reload
$ poetry run uvicorn app.main:app --reload

# in another terminal — edit example-utils
$ vim ../example-utils/example_utils/pdf.py
# uvicorn detects the change, reloads — no poetry install needed
WARNING:  WatchFiles detected changes in 'example_utils/pdf.py'. Reloading...
```

Without `develop = true`, the edit would be invisible until `poetry install --no-cache` re-copied `example-utils` into the venv.
