# Apple Foundation Models -- Examples

All Swift code examples for the patterns described in SKILL.md.

## Availability Checking

```swift
import FoundationModels

// Availability varies by device and region; check before attempting generation
func checkAIAvailability() -> Bool {
    guard #available(iOS 26, watchOS 26, *) else { return false }
    return LanguageModelSession.isAvailable
}

// Graceful feature gating
@available(iOS 26, watchOS 26, *)
struct CoachingView: View {
    var body: some View {
        if LanguageModelSession.isAvailable {
            AICoachingView()
        } else {
            TemplateCoachingView()  // Pre-written fallback
        }
    }
}
```

## Basic Text Generation

```swift
@available(iOS 26, *)
class BreathCoach {
    private var session: LanguageModelSession

    init() {
        session = LanguageModelSession(
            instructions: """
            You are a calm, supportive breathing coach. Keep responses under 100 words.
            Focus on encouragement and gentle guidance. Never give medical advice.
            Reference the user's biometric data when provided.
            """
        )
    }

    func generateGuidance(
        heartRate: Double,
        sessionMinutes: Int,
        pattern: String
    ) async throws -> String {
        let prompt = """
        The user just completed \(sessionMinutes) minutes of \(pattern) breathing.
        Their heart rate is \(Int(heartRate)) bpm.
        Give brief, encouraging feedback.
        """
        let response = try await session.respond(to: prompt)
        return response.content
    }
}
```

## Structured Output with @Generable

```swift
import FoundationModels

// @Generable produces typed output, not free-form text
@Generable
struct BreathingRecommendation {
    @Guide(description: "Breathing pattern name",
           options: ["box", "4-7-8", "coherence", "resonance"])
    var pattern: String

    @Guide(description: "Duration in minutes", range: 3...20)
    var durationMinutes: Int

    @Guide(description: "One sentence explanation of why this pattern")
    var rationale: String
}

// Usage
func recommendPattern(
    currentHRV: Double,
    recentStressLevel: String
) async throws -> BreathingRecommendation {
    let session = LanguageModelSession(
        instructions: "Recommend breathing patterns based on biometric data."
    )
    let prompt = """
    HRV: \(Int(currentHRV))ms SDNN. Stress level: \(recentStressLevel).
    Recommend the best breathing pattern.
    """
    return try await session.respond(to: prompt, generating: BreathingRecommendation.self)
}
```

## Token Management (4096 Limit)

```swift
class ManagedCoachSession {
    private var session: LanguageModelSession
    private var turnCount = 0
    private let maxTurns = 5  // Keep conversation short

    // Strategy: Reset session periodically to avoid hitting token limit
    func respond(to userMessage: String) async throws -> String {
        turnCount += 1

        if turnCount > maxTurns {
            // Summarize and reset
            let summary = try await session.respond(
                to: "Summarize our conversation in 2 sentences."
            )
            session = LanguageModelSession(
                instructions: """
                You are a breathing coach. Previous context: \(summary.content)
                """
            )
            turnCount = 1
        }

        let response = try await session.respond(to: userMessage)
        return response.content
    }
}
```

## Tool Calling (Model Invokes App Functions)

```swift
// Define tools the model can call
@Generable
struct RequestBiometrics {
    @Guide(description: "Which metric to fetch",
           options: ["heartRate", "hrv", "respiratoryRate"])
    var metric: String
}

// In practice: parse model output, call local function, feed result back
func handleToolCall(_ request: RequestBiometrics) async -> String {
    switch request.metric {
    case "heartRate":
        let hr = await healthManager.currentHeartRate()
        return "Current heart rate: \(Int(hr)) bpm"
    case "hrv":
        let hrv = try? await healthManager.fetchLatestHRV()
        return "Latest HRV: \(Int(hrv ?? 0))ms SDNN"
    default:
        return "Metric not available"
    }
}
```

## Fallback: MLX for Pre-iOS 26

```swift
// MLX is Apple's ML framework for running quantized models on Apple Silicon
// Use as fallback when Foundation Models is unavailable
import MLX

class MLXFallbackCoach {
    private var model: MLXModel?

    func loadModel() async throws {
        // Load a quantized model (e.g., Llama 3.2 1B 4-bit)
        // Requires ~1GB RAM -- feasible on iPhone, marginal on Watch
        model = try await MLXModel.load(from: "models/llama-3.2-1b-4bit")
    }

    func generate(prompt: String) async throws -> String {
        guard let model else { throw CoachError.modelNotLoaded }
        return try await model.generate(prompt: prompt, maxTokens: 200)
    }
}
```

## AI Provider Abstraction

```swift
// Abstract over AI backends for testability and fallback
protocol AICoachProvider: Sendable {
    func generateGuidance(context: CoachingContext) async throws -> String
    var isAvailable: Bool { get }
}

struct FoundationModelsProvider: AICoachProvider { ... }
struct MLXProvider: AICoachProvider { ... }
struct TemplateProvider: AICoachProvider {
    // No AI -- returns pre-written templates based on context
    var isAvailable: Bool { true }  // Unconditionally available
}

// Chain of fallbacks
class AICoachChain {
    let providers: [AICoachProvider]

    func generateGuidance(context: CoachingContext) async throws -> String {
        for provider in providers where provider.isAvailable {
            return try await provider.generateGuidance(context: context)
        }
        throw CoachError.noProviderAvailable
    }
}
```
