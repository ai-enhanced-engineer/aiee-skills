# Frontend Design Systems - Reference

## Design System Integration: Brand Preservation Priority

When integrating a design system (Material Design, Carbon, etc.) into an existing site with established brand identity:

**Principle**: Brand preservation > Design system purity

**Warning Signs You're Breaking Brand**:
- Color palette changes drastically (unless explicitly requested)
- Visual hierarchy shifts (what stood out before now blends in)
- Tone/mood changes (playful → corporate, warm → cold)
- User describes it as "aggressive" or "too different"

**Safe Integration Pattern**:
1. **Audit first, don't implement**: Document what would change
2. **Present impact assessment**: "This will change X, Y, Z about the brand"
3. **Get explicit approval**: "Are you okay changing the brand feel?"
4. **Start subtle**: Interaction patterns (hover states, easing curves) before visual redesign
5. **Keep escape hatch**: Make changes easy to revert (separate commits/PRs)

**Case Study**: Acme Corp M3 Integration
- Implemented: Color tokens, tonal elevation, dark mode (technically correct M3)
- Result: "Too aggressive - destroyed brand identity" - full revert
- Kept: 3 subtle changes (hover states, easing curves, FAQ backgrounds)
- Learning: Small UX improvements safer than wholesale design system adoption

---

## Subtle UX Improvements (Low-Risk Enhancement Pattern)

When full design system adoption is too aggressive, apply these low-risk improvements:

**Safe Changes (Unlikely to Break Brand)**:
- **Hover state layers**: 8-12% opacity background on interactive elements
- **Easing curves**: Modern easing functions (e.g., M3's `cubic-bezier(0.2, 0, 0, 1)`)
- **Focus indicators**: Improved keyboard navigation visibility
- **Micro-interactions**: Subtle transitions (200-300ms)

**Risky Changes (High Brand Impact)**:
- Color palette overhauls
- Typography scale changes
- Elevation/shadow system replacements
- Dark mode (unless brand already has one)

**Implementation Strategy**:
1. Implement subtle changes in separate commit
2. Show user: "These 3 small improvements make interactions feel more polished"
3. If approved, keep; if rejected, easy to revert
4. Build trust before proposing larger changes

**Example: Acme Corp M3 Integration**:
```css
/* KEPT - Subtle improvement */
.nav-link:hover {
  background: rgba(255, 255, 255, 0.08); /* M3 state layer */
  transition: all 0.3s cubic-bezier(0.2, 0, 0, 1); /* M3 easing */
}

/* REVERTED - Too aggressive */
:root {
  --md-sys-color-primary: #6750A4; /* Overwrote brand color */
}
```

---

## Post-Build UI Audit Cycle

Catch issues before they ship by running a dedicated audit step after each meaningful UI change. This is a pipeline, not a one-off — all five steps matter:

1. **Ship** the implementation to a branch (don't merge).
2. **Launch an audit agent in the background** (e.g., `aiee-frontend-engineer` or `frontend-accessibility`) while you continue on the next task. The audit runs in parallel with other work, so the review cost is close to zero.
3. **Group findings by severity**: Critical (broken `aria-labelledby`, wrong semantic element) → High (false cursor affordances, missing alt text) → Medium → Low. Triage top-down.
4. **Batch-fix in one commit** per severity tier rather than one PR per finding. Reviewers see the full intent; git history stays readable.
5. **Visual verify with Playwright** before merge (see IntersectionObserver workaround in SKILL.md).

In practice this cycle has caught 20+ issues per page that would otherwise have shipped: broken `aria-labelledby`, wrong semantic elements (`<div>` where `<button>` was needed), and cursor affordances on non-interactive elements. Every one is invisible to the implementer and obvious to an audit agent.
