# Docker Python Patterns - Reference

## Dockerfile Examples

### Python 3.12+ with OpenCV (Debian Trixie)

```dockerfile
FROM python:3.12-slim

# OpenCV runtime dependencies (Trixie-compatible)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Pin setuptools for packages using pkg_resources
RUN pip install --no-cache-dir 'setuptools<82'

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
WORKDIR /app

CMD ["python", "main.py"]
```

### Django with Legacy Dependencies

```dockerfile
FROM python:3.12-slim

# setuptools pin MUST come before pip install of legacy packages
RUN pip install --no-cache-dir 'setuptools<82'

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app
WORKDIR /app

EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000"]
```

## OpenCV Dependency Matrix

| Package | Apt Dependencies | Use Case |
|---------|-----------------|----------|
| `opencv-python` | `libgl1 libglib2.0-0 libsm6 libxext6 libxrender-dev` | Full GUI support |
| `opencv-python-headless` | `libgl1 libglib2.0-0` | Server/container (no display) |
| `opencv-contrib-python` | Same as `opencv-python` + contrib modules | Extra algorithms (SIFT, SURF) |
| `opencv-contrib-python-headless` | `libgl1 libglib2.0-0` | Server + extra algorithms |

## Debugging Commands

### Import Failures

```bash
# Check if OpenCV can import
docker exec <container> python -c "import cv2; print(cv2.__version__)"

# Find missing shared libraries
docker exec <container> ldd $(python -c "import cv2; print(cv2.__file__)") | grep "not found"

# Check if pkg_resources is available
docker exec <container> python -c "import pkg_resources; print(pkg_resources.__version__)"
```

### Port Mapping Verification

```bash
# Check what's actually listening inside the container
docker exec <container> ss -tlnp

# Compare with docker-compose port mapping
docker compose ps --format "table {{.Name}}\t{{.Ports}}"

# Common gotcha: host port differs from container port
# docker-compose.yml: "80:8000" means localhost:80 -> container:8000
# curl http://localhost:80  # correct
# curl http://localhost:8000  # wrong (nothing on host port 8000)
```

## setuptools 82+ Breaking Change Detail

The `setuptools` package removed the `pkg_resources` module starting in version 82. Packages that import `pkg_resources` at module level will crash with:

```
ModuleNotFoundError: No module named 'pkg_resources'
```

### Affected Packages (commonly used)

- `drf-yasg` (Django REST Swagger)
- `django-rest-swagger`
- Older versions of `grpcio-tools`
- Various packages using `pkg_resources.get_distribution()` for version checks

### Detection

```bash
# Find packages importing pkg_resources in your virtualenv
grep -r "import pkg_resources" $(python -c "import site; print(site.getsitepackages()[0])") --include="*.py" -l
```

### Fix Priority

Pin `setuptools<82` in your Dockerfile BEFORE `pip install -r requirements.txt`. The pin must come first because some packages import `pkg_resources` during their own installation.

## Debian Release Reference

| Debian Release | Python Base Images | Key Changes |
|---------------|-------------------|-------------|
| Bullseye (11) | python:3.9-slim | `libgl1-mesa-glx` available |
| Bookworm (12) | python:3.11-slim | `libgl1-mesa-glx` available |
| Trixie (13) | python:3.12-slim, python:3.13-slim | `libgl1-mesa-glx` removed, use `libgl1` |

## CI System Dependencies (ubuntu-latest)

`opencv-python` on `ubuntu-latest` requires system libraries absent by default:

```yaml
- name: Install OpenCV system dependencies
  run: |
    sudo apt-get update
    sudo apt-get install -y libgl1 libglib2.0-0
```

Install before `uv sync` or `pip install`.

## Example Project CI Template

For projects without GCP infra or semantic release — parallel validation + Docker build gate (no push):

| Build Stage | Example Project | Action |
|----------|-------------------|--------|
| format / lint / type-check / test | Keep | Run in parallel |
| docker-build | Keep | No push — just validate image builds |
| semantic-release | Remove | No versioning workflow yet |
| GAR push | Remove | No registry set up |
| Cloud Run deploy | Remove | No infra yet |
| Rollback / smoke tests | Remove | Nothing deployed |

**Coverage floor**: Set `--cov-fail-under` to current baseline (e.g. 60%) not an aspirational target. Raise as tests are added.

## Compose Project Name and Orphaned Containers

Docker Compose derives the project name from the **directory containing the compose file** when no explicit name is set. Moving `docker-compose.yml` to a new directory silently changes the project name.

**Consequence**: Containers started under the old path carry a different project label. Running `docker-compose -f <moved-file> down` targets the new project name — it finds no matching containers and exits cleanly while the old containers keep running. No error is emitted.

**Detection**:

```bash
# Show running containers and their compose project label
docker ps --format "table {{.Names}}\t{{.Label \"com.docker.compose.project\"}}"

# Compare against the project name Compose would derive from the new path
docker compose -f /new/path/docker-compose.yml config | grep "^name:"
```

**Fixes** (pick one):

| Fix | How |
|-----|-----|
| Pin with env var | `export COMPOSE_PROJECT_NAME=myapp` in the shell or `.env` file at the compose file's location |
| Pin in file | Add `name: myapp` as the first key in `docker-compose.yml` (Compose spec v3.9+) |
| Manual cleanup | `docker stop <old-container> && docker rm <old-container>` by name if the project name has already drifted |

The `name:` key in the file is the most portable option — it travels with the file across directories and is visible in source control. The env var approach works when the file itself cannot be modified (e.g., third-party compose files).
