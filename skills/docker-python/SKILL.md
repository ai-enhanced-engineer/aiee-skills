---
name: docker-python
description: Docker patterns for Python 3.12+ applications. Debian Trixie breaking changes, OpenCV dependencies, setuptools compatibility, and port mapping verification. Use when building Dockerfiles for Python services.
kb-sources:
  - wiki/software-engineering/docker-python
updated: 2026-06-03
---

# Docker Python Patterns

## Debian Trixie Breaking Changes (Python 3.12+ base images)

| Change | Old | New | Impact |
|--------|-----|-----|--------|
| **OpenGL library** | `libgl1-mesa-glx` | `libgl1` | OpenCV `import cv2` fails at runtime |
| **pkg_resources** | Bundled with setuptools | Removed in setuptools 82+ | `drf-yasg`, `django-rest-swagger` crash on import |

**Fixes**: `apt-get install libgl1` and `pip install 'setuptools<82'` in Dockerfile.

## Quick Reference

- **OpenCV apt deps**: `libgl1 libglib2.0-0` (minimal); add `libsm6 libxext6 libxrender-dev` for GUI
- **setuptools pin**: `RUN pip install 'setuptools<82'` before packages using `pkg_resources`
- **Port mapping**: Verify `docker-compose.yml` host:container mapping (`80:8000` != `8000:8000`)

## CI System Dependencies (ubuntu-latest)

`opencv-python` on `ubuntu-latest` requires `libgl1 libglib2.0-0` — install before `uv sync` or `pip install`. See `reference.md` for CI template and Example Project pipeline patterns.

## EC2 Deployment Patterns

**Bridge vs host networking**: Bridge mode (`-p 80:8000`) maps container ports to SG-allowed host ports. Host networking exposes the process port directly — it may not match open SG rules (22, 80, 443).

**Localhost-only bind behind TLS reverse proxy**: When running Docker behind a TLS terminator (Caddy, nginx), bind container ports to `127.0.0.1` so external traffic cannot bypass TLS: `-p 127.0.0.1:8000:8000`. Default bridge publishing binds to `0.0.0.0` and becomes externally reachable if the SG allows the host port — a defense-in-depth gap. See `caddy-tls-proxy` for the full reverse-proxy topology.

**Django `runserver` misleading output**: Reports "System check identified no issues" even when it fails to bind. Use Gunicorn for production; verify binding with a health check endpoint.

## Secrets and Env-File Patterns

**Atomic writes**: Writing secrets to a tmpfile then moving into place (`mktemp` + `chmod 600` + `mv`) prevents partial reads during crashes. See `examples.md` for the atomic write pattern.

**printf over heredoc**: `printf '%s\n' "$SECRET"` is immune to shell metachar expansion (`$`, backticks, `!`). Unquoted heredocs expand these and corrupt values. `printf` is a bash builtin — secrets never appear in `/proc/*/cmdline`.

**Docker `--env-file` gotcha**: Docker's env-file parser treats `#` as a comment delimiter, silently truncating values containing `#`. `docker run --env KEY=VALUE` with proper shell quoting avoids this.

## Production Persistence

**SQLite + Docker + systemd**: Systemd `ExecStartPre: docker rm` destroys the container filesystem. Named volumes (`-v name:/path`) survive `docker rm` and are auto-created on first use. See `examples.md`.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Installing `libgl1-mesa-glx` on Trixie | Use `libgl1` (meta-package removed) |
| Assuming `pkg_resources` is available | Pin `setuptools<82` for legacy packages |
| Trusting port numbers without checking compose | Verify host:container mapping |
| Using `opencv-python` when headless suffices | Use `opencv-python-headless` in containers |
| `--network host` on EC2 behind security groups | Bridge networking `-p 80:8000` maps to SG-allowed ports |
| Django `runserver` "no issues" means server is ready | Use Gunicorn; a health check endpoint confirms actual binding |
| Unquoted heredoc for secret interpolation | `printf '%s\n' "$SECRET"` — immune to metachar expansion |
| Docker `--env-file` with values containing `#` | Use `docker run --env KEY=VALUE` or validate no `#` in values |
| Container-local SQLite without volume mount | Use a named volume (`-v name:/path`); survives `docker rm` |
| `--run-syncdb` for apps with migration files | Plain `manage.py migrate` — `--run-syncdb` only works for unmigrated apps |
| Moving a compose file without pinning project name | Compose derives name from directory; old containers become orphans — `down` from the new path skips them. Pin with `COMPOSE_PROJECT_NAME` or `name:` in file. See `reference.md`. |

See `reference.md` for Dockerfile examples, debugging commands, and OpenCV dependency matrix.
See `examples.md` for secret handling, volume persistence, and entrypoint patterns.
