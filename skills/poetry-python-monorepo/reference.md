# Poetry Python Monorepo — Reference

Pattern catalogue for multi-package Poetry repos. Companion to `SKILL.md`.

## 1. Orchestrator root: `package-mode = false`

Source: [Poetry docs — pyproject/#package-mode](https://python-poetry.org/docs/pyproject/#package-mode).

`package-mode = false` flips Poetry from "build a distributable" to pure dependency-management:

- `poetry install` skips installing the project itself (equivalent to `--no-root`). Sibling path deps still install.
- The root **cannot** be built into a wheel or published.
- `name` and `version` remain recommended — commitizen requires `version` to be present in `[tool.poetry]` (or its own block) for `cz bump`.
- The root `pyproject.toml` is the natural home for monorepo-wide dev tooling: `commitizen`, `ruff`, `pylint`, `pre-commit`, `poetry-plugin-export`, `dunamai`. Per-package files carry only that package's runtime + dev deps.

**Poetry 2.0 migration friction**: when migrating `[tool.poetry]` → PEP 621 `[project]`, `name` becomes required even with `package-mode = false` (GitHub issues #9988, #10031). The example-monorepo stays in `[tool.poetry]` to avoid this. Track Poetry 2.x release notes before migrating.

## 2. Path dependencies with `develop = true`

Source: [Poetry docs — dependency-specification/#path-dependencies](https://python-poetry.org/docs/dependency-specification/#path-dependencies).

```toml
[tool.poetry.dependencies]
example-utils = { path = "../example-utils", develop = true }
```

`develop = true` installs the sibling in editable mode (PEP 660 / pip `-e`). Python resolves imports from the source tree directly:

- Code edits in `example-utils/` are visible to `example-api` immediately — no `poetry install` re-run.
- `uvicorn --reload` picks up sibling-package changes automatically.
- `develop = false` (or omitting it) installs a snapshot copy; changes require re-install.

**Lockfile interaction**: path deps are recorded in `poetry.lock` with relative path + `develop` flag. Lockfiles do not drift on sibling code changes — only on dependency version changes.

**Docker caveat**: standard Docker layer-caching (`COPY pyproject.toml poetry.lock ./` then `RUN poetry install`) breaks because the builder needs `../example-utils/` present at install time. Two fixes:

1. Copy the entire monorepo into the build stage (simple, slower cache).
2. Use `poetry-monorepo-dependency-plugin` to export without path deps (`export-without-path-deps`), pinning siblings to their version strings.

Defer Dockerfile detail to `docker-python-poetry`.

## 3. Per-package lockfile vs single shared lockfile

Poetry has no native workspace, no native shared lockfile. Two patterns dominate:

| Aspect | Per-package `poetry.lock` (example-monorepo) | Single shared lockfile (`poetry-monoranger-plugin`) |
|---|---|---|
| Independence | Each service resolves deps independently | All packages share one resolved graph |
| Version drift risk | High — `pymongo ^4.15` may resolve to different patch per package | Zero — one resolved version everywhere |
| Docker cache | Only the changed service rebuilds | Any dep change invalidates all images |
| Plugin needed | No | Yes (`poetry-monoranger-plugin`) |
| Circular dep detection | Manual | Plugin raises on cycle |

**When to choose per-package**: services deploy independently; you want partial Docker rebuilds; version drift can be policed at the application layer.

**When to choose shared**: all packages release together; lockfile drift is causing production incidents; you want plugin-enforced cycle detection.

The example-monorepo uses per-package lockfiles. Shared deps are pinned only in `example-utils` (the leaf), and consumers inherit via path dep — a manual discipline that substitutes for a shared lockfile.

## 4. Commitizen multi-package versioning

Source: [commitizen — bump.md](https://github.com/commitizen-tools/commitizen/blob/master/docs/commands/bump.md), [DeepWiki version management](https://deepwiki.com/commitizen-tools/commitizen/3.3-version-management).

Commitizen's `[tool.commitizen]` block lives in the root `pyproject.toml`. `version_files` lists every file that mirrors the package version. On `cz bump`:

1. Commitizen parses commits since the last tag → bump type (feat → MINOR, fix/perf → PATCH, `BREAKING CHANGE` → MAJOR).
2. Reads current version from `[tool.commitizen].version`.
3. **Consistency check** — every file in `version_files` must contain the current version string before any write.
4. Writes the new version into every `version_files` entry.
5. Creates commit (`bump_message`) and tag (`tag_format`).
6. Updates `CHANGELOG.md` if `update_changelog_on_bump = true`.

### The `^version` anchor (load-bearing)

```toml
version_files = [
    "pyproject.toml:^version",          # CORRECT — anchored to line start
    "pyproject.toml:version",           # WRONG — matches any line containing "version"
]
```

Without `^`, commitizen's regex matches any line containing `version` — including dependency lines like `pymongo = "^4.15.0"` (which contains the substring `version`? no, but lines like `azure-identity = "^1.17.0"  # min version` would match). More critically, lines like `"version" = "..."` inside `[tool.commitizen]` itself, or any TOML key whose value mentions the current version string, get clobbered. Confirmed footgun: [commitizen issue #496](https://github.com/commitizen-tools/commitizen/issues/496).

Always anchor: `pyproject.toml:^version`, `__init__.py:^__version`.

### `[skip ci]` in bump_message

`bump_message = "release: $new_version [skip ci]"` — the `[skip ci]` token prevents GitHub Actions / GitLab CI from re-running on the version-bump commit itself. The release tag triggers a separate deploy workflow.

## 5. Dependency graph hygiene

Poetry has no native circular-dep detector across path deps. Patterns that prevent cycles:

- **Single leaf rule**: one package (e.g., `example-utils`) imports nothing internal. All shared models, SDK wrappers, and utility code live there.
- **Top consumer rule**: one package (e.g., `example-api`) is the application entry; nothing imports it.
- **Tree, not DAG**: prefer a strict tree (`utils → crud → api`) over diamond shapes. Diamonds work but multiply lock-resolution surface.
- **Import-order pre-commit**: a hook that runs `python -c "import example_api; import example_crud; import example_utils"` in expected order catches accidental cycles introduced by a refactor.
- **`poetry show --tree`** per package surfaces the resolved deps; `pipdeptree --warn=silence` works similarly.

Shared third-party deps (e.g., `pymongo`, `pydantic`) should be pinned **once** in the leaf (`example-utils`) and inherited by consumers via the path dep, not re-pinned per package. Re-pinning is the most common source of cross-package version drift in Poetry monorepos.

### Tolerating circular path-deps during gradual splits

When splitting a monolith into per-package `pyproject.toml` files incrementally, a temporary bidirectional path-dep cycle is sometimes unavoidable — e.g., `example-processor` path-deps the new worker packages while each worker path-deps `example-processor` for shared base classes.

Poetry tolerates A→B and B→A path-deps when **both sides** declare `develop = true`. The resolver treats each editable path dep as a source tree reference rather than a versioned artifact, sidestepping the version-constraint conflict that a true circular version dep would cause.

**Lock-generation order matters**: lock the leaf-most package first — the one with no internal dependents (the workers in the example above). Then lock the package that depends on them (`example-processor`). Reversing the order causes lock failures because the depended-on package's lock doesn't yet exist when the depending package tries to resolve.

**Build-script compatibility**: `sed`-based scripts that rewrite `path = "../pkg"` to a versioned constraint (e.g., `poetry_build.sh`) work transparently with the cycle — they rewrite both directions independently before publish.

**This is a transitional pattern.** The clean end-state is one-directional: extract the shared code into a true leaf with no internal dependents. The circular form is the minimum-touch shape during a POC or incremental split; document it as such (e.g., a `POC HACK` docstring) so future engineers know it's not the intended steady state.

## 6. Path-filtered CI (brief)

Per-package GitHub Actions workflows use `paths:` filters. The filter must include the package's upstream path-dep packages — when `example-utils` changes, the `example-api` workflow must trigger:

```yaml
on:
  pull_request:
    paths:
      - "example-api/**"
      - "example-utils/**"
      - "example-crud/**"
```

Full pattern, Poetry caching, concurrency, and SonarQube wiring: see `github-actions-cicd`.

## 7. Future: uv workspaces vs Poetry monorepos

Source: [uv Workspace vs Poetry monorepos analysis](https://pratikpathak.com/uv-workspace-vs-poetry-managing-python-monorepos/).

Astral's `uv` (released 2024, mature in 2025) supports workspaces natively: a single root `pyproject.toml` with `[tool.uv.workspace]` + a single root lockfile, plus 10–100× faster resolves. For greenfield monorepos, uv workspaces are the simpler choice. For existing Poetry repos, migration is non-trivial (lockfile semantics differ; commitizen integration is identical; path-dep `develop = true` maps to uv's `editable = true`).

Decision rule: stay on Poetry if commitizen + per-package lockfiles + Docker pipelines are working. Move to uv if resolve time or workspace management is a daily friction.

### uv Migration Feasibility — Practical Mapping

When estimating a Poetry → uv migration on an existing monorepo:

| Poetry pattern | uv equivalent | Notes |
|---|---|---|
| `path = "../pkg", develop = true` | `[tool.uv.workspace] members = [...]` + `tool.uv.sources = { workspace = true }` | Retires `poetry-plugin-mono-repo-deps` in one stroke |
| `replace_path_deps.sh` (sed-rewrite `foo @ ../foo` to versioned constraint) | Not needed | uv emits proper version constraints natively for workspace members |
| Chef monkey-patch + `PIP_FIND_LINKS` / `PIP_CONSTRAINT` workarounds | `[tool.uv.sources] <pkg> = { path = "wheels/...whl" }` + `[tool.uv] no-build-isolation-package = ["<pkg>"]` | uv has declarative escape hatches Poetry 1.8 lacks |

**Dominant hidden bottleneck**: before estimating migration in engineering-days, grep `.github/workflows/*.yaml` for `uses: <org>/<repo>@<ref>`. If quality/test/build jobs delegate to a shared reusable-workflow repo that hardcodes `pip install poetry` + `poetry run X` calls, the actual bottleneck is that shared repo's ownership and its downstream-service blast radius — not the local `pyproject.toml` translation. A 3–4 day technical change can sit behind weeks of cross-repo coordination latency when the shared template is owned by a different team. State this ownership dimension explicitly when the estimate is consumed by anyone making a go/no-go call.

## 8. References

1. [Poetry — pyproject/#package-mode](https://python-poetry.org/docs/pyproject/#package-mode)
2. [Poetry — dependency-specification/#path-dependencies](https://python-poetry.org/docs/dependency-specification/#path-dependencies)
3. [commitizen bump.md](https://github.com/commitizen-tools/commitizen/blob/master/docs/commands/bump.md)
4. [commitizen issue #496 — bump changes dependency versions](https://github.com/commitizen-tools/commitizen/issues/496)
5. [poetry-monoranger-plugin](https://github.com/ag14774/poetry-monoranger-plugin)
6. [Poetry issue #9682 — Docker path dep caching](https://github.com/python-poetry/poetry/issues/9682)
7. [Poetry discussion #6850 — monorepo support](https://github.com/python-poetry/poetry/issues/6850)
8. [poetry-monorepo-dependency-plugin](https://pypi.org/project/poetry-monorepo-dependency-plugin/)
9. [uv Workspace vs Poetry analysis](https://pratikpathak.com/uv-workspace-vs-poetry-managing-python-monorepos/)
