# Composing an Agent

An agent is a domain specialist, but it carries almost no knowledge of its own. Its expertise is the **union of the skills it loads** — declared in its `skills:` frontmatter (the YAML block at the top of the file) and pulled into context when the agent activates. Change the skill list, change the specialist.

```
Request → orchestrator routes to an agent → agent + its skills load → task runs
```

This is what keeps the roster cheap to extend: a new capability is usually a new skill wired into an existing agent, not a new agent.

## Agent Frontmatter

```yaml
---
name: aiee-backend-engineer          # Required — unique identifier, aiee- prefix
description: >-                      # Required — routing contract; include "Call for..." guidance
  Python, PHP/Laravel, and TypeScript/NestJS backend engineer for API design,
  database modeling, and system integration. Call for FastAPI architecture,
  PostgreSQL schema design, DDD patterns, or service-layer decisions.
model: sonnet                        # Optional — model preference (sonnet, opus, haiku)
color: green                         # Optional — display color in agent listings
tools: Read, Grep, Glob, Bash        # Optional — tool allowlist; omit to grant all tools
skills: arch-ddd, fastapi-patterns, dev-standards  # Optional — comma-separated skill names
---
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | Must use the `aiee-` prefix |
| `description` | Yes | The routing contract: the text the orchestrator reads to decide when to summon the agent. Include "Call for..." |
| `model` | No | Defaults to the orchestrator's model if omitted |
| `color` | No | Visual hint in CLI agent listings |
| `tools` | No | Narrow to least privilege for restricted agents; omit to grant all tools |
| `skills` | No | Comma-separated skill directory names; this is what defines the agent's expertise |

## Adding a New Agent

1. **Confirm it's a new role, not a new skill set** — if an existing agent could own the work by loading one more skill, add the skill instead.
2. **Create the file** — `agents/aiee-<role>.md`
3. **Write the frontmatter** — `name`, `description`, and the `skills:` list that composes its expertise.
4. **Write the body**:
   - **Expertise Scope** — the technologies and patterns it knows
   - **When to Call** — concrete scenarios where it adds value
   - **NOT For** — out-of-scope tasks, so the orchestrator avoids misrouting
5. **Assign it to a group** — add the agent to the matching group's `agents` list in [`groups.json`](../groups.json) so it installs with `npx aiee-skills install --groups=<group>`. An agent in no group is only included in a full install.
6. **Update the main README** — add a row to the Team table.
7. **Open a pull request.**

## Conventions

- **Naming** — all agents use the `aiee-` prefix (e.g. `aiee-security-engineer`).
- **Description** — written in the caller's vocabulary; "Call for..." guides automatic routing.
- **NOT For section** — state what the agent should not handle; it's the cheapest way to stop misrouting.
- **Skills** — only reference skills that exist in `skills/`, and verify names match directory names exactly. A typo here silently drops the skill.
- **Grouping** — each agent belongs to exactly one group in `groups.json`; installing that group installs the agent alongside its skills.
