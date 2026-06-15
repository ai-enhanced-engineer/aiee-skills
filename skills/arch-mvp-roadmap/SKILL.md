---
name: arch-mvp-roadmap
description: MVP definition, MoSCoW prioritization, and phased delivery planning. Use for scoping minimum viable products, ordering features by value and dependency, or creating implementation roadmaps.
kb-sources:
  - wiki/software-engineering/arch-mvp-roadmap
updated: 2026-05-21
---

# MVP & Roadmap Planning

Patterns for defining what to build first and in what order.

## Core Principle

> **"Build the smallest thing that proves value."**

An MVP is not a half-built product—it's a complete vertical slice that validates assumptions.

## MoSCoW Prioritization

| Priority | Definition | Criteria |
|----------|------------|----------|
| **Must Have** | System doesn't function without | Core journey incomplete, no workarounds |
| **Should Have** | Important but not blocking | Workarounds exist, high value |
| **Visible as Placeholder** | UI ships visible but non-functional at launch; wired up in a later phase | Surface needed for UX coherence/nav completeness; functionality deferred |
| **Could Have** | Nice to have | Enhances experience, low priority |
| **Won't Have** | Explicitly out of scope | Prevents scope creep, document for later |

### Visible-as-Placeholder Tier — When To Use

Standard MoSCoW leaves a gap: features that need to be *visible* at launch but not *functional* yet. Naming this tier explicitly makes the app feel coherent without over-promising.

**Use Visible-as-Placeholder (not Could-have) when**:
- Removing the surface would leave a hole in nav, settings, or a flow users will notice
- A linked feature elsewhere references this surface (deep links, empty-state CTAs, dashboard tiles)
- The functional version is planned for a known later phase

**Use Could-have instead when** the feature's absence is invisible or there is no committed plan to ship it.

See `reference.md § Visible-as-Placeholder` for a worked marketplace example with five surfaces.

## MVP Scoping Checklist

- [ ] Single complete user journey end-to-end
- [ ] Validates core assumption/hypothesis
- [ ] Deployable and demonstrable
- [ ] Measurable success criteria defined
- [ ] No features without corresponding tests

## Phased Delivery Pattern

Each phase should:
1. Build on previous phase (not parallel development)
2. Be independently deployable
3. Have clear success criteria
4. Include tests for new functionality

## Dependency Ordering

Order features by:

| Factor | Question |
|--------|----------|
| **Technical** | What must exist first? |
| **Value** | What provides most value soonest? |
| **Risk** | What validates riskiest assumptions? |
| **Learning** | What teaches us most about the domain? |

## Roadmap Template

| Phase | Features | Success Criteria | Dependencies |
|-------|----------|------------------|--------------|
| MVP | [Must-haves] | [Measurable outcomes] | None |
| Phase 2 | [Should-haves] | [Measurable outcomes] | MVP complete |
| Phase 3 | [Could-haves] | [Measurable outcomes] | Phase 2 complete |

## Extensible Algorithm Design

Design algorithms for evolution using stable interfaces. MVP delivers value immediately while building ground truth for future ML phases. Evolution path: Deterministic (MVP) → Statistical (Phase 2) → ML/embeddings (Phase 3) → LLM-powered (Phase 4). Switch implementations via dependency injection against a stable Protocol interface; MVP uses zero ML infrastructure.

See `reference.md § Extensible Algorithm Design` for the interface pattern, key principles, and workstream-split sizing. See `examples.md` for sample roadmaps.
