---
name: apple-foundation-models
description: "Apple Foundation Models framework for on-device AI. LanguageModelSession, @Generable macro, structured output, token management, and availability checking."
kb-sources:
  - wiki/software-engineering/apple-foundation-models
updated: 2026-04-18
---

# Apple Foundation Models

On-device AI using Apple's Foundation Models framework (iOS 26+, now shipping). FM is the primary AI provider; MLX and pre-authored templates serve as fallbacks.

## When to Use

- Generating personalized coaching content on-device
- Structured output from on-device language models
- Managing the 4096-token context limit
- Building AI features that work offline with no cloud dependency

## Core Concepts

### Availability Checking

Foundation Models is available now on supported iOS 26+ / watchOS 26+ devices. Availability varies by device capability and region. A two-layer check — `#if canImport(FoundationModels)` at compile time plus `LanguageModelSession.isAvailable` at runtime — covers both Xcode compatibility and device detection. See `reference.md` for detailed checking patterns.

### Basic Text Generation

`LanguageModelSession` accepts system-level instructions and produces text responses from a prompt. Instructions set the persona and guardrails (e.g., prohibiting medical advice). See `examples.md` for a complete `BreathCoach` implementation.

### Structured Output with @Generable

The `@Generable` macro paired with `@Guide` constraints produces typed Swift structs instead of free-form text. Field-level constraints (options lists, numeric ranges) steer the model toward valid output. See `examples.md` for the `BreathingRecommendation` pattern.

**@Guide constraint gap**: `@Guide(.anyOf(...))` and `@Guide(.range(...))` are NOT available in the current FoundationModels SDK (as of iOS 26.2). Use `@Guide(description: "...")` strings that enumerate valid values, add redundant enumeration in the prompt body, and validate output after `respond(to:generating:)`. Cross-field constraints ("stage 1-4 for ujjayi, 1-2 for viloma") cannot be expressed in `@Generable` — handle them in code with allowlists, range checks, and length caps. Fall through to the deterministic fallback on any validation miss.

**@Generable shadow type pattern**: Keep the FM-coupled `@Generable` struct guarded by `#if canImport(FoundationModels)` + `@available(iOS 26, *)`. Convert at the call site to a plain `Sendable` struct that crosses the protocol boundary. The protocol type has zero FM dependency, so mocks, fallbacks, and tests stay simple:

```swift
#if canImport(FoundationModels)
import FoundationModels

@available(iOS 26, *)
@Generable
struct ReadinessRecommendationDraft {
    // internal (not private) — @Generable macro expansion requires non-private access
    @Guide(description: "Technique ID. Valid: ujjayi, viloma, box, resonance")
    var techniqueID: String
    @Guide(description: "Session length in minutes. Valid: 5, 7, 10, 15, 20")
    var sessionMinutes: Int
}
#endif

// Plain Sendable crosses the protocol boundary — no FM import needed in consumers
struct ReadinessRecommendation: Sendable {
    let techniqueID: String
    let sessionMinutes: Int
    let rationale: String
}
```

**@Generable access requirement**: The macro expansion references the type by name and fails with `private` types. Promote to file-scope `internal` (still safe inside `#if canImport(FoundationModels)`).

### Token Management (4096 Limit)

The on-device model has a 4096-token context window. A summarize-and-reset strategy keeps multi-turn conversations within budget by periodically condensing history into a fresh session. See `reference.md` for the rationale and `examples.md` for the `ManagedCoachSession` implementation.

### Tool Calling

Structured output doubles as a tool-calling mechanism: the model produces a typed request (e.g., `RequestBiometrics`), the app fulfills it locally, and feeds the result back. See `reference.md` for mechanics and `examples.md` for the pattern.

### MLX Fallback (Secondary)

MLX is the **secondary** fallback for devices that run Apple Silicon but lack Foundation Models support (iOS 18-25). A ~1GB quantized Llama fits on iPhone but is marginal on Apple Watch due to memory constraints. For new projects, FM is the primary implementation target; MLX serves devices that can't run FM. See `reference.md` for when to prefer MLX vs. templates.

### Provider Abstraction

A protocol-based provider chain (`AICoachProvider`) abstracts over Foundation Models, MLX, and pre-written templates. The chain tries each provider in order and falls back automatically. See `examples.md` for the full implementation.

### AI Tier Detection

A `detectAITier()` pattern selects the best available AI backend at runtime: FM (primary) → MLX (secondary) → pre-authored templates (fallback). Guarding FM-specific code with `#if canImport(FoundationModels)` ensures compilation on Xcode versions that predate the framework. See `examples.md` for the implementation and `reference.md` for the tier selection rationale.

## Anti-Patterns

| Anti-Pattern | Preferred Pattern |
|---|---|
| Assuming Foundation Models is available everywhere | Check `LanguageModelSession.isAvailable` at runtime |
| Long multi-turn conversations | Reset session after ~5 turns (4096 token limit) |
| Medical or diagnostic language in prompts | System instructions that prohibit medical advice |
| Loading MLX models on watchOS | Memory too constrained; use Foundation Models or templates |
| Hardcoding model names | Use provider abstraction for swappable backends |
| Treating MLX as co-equal to FM | FM is the primary provider; MLX is fallback for devices without FM support |
| Using `@Guide(.anyOf(...))` or `@Guide(.range(...))` | Not in current SDK — use `@Guide(description:)` with enumerated values + post-generation validators |
| `private` access on `@Generable` struct | Macro expansion fails — promote to file-scope `internal` inside `#if canImport(FoundationModels)` |
| Returning `@Generable` type across protocol boundary | Expose plain `Sendable` struct at boundary; convert from shadow draft type at call site |

## Key References

- [WWDC25: Foundation Models deep dive](https://developer.apple.com/videos/play/wwdc2025/301/)
- [AzamSharp: Foundation Models Guide](https://azamsharp.com/2025/06/18/the-ultimate-guide-to-the-foundation-models-framework.html)
- [Apple ML Research: Core ML Llama](https://machinelearning.apple.com/research/core-ml-on-device-llama)

## Sibling Files

- `reference.md` -- Detailed explanations of availability, tokens, tool calling, MLX rationale, provider design
- `examples.md` -- All Swift code examples with section headers for navigation
