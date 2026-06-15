# Docker Python Patterns — Examples

## Atomic Secret Write

```bash
tmp=$(mktemp /opt/app/.env.XXXXXX)
printf '%s\n' "KEY=$SECRET_VALUE" > "$tmp"
chmod 600 "$tmp" && chown root:root "$tmp" && mv "$tmp" /opt/app/.env
```

## Docker Volume for SQLite Persistence

```bash
# Setup script
docker volume create app-data

# Systemd unit (ExecStart line)
ExecStart=docker run --name app -v app-data:/app/data ...
```

Named volumes survive `docker rm` and are auto-created by Docker on first `docker run -v` if they don't exist.

## Entrypoint Migration Pattern

```bash
#!/bin/bash
# entrypoint.sh — run migrations before starting server
python manage.py migrate --noinput
exec gunicorn app.wsgi:application --bind 0.0.0.0:8000
```

Ensures schema is current after every deploy. `exec` replaces the shell process so gunicorn receives signals directly.
