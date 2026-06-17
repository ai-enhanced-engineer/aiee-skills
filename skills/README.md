# Writing a Skill That Earns Its Place

A skill encodes the decisions a senior engineer makes without thinking, so an agent can make them too. It's a directory with one required file, `SKILL.md`, that an agent loads on demand when a task calls for it.

The hard part isn't writing one — it's writing one that stays legible as the library grows. This guide is the rubric.

## The Five Disciplines

Every skill here is judged against five concerns, in order of importance:

1. **Shape** — partition by urgency, not length. Act-now rules go in `SKILL.md`; reference depth moves to `reference.md`; runnable code moves to `examples.md`. A reader who needs the decision shouldn't have to scroll past the appendix to find it.
2. **Findability** — the `description` field is the routing contract. The agent reads it and nothing else to decide whether to load the skill — the body, the title, and any other field are inert to the router. Write it in the *caller's* vocabulary (the symptoms and tasks that should trigger it), not the author's.
3. **Voice** — describe a consequence, not a command. The reader is a reasoning engine, not a recruit. Replace `always`/`never`/`must` with the outcome: *"Skipping the index makes this query table-scan at scale"* beats *"Always add an index."*
4. **Portability** — write it to leave home. No project-specific paths, client names, or repo assumptions in `SKILL.md`. Anything local belongs in the optional sibling files, never the core.
5. **Evolution** — new skill or update? If you can't write a one-sentence `description` that separates the candidate from every skill already in `skills/`, it's an update to an existing one.

The two failure modes these guard against: **bloat** (one skill grows into an essay nobody loads) and **sprawl** (hundreds of thin skills nobody can find).

## File Structure

Each skill lives in its own directory under `skills/`:

```
skills/<skill-name>/
├── SKILL.md        # Required — mental model + decision rules (the act-now layer)
├── reference.md    # Optional — API patterns, checklists, lookup tables
└── examples.md     # Optional — annotated, runnable code samples
```

`SKILL.md` is the entry point and must exist. Keep its body in the **100–450 word** band: under ~100 is a stub, over ~600 is a sign depth should move to `reference.md`.

## SKILL.md Frontmatter

```yaml
---
name: frontend-angular              # Required — matches the directory name exactly
description: >-                     # Required — the routing contract; end with "Use for..." / "Use when..."
  Modern Angular 21+ patterns including signals, standalone components,
  zoneless change detection, and new control flow syntax. Use for Angular
  architecture decisions or implementing components with the latest APIs.
allowed-tools: Read, Grep, Glob     # Optional — restrict which tools the skill may use
kb-sources:                         # Optional — source wiki article(s) this skill distills
  - wiki/software-engineering/frontend-angular
updated: 2026-06-03                 # Optional — last-updated date (YYYY-MM-DD)
---
```

| Field | Required | Notes |
|-------|----------|-------|
| `name` | Yes | Must match the directory name exactly |
| `description` | Yes | The routing contract — what Claude matches against to auto-load the skill. Write in the caller's vocabulary; end with a "Use for..." / "Use when..." clause |
| `allowed-tools` | No | Comma-separated tool allowlist for the skill |
| `kb-sources` | No | Internal provenance: path(s) to the knowledge-base article(s) this skill distills; irrelevant to external readers |
| `updated` | No | Last-updated date, `YYYY-MM-DD` |

## Adding a New Skill

1. **Apply the Evolution test** — confirm it's distinct from every existing skill before creating a directory.
2. **Create the directory** — `skills/<skill-name>/`
3. **Write SKILL.md** — frontmatter + the act-now layer; move depth to `reference.md` / `examples.md` if needed.
4. **Wire it to an agent** — add the skill name to the `skills:` field of the relevant agent(s).
5. **Assign it to a group** — add the skill name to the right group in [`groups.json`](../groups.json) so it installs via `npx aiee-team install --groups=<group>`. A skill in no group is only included in a full install (`npx aiee-team --list-groups` flags ungrouped skills).
6. **Update the main README** — add a row to the relevant group's coverage if needed.
7. **Open a pull request.**

## Conventions

- **Naming** — `kebab-case`, prefixed by domain (`frontend-*`, `gcp-*`/`aws-*`/`azure-*`, `react-native-*`); the prefix usually hints the group.
- **Grouping** — every skill belongs to exactly one group in `groups.json`.
- **No runtime code** — skills are documentation an agent reads, not scripts it executes.
