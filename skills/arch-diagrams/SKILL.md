---
name: arch-diagrams
description: Architecture visualization patterns using Mermaid and ASCII diagrams. Use for service flows, sequence diagrams, C4 models, decision matrices, or expressing architectural ideas visually.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/arch-diagrams
updated: 2026-04-18
---

# Architecture Diagrams

Patterns for expressing architectural ideas visually.

## Diagram Selection

| Need to Show | Use | Tool |
|--------------|-----|------|
| Service dependencies | Flowchart | Mermaid |
| Request/response timing | Sequence | Mermaid |
| System boundaries | C4 Context | Mermaid |
| Internal architecture | C4 Container | Mermaid |
| Quick inline sketch | ASCII Box | Text |
| Option comparison | Decision Matrix | Table |

## Quick Syntax Reference

**Mermaid Flowchart:** `flowchart TD` → `A[Node] --> B[Node]`

**Mermaid Sequence:** `sequenceDiagram` → `A->>B: Message`

**C4 Model:** `C4Context` or `C4Container` → `Person()`, `System()`, `Container()`

**ASCII Box:** `┌───┐ │ │ └───┘` with `───▶` arrows

## Best Practices

1. **Start simple** - ASCII first, Mermaid if complexity warrants
2. **Label everything** - Unlabeled arrows are ambiguous
3. **Show data flow** - Arrows indicate who initiates
4. **Group related** - Use subgraphs for logical boundaries

## Hybrid ASCII + Mermaid

Use ASCII art for spatial layouts (UI wireframes, page structure) and Mermaid for sequential flows (user journeys, data flow). Each tool applied to its strength — ASCII shows position, Mermaid shows order.

See `reference.md` for complete syntax, examples, and advanced patterns.

## Table Patterns for Multi-Command Workflow Docs

Tables are a distinct visualization tool from diagrams, and picking the right shape changes how fast cold readers parse a system.

| Table shape | What it reveals | Use for |
|-------------|-----------------|---------|
| **Taxonomic** (flat category list) | Completeness of a set | Listing alternatives, feature matrices |
| **Sequenced** (temporal ordering) | "What comes when" | Disambiguating workflow commands, phased rollouts, lifecycle stages |
| **Artifacts** (producer → consumer) | Hidden dependency chains and silent failure modes | Multi-command workflows, data pipelines, agent handoffs |

**Sequenced tables disambiguate better than taxonomic ones** when commands or concepts feel interchangeable. Reframing three ambiguous options as "session → weekly review → housekeeping" clicks faster than a flat category list.

**Artifacts tables** (3 columns: artifact / producer / consumers) make it explicit when skipping one step silently degrades downstream steps. For workflow docs where commands hand state off to each other, this is often the single most useful table in the document — it surfaces failure modes that prose buries. Pair with a sequence diagram (Mermaid) when the temporal order also matters.
