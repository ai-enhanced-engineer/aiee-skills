# Apple Foundation Models -- Reference

Detailed explanations for concepts summarized in SKILL.md.

## Availability Checking

Foundation Models availability depends on three factors:

1. **OS version** -- iOS 26+ and watchOS 26+ are required. Use `#available(iOS 26, watchOS 26, *)` compile-time checks.
2. **Device capability** -- Not all devices running iOS 26 have the on-device model. `LanguageModelSession.isAvailable` is the runtime truth.
3. **Region** -- Apple may restrict availability by locale.

A two-layer check (compile-time `@available` plus runtime `isAvailable`) ensures the app compiles on older SDKs and degrades gracefully on unsupported hardware. The fallback is typically a pre-written template view with no AI dependency.

## Token Management Strategy

The on-device model enforces a 4096-token context window covering both input and output across all turns. In practice this means multi-turn conversations exhaust the budget after roughly 5 exchanges.

The recommended approach is **summarize-and-reset**:

1. Track a turn counter.
2. When the counter exceeds a threshold (~5 turns), ask the current session to summarize the conversation in 2 sentences.
3. Create a fresh `LanguageModelSession` with the summary injected into the system instructions.
4. Reset the counter.

This preserves conversational continuity while staying within the token budget. The threshold is tunable -- shorter turns allow more exchanges before reset.

## Tool Calling Mechanics

Foundation Models does not expose a formal tool-calling API like cloud LLMs. Instead, the pattern uses `@Generable` structs as typed requests:

1. Define a `@Generable` struct representing the tool call (e.g., `RequestBiometrics` with a `metric` field constrained to known options).
2. Ask the model to generate an instance of that struct given conversational context.
3. The app inspects the generated struct, calls the corresponding local function (HealthKit query, sensor read, etc.), and formats the result as a string.
4. Feed the result string back into the session as the next user turn.

This gives type-safe, constrained tool invocation without relying on free-form JSON parsing.

## AI Tier Detection Pattern

The `detectAITier()` pattern selects the best available AI backend at runtime using a priority chain:

1. **Foundation Models** (primary) — Check `#if canImport(FoundationModels)` at compile time, then `LanguageModelSession.isAvailable` at runtime. This is the preferred provider for iOS 26+ devices with the on-device model.
2. **MLX** (secondary) — Check for Apple Silicon and sufficient memory (~1GB for a 4-bit quantized model). Covers iOS 18-25 on recent hardware.
3. **Pre-authored templates** (fallback) — Unconditionally available. No AI dependency. Used on older devices and watchOS without FM support.

The `#if canImport(FoundationModels)` guard ensures the project compiles on Xcode versions that predate the framework. Without it, projects targeting iOS 18+ deployment would fail to compile when Foundation Models headers are referenced.

## MLX Fallback Rationale

MLX is Apple's array framework for running quantized transformer models directly on Apple Silicon. It serves as a **secondary fallback** (not a co-equal provider) for devices that:

- Run iOS versions below 26 (no Foundation Models support)
- Have the OS but lack the on-device model (older hardware)

**For new projects, Foundation Models is the primary implementation target.** MLX serves the gap between "device has Apple Silicon" and "device has FM support."

**Practical constraints:**

- A 4-bit quantized Llama 3.2 1B requires ~1GB RAM -- feasible on recent iPhones.
- Apple Watch memory is too constrained for MLX inference. On watchOS, the fallback path goes directly to pre-written templates rather than MLX.
- MLX models require bundling or downloading the weights, adding app size and first-launch latency considerations.

MLX is appropriate when Foundation Models is unavailable but the device has enough memory for a small quantized model.

## Provider Abstraction Design

The `AICoachProvider` protocol decouples AI generation from any specific backend:

- **FoundationModelsProvider** -- Uses `LanguageModelSession`. Available on iOS 26+ devices with the on-device model.
- **MLXProvider** -- Loads a quantized model via MLX. Available on Apple Silicon devices with sufficient memory.
- **TemplateProvider** -- Returns pre-written strings based on context. Has no AI dependency and is unconditionally available.

The `AICoachChain` iterates providers in priority order, calling the first one whose `isAvailable` returns true. This makes the AI backend swappable without changing calling code, and ensures the app degrades gracefully across the full device spectrum.

The abstraction also simplifies testing: inject a mock provider conforming to `AICoachProvider` to test coaching logic without model inference.
