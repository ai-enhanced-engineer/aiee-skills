---
name: caddy-tls-proxy
description: Caddy as a zero-config TLS reverse proxy for single-service EC2 deployments. Auto-provisioned Let's Encrypt certs, 3-line Caddyfile, systemd integration. Use when terminating HTTPS on EC2 for a Dockerized service, avoiding ALB costs, or replacing nginx+certbot.
kb-sources:
  - wiki/software-engineering/caddy-tls-proxy
updated: 2026-04-19
---

# Caddy TLS Reverse Proxy

Caddy is the simplest way to terminate TLS in front of a single service on an EC2 (or similar) box. One binary, a 3-line Caddyfile, automatic Let's Encrypt certs with renewal. No certbot cron, no nginx config, no ALB.

## When to Use

| Scenario | Caddy fit |
|---------|-----------|
| Single service on EC2, one domain | Excellent — zero config |
| Multiple services, path routing | Good — add more `reverse_proxy` blocks |
| Multi-AZ, load balancing across targets | Prefer ALB/ELB — Caddy is one box |
| Blue/green or canary routing | Prefer ALB — no traffic-split features |
| Amazon Linux 2023 (COPR repos fail) | Excellent — single binary sidesteps package manager |

## Minimal Caddyfile

```caddy
api.example.com {
    reverse_proxy localhost:8000
}
```

That's it. Caddy provisions a Let's Encrypt cert on first run and auto-renews. Port 80 is used for the HTTP-01 challenge; Caddy redirects 80 → 443 automatically.

## Installation (pinned binary)

Pin the version via query param — the default download URL is a moving target and unpinned binaries are a supply-chain risk.

```bash
CADDY_VERSION=2.8.4
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=amd64&version=${CADDY_VERSION}" \
    -o /usr/local/bin/caddy
chmod +x /usr/local/bin/caddy
caddy version   # verify
```

Use this path on Amazon Linux 2023 where the COPR repo (`copr.fedorainfracloud.org/coprs/@caddy/caddy/`) is frequently unavailable.

## systemd Unit

```ini
[Unit]
Description=Caddy
Documentation=https://caddyserver.com/docs/
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=notify
ExecStart=/usr/local/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy/Caddyfile
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
```

`After=docker.service` + `Requires=docker.service` ensures the upstream container is up before Caddy starts forwarding.

## Upstream binding

Bind the upstream (Docker, gunicorn, etc.) to `127.0.0.1` only so external traffic cannot bypass TLS:

```bash
docker run -d --restart=always -p 127.0.0.1:8000:8000 myapp:latest
```

Default `-p 8000:8000` binds to `0.0.0.0` and becomes externally reachable if the security group allows port 8000 — a defense-in-depth gap. See `docker-python` for the full pattern.

## Security Group rules

Only 80 and 443 need to be open to the internet. Lock down upstream ports (8000, 3000, etc.) to the VPC or block them entirely — Caddy reaches them via localhost.

| Port | Source | Purpose |
|------|--------|---------|
| 80 | 0.0.0.0/0 | HTTP-01 challenge + HTTPS redirect |
| 443 | 0.0.0.0/0 | TLS termination |
| 22 | admin CIDR or SSM-only | SSH (prefer SSM) |
| 8000+ | (none) | Localhost-only upstream |

## SSM deployment pattern

Deploying Caddy via `aws ssm send-command` avoids SSH keys and works well for "fix live, then codify":

```bash
aws ssm send-command \
  --instance-ids i-0abc \
  --document-name AWS-RunShellScript \
  --parameters 'commands=[
    "curl -fsSL \"https://caddyserver.com/api/download?os=linux&arch=amd64&version=2.8.4\" -o /usr/local/bin/caddy",
    "chmod +x /usr/local/bin/caddy",
    "mkdir -p /etc/caddy",
    "printf \"api.example.com {\\n    reverse_proxy localhost:8000\\n}\\n\" > /etc/caddy/Caddyfile",
    "systemctl daemon-reload",
    "systemctl enable --now caddy"
  ]'
```

**Heredoc pitfall**: `\n` inside a bash heredoc passed through SSM's JSON `commands` array gets mangled by the JSON parser (observed as `cat: {n: No such file or directory`). Use `printf 'line1\nline2\n' > file` instead of `cat <<EOF`.

## Verification

```bash
curl -I https://api.example.com                            # HTTP/2 200
curl -I http://api.example.com | grep -i location          # 308 → https://
echo | openssl s_client -connect api.example.com:443 2>/dev/null | openssl x509 -noout -issuer -dates   # Let's Encrypt, ~90 days
```

## Cost comparison

| Option | Monthly cost | Setup effort |
|--------|-------------:|--------------|
| Caddy on EC2 (t3.small) | ~$15 (EC2 only) | ~5 min |
| nginx + certbot + cron | Same EC2 cost | ~30 min, more moving parts |
| ALB + ACM | +~$20 (ALB) + data | ~15 min, requires VPC/target group |

For single-service deployments, Caddy saves ~$20/month vs ALB and is simpler than nginx+certbot.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Unpinned Caddy binary download | Pin with `?version=X.Y.Z` query param |
| Running Caddy + another process on port 80 | Stop nginx/httpd before `systemctl start caddy` |
| Heredoc for Caddyfile inside SSM `commands` array | `printf '...\n' > /etc/caddy/Caddyfile` |
| Docker `-p 8000:8000` behind Caddy | `-p 127.0.0.1:8000:8000` — block external bypass |
| Manual `certbot renew` cron | Caddy auto-renews — no cron needed |
| Opening the upstream port (8000) in the SG | Only 80/443 open; upstream stays localhost |
| COPR/yum install on Amazon Linux 2023 | Single binary download — avoids repo flakiness |

## When to Graduate to ALB

Move to ALB when any of these apply: (1) multiple EC2 targets need load balancing, (2) WAF integration required, (3) you need path- or header-based traffic splits, (4) blue/green or canary deploys, (5) >1 availability zone. For everything else, Caddy is lighter and cheaper.

## Related

- `docker-python` — localhost binding behind reverse proxy
- `aws-security-hardening` — Secrets Manager validation, SSM live-fix pattern
- `aws-cicd-patterns` — CI/CD for EC2 deploys
