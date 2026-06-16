---
name: react-native-ml-inference
description: TensorFlow.js on-device inference patterns for React Native. Teachable Machine model preprocessing, tensor memory management (tf.tidy vs dispose), and Jest mock patterns for chained tensor operations. Use for on-device ML inference, TF.js memory leaks, or TM model integration.
kb-sources:
  - wiki/software-engineering/react-native-ml-inference
updated: 2026-04-18
---

# React Native ML Inference

TensorFlow.js on-device inference patterns for React Native + Expo.

## Teachable Machine Normalization

TM v2.x uses MobileNet v2 backbone requiring `[-1, 1]` input range: `(pixel / 127.5) - 1`.

**Bug signature:** Model runs without error but predictions cluster near one label — likely wrong normalization range. TM metadata.json often omits preprocessing fields; infer from TM version instead.

## Tensor Lifecycle

Two disposal mechanisms — mixing them causes double-dispose or leak bugs:

| Mechanism | Use when | Handles |
|-----------|----------|---------|
| `tf.tidy(() => { ... })` | All tensor ops synchronous inside callback | Intermediate tensors; returns last tensor |
| `tensor.dispose()` | Tensor created outside tidy, or returned from tidy | Specific tensor instance |

`tf.tidy()` cannot contain `await`. Async boundaries require explicit `.dispose()`.

## Key Patterns

- **decodeJpeg outer tensor** — created before tidy, requires manual `.dispose()` after tidy completes
- **Error-path disposal** — `finally` block with null-check guard (`if (tensor) { tensor.dispose(); }`)
- **Extract for testability** — move async inference pipeline out of component into standalone utility with injected dependencies
- **Three-path finally testing** — happy path, late throw (tensor assigned), early throw (tensor undefined)

## Error Handling

- **`Alert.alert` onPress for modal close**: pass `closeModal` inside `Alert.alert`'s `onPress` callback, not as standalone call. Standalone dismisses modal before user sees error.
- **`modelLoadFailed` state in `finally` block** (not `catch`) — prevents state from being skipped on any error path.
- **Tensor disposal in `finally` with `if (tensor)` guard** — server fallback never creates a tensor.
- **`getModel()` contract**: returns undefined on failure (implicit return in catch), never throws. Callers must null-check.

### Expo SDK 44 Inference Degradation

- expo-image-manipulator broken on modern iOS with SDK 44. Wrap `manipulateAsync()` in inner try/catch. Server fallback is correct degraded mode.
- Pattern: outer catch for unrecoverable, inner catch for per-step degradation.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| `tensor.dispose()` only in success path | `finally` block with null-check guard |
| `await` inside `tf.tidy()` | Explicit `.dispose()` for async boundaries |
| Single tidy wrapping entire async pipeline | tidy for sync algebra; dispose for async |
| Testing `finally` via component render | Extract to standalone utility, test directly |
| Global `coverageThreshold` in legacy codebase | File-level thresholds + baselines |
| Relying on GC to clean tensors | WebGL memory is not JS-heap-managed |
| Shared mock objects for chained calls | Distinct mocks per chain step + `mockReturnValueOnce` |
| Trusting TM metadata.json completeness | Infer normalization from TM version, not metadata fields |

See `examples.md` for code patterns (decodeJpeg, error-path disposal, testability extraction, Jest mock ordering, coverage thresholds).
