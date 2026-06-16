# Sprint Planning Examples

Real-world estimation examples, evidence tables, and tracking templates.

## Multi-Agent Review Overhead Evidence

| Ticket | Implementation | Actual Total | Overhead % | Review Type |
|--------|---------------|-------------|------------|-------------|
| a prior ticket | 14h | 24h | +71% | 3 cycles, 4 specialists |
| a prior ticket | 8h | 14h | +75% | 2 cycles, frontend |
| a prior ticket | 4h | 5h | +25% | 1 cycle, quick fix |

**Observed pattern:** Feature tickets with backend/frontend consistently add ~75% overhead. Simple chores add ~25%.

## Estimation Accuracy Tracking Template

Use this template to track estimation accuracy across sprints:

```markdown
## Sprint N — Estimation Accuracy

| Ticket | Estimated | Actual | Variance | Root Cause |
|--------|-----------|--------|----------|------------|
| FEAT-XXX | Xh | Yh | +Z% | [e.g., review overhead not estimated] |
| CHORE-XXX | Xh | Yh | -Z% | [e.g., existing implementation found] |

### Estimation Accuracy by Sprint

| Sprint | Accuracy | Notes |
|--------|----------|-------|
| Sprint 2 | 58% | Before 75% review overhead formula |
| Sprint 3 | 82% | 75% formula applied; M+ tickets had review overhead included in estimates |

### Sprint Summary
- **Total estimated:** Xh
- **Total actual:** Yh
- **Overall variance:** Z%
- **Top variance driver:** [review overhead / scope creep / existing code]

### Corrective Actions
- [ ] Applied 75% review multiplier for feature tickets? (if variance >30%)
- [ ] Ran Phase 3.5 codebase validation? (if scope underestimated)
```
