---
name: poetry-python-monorepo
description: Poetry 1.8+ multi-package monorepo patterns — `package-mode = false` orchestrator root, path dependencies with `develop = true`, commitizen `version_files` for atomic multi-package version bumps, per-package poetry.lock trade-offs, dependency-graph hygiene. Use for multi-service Python repos with shared libraries. See `docker-python-poetry` for single-service builds.
updated: 2026-05-20
---

# Poetry Python Monorepo Patterns

Poetry has no native workspace concept, but a stable monorepo idiom has emerged: a `package-mode = false` orchestrator root, path-dep siblings with `develop = true`, per-package lockfiles, and commitizen for coordinated version bumps. This skill captures the patterns the `example-service` 6-package monorepo relies on.

## When to use

- Multi-service Python repo with shared internal libraries (utils, models, clients)
- Choosing between per-package `poetry.lock` and a single shared lockfile (monoranger plugin)
- Coordinating one version across N packages with `cz bump`
- Wiring path deps so sibling code edits hot-reload without `poetry install`
- Designing path-filtered CI that respects the internal dependency graph

## Core patterns

| Pattern | One-line rule |
|---|---|
| Orchestrator root | `package-mode = false` — root is not installable; hosts only dev tooling (commitizen, ruff, pre-commit) |
| Path deps | `{ path = "../example-utils", develop = true }` — editable install; sibling edits visible without re-install |
| Per-package lockfile | Each package owns a `poetry.lock`; only the changed service rebuilds in Docker |
| Commitizen `^version` anchor | `"pyproject.toml:^version"` — anchors regex to line start; without `^` commitizen clobbers dep version pins (issue #496) |
| `version_files` | Lists every package's `VERSION`, `pyproject.toml:^version`, and `__init__.py:^__version` — one `cz bump` updates all |
| Path-filtered CI | `paths:` per package must include upstream path-dep packages — see `github-actions-cicd` |

## Quick reference

```toml
# Root pyproject.toml — orchestrator
[tool.poetry]
name = "example-monorepo"
version = "0.75.0"
package-mode = false

[tool.poetry.group.dev.dependencies]
commitizen = "^4.0.0"
poetry-plugin-export = "^1.8.0"

[tool.commitizen]
version = "0.75.0"
tag_format = "v$version"
bump_message = "release: $new_version [skip ci]"
version_files = [
    "VERSION",
    "pyproject.toml:^version",
    "example-api/pyproject.toml:^version",
    "example-api/app/__init__.py:^__version",
    # ... one entry per package + per VERSION file + per __init__.py
]

# example-api/pyproject.toml — sibling with path deps
[tool.poetry.dependencies]
python = "^3.11"
example-utils = { path = "../example-utils", develop = true }
example-crud  = { path = "../example-crud",  develop = true }
```

## Anti-patterns (top 5)

1. **Version drift across packages** — same dep pinned `^4.14` here, `^4.15` there → per-package lockfiles resolve different patches → runtime model incompatibilities. Pin shared deps in the leaf (`example-utils`); consumers inherit.
2. **Duplicated dependencies** — `pymongo`/`pydantic` repeated in every consumer instead of promoted to `example-utils`. Promote to the leaf package.
3. **Missing `^` anchor in `version_files`** — `"pyproject.toml:version"` (no `^`) corrupts dependency version pins on `cz bump` (commitizen issue #496). The anchored form `:^version` is what prevents the corruption.
4. **Forgetting `develop = true`** — sibling code edits require `poetry install`; uvicorn `--reload` won't pick them up. Without `develop = true` for in-repo deps, every cross-package edit becomes a manual reinstall and the dev loop breaks down.
5. **Full-monorepo CI without path filtering** — every PR runs all 6 test suites. Add `paths:` filters that include the package's upstream deps; defer details to `github-actions-cicd`.

See `reference.md` for lockfile trade-offs, commitizen mechanics, Docker caveats, and uv workspaces comparison. See `examples.md` for the full 6-package layout and a step-by-step new-package walkthrough.

## See also

- `docker-python-poetry` — single-service Docker builds; covers the path-dep Docker caveat (full-monorepo COPY or `poetry-monorepo-dependency-plugin`)
- `github-actions-cicd` — Poetry caching, path filters, conventional-commits → SemVer mapping
