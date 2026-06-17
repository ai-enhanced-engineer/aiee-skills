<h1 align="center">The AI Enhanced Engineer's Team</h1>

<p align="center">
  <img src="assets/images/cover.png" alt="The AIEE Team — a human orchestrator at center wired into a constellation of specialist agents" width="760" />
</p>

<p align="center">
  <a href="https://github.com/ai-enhanced-engineer/aiee-team/releases"><img src="https://img.shields.io/github/v/release/ai-enhanced-engineer/aiee-team" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
  <a href="https://github.com/ai-enhanced-engineer/aiee-team/actions"><img src="https://img.shields.io/github/actions/workflow/status/ai-enhanced-engineer/aiee-team/release.yml?branch=main" alt="Build Status" /></a>
</p>

<p align="center">
  🌐 <a href="https://aiee.io">Website</a> · 📚 <a href="https://aiee.io/learn">Field Guides</a> · 📧 <a href="https://aienhancedengineer.substack.com/">Subscribe</a>
</p>

The skill library behind production-grade AI engineering — **11 specialist agents and 102 skills**, the open starter set from AIEE's *Agent Skills* series. Clone it, read the code, reproduce the system.

---

## Table of Contents

- [What This Is](#what-this-is)
- [Skills as a Living System](#skills-as-a-living-system)
- [Quick Start](#quick-start)
- [Install by Technology](#install-by-technology)
- [The Team](#the-team)
- [The Skills](#the-skills)
- [Commands](#commands)
- [How It Fits](#how-it-fits)
- [Repository Structure](#repository-structure)
- [Contributing](#contributing)
- [License](#license)

---

## What This Is

Ask Claude to build an API and it writes 500 lines of FastAPI in 30 seconds: no tests, no migration rollback, no SQL injection guard. The model can code; it just defaults to the average of everything it was trained on. Production needs the opposite: the specific decisions a senior engineer makes without thinking.

A **skill** encodes those decisions. It is a directory with one required file, `SKILL.md`, carrying a mental model and its decision rules. An agent loads the skills a task needs, when it needs them — the same RAG mechanic that keeps generated code at production standards instead of internet-average defaults. Loading skills on demand rather than inlining every standard into every agent saves roughly 70% of the context an always-on approach would burn.

This repository is that library in the open: the actual skills and the agents that consume them, so you can read the craft, not just the claims. It is the **curated, generalizable subset** — 102 skills and 11 agents — distilled from AIEE's production engineering practice.

## Skills as a Living System

A skill library isn't written once. It's a living system — designed to stay legible, maintained to stay honest. Every skill here follows the same five disciplines the [*Agent Skills* series](https://aienhancedengineer.substack.com/) lays out:

- **Shape** — partition by urgency. Act-now rules go in `SKILL.md`; depth moves to optional `reference.md` and `examples.md`.
- **Findability** — the `description` field is the routing contract. The agent reads it and nothing else to decide whether to load the skill, so it's written in the caller's vocabulary.
- **Voice** — describe a consequence, not a command. The reader is a reasoning engine, not a recruit.
- **Portability** — no project-specific paths in `SKILL.md`. A skill is written to leave home.
- **Evolution** — if you can't write a one-sentence description that separates a candidate from every skill already here, it's an update, not a new skill.

The two failure modes these guard against: **bloat** (one skill grows into an essay nobody loads) and **sprawl** (hundreds of thin skills nobody can find).

## Quick Start

**Plugin marketplace** (recommended for Claude Code):

```shell
/plugin marketplace add ai-enhanced-engineer/aiee-team
/plugin install aiee-team@aiee-team
/agents   # verify the specialists are listed
```

**npx** (no marketplace — copies into a `.claude` directory):

```shell
npx aiee-team install              # into ./.claude for this project
npx aiee-team install --global     # into ~/.claude for every project
```

Runs straight from GitHub before any npm publish: `npx github:ai-enhanced-engineer/aiee-team install`. Other commands: `--dry-run`, `--force`, `uninstall`, `--help`.

**Local development:** `git clone https://github.com/ai-enhanced-engineer/aiee-team.git` then `claude --plugin-dir ./`. JSON manifests validate with `just validate`.

## Install by Technology

The pack is grouped by technology, and each group brings its **specialist agent(s) plus skills**. `dev-practices` is shared by every agent, so it's always included. A full install (no `--groups`) gets all 11 agents and 102 skills.

```shell
npx aiee-team --list-groups                              # groups, skill + agent counts
npx aiee-team install --groups=frontend-web,backend-api  # install just those
```

| Group | Skills | Agents | Covers |
|-------|:--:|:--:|--------|
| `frontend-web` | 25 | aiee-frontend-engineer | React / Angular / Svelte / Next.js, CSS, forms, web a11y |
| `mobile` | 20 | aiee-mobile-engineer, aiee-ios-engineer | React Native / Expo, iOS / Swift / SwiftUI, watchOS |
| `backend-api` | 20 | aiee-backend-engineer, aiee-data-engineer | FastAPI / NestJS / Laravel, databases, ORMs, auth |
| `cloud-infra` | 17 | aiee-devops / sre / observability / security-engineer | GCP / AWS / Azure, Terraform, CI/CD, observability |
| `architecture` | 7 | aiee-systems-architect | DDD, ADRs, diagrams, events, MVP roadmap, compliance |
| `python-core` | 5 | aiee-python-expert-engineer | Modern Python, Poetry, Docker, ruff |
| `dev-practices` | 4 | _(core — always installed)_ | Standards, debugging, performance, test standards |
| `ai-ml` | 4 | _(skills only)_ | Vision/video, on-device Apple AI, LangChain + Azure OpenAI |

## The Team

Eleven specialists, each composed from the skills it loads. Claude routes to them automatically, or you can name one: *"Use the aiee-backend-engineer agent to design the auth API."*

| Agent | Role |
|-------|------|
| `aiee-backend-engineer` | Python, PHP/Laravel, and TypeScript/NestJS — API design, database modeling, system integration |
| `aiee-data-engineer` | PostgreSQL/MySQL schema design, migrations, RLS security, query optimization |
| `aiee-devops-engineer` | CI/CD pipelines, Infrastructure as Code, deployment automation, container orchestration |
| `aiee-frontend-engineer` | Svelte 5, SvelteKit, Angular 21+, and React web engineering |
| `aiee-ios-engineer` | Native iOS + watchOS — Swift 6, SwiftUI, HealthKit, Apple Foundation Models, on-device AI |
| `aiee-mobile-engineer` | React Native + Expo for iOS/Android |
| `aiee-observability-engineer` | Monitoring, alerting, logging, distributed tracing |
| `aiee-python-expert-engineer` | Modern Python architecture, async patterns, performance, code review |
| `aiee-security-engineer` | Threat modeling, penetration testing, compliance (SOC 2, GDPR, OWASP) |
| `aiee-sre-engineer` | Operational readiness, runbooks, disaster recovery, incident response |
| `aiee-systems-architect` | Architecture reviews, service design, API contracts, legacy assessments |

## The Skills

102 skills across the eight groups above, each a `SKILL.md` directory (plus optional `reference.md` / `examples.md`). Browse them live:

```shell
npx aiee-team --list-groups      # every group and its skill count
ls skills/                       # the full directory of 102 skills
```

The complete skill→group and agent→group mapping lives in [`groups.json`](groups.json).

## Commands

Two slash commands run quality-gated implementation cycles:

| Command | Purpose |
|---------|---------|
| `/aiee-backend` | Backend implementation with 2-phase gated review (quality + security → tests) |
| `/aiee-frontend` | Frontend implementation with 2-phase gated review (architecture + security → tests) |

Each takes a `fix:`, `feat:`, or `refactor:` task, implements it with the matching specialist, runs parallel reviews, then a test-enforcement gate (80% coverage), iterating up to three cycles. See [`commands/`](commands/) for the full workflow.

## How It Fits

This repo is the runnable companion to AIEE's writing and teaching:

- **The [*Agent Skills* series](https://aienhancedengineer.substack.com/)** dissects how a skill earns its place, where new skills come from, and who keeps the library honest. This repo is the starter set behind it — read the articles for the *why*, read the code for the *how*.
- **The [field guides](https://aiee.io/learn)** teach agents, harness engineering, and agentic design patterns from first principles, with runnable code. The skills here are the production layer those guides point toward.

## Repository Structure

```
aiee-team/
├── .claude-plugin/       # plugin.json + marketplace.json (Claude Code plugin)
├── agents/               # 11 specialist agent definitions
├── bin/install.js        # npx installer
├── commands/             # slash commands (/aiee-backend, /aiee-frontend)
├── skills/               # 102 skills, one SKILL.md directory each
├── groups.json           # skill + agent → install-group taxonomy
├── justfile              # dev tasks (just validate, just skills, ...)
└── package.json          # npm package (bin + files for npx)
```

## Contributing

| I want to... | Guide |
|--------------|-------|
| Add or modify an **agent** | [`agents/README.md`](agents/README.md) |
| Add or modify a **skill** | [`skills/README.md`](skills/README.md) |

After changes, update the tables in this README **and** the mapping in [`groups.json`](groups.json) so new agents and skills are reachable via `npx aiee-team install --groups=...`. Run `npx aiee-team --list-groups` to confirm nothing is left ungrouped.

## License

MIT — see [LICENSE](LICENSE).

---

*Engineering precision, not slop. Domain expertise on demand, for engineers building real systems.*

📬 [Subscribe](https://aienhancedengineer.substack.com/) for production AI engineering — real patterns, real code, real lessons.
