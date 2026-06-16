# AI Video Understanding Reference

## Model Capabilities Deep Dive

### Gemini 2.5 (Native Video)

Gemini 2.5 Pro and Flash accept video files directly via the API. Upload up to 10 videos per request (paid tier) with no hard duration limit (consumer app caps at 1 hour). Audio and video are processed jointly: 32 tokens/second for audio (1,920 tokens/minute). Native temporal reasoning works without frame extraction. Context caching (available since May 2025) provides a 90% discount on cached input tokens for Gemini 2.5+ models.

**When to choose:** Long-form video (>2 minutes), temporal reasoning tasks, repeated queries on the same video, audio+visual fusion needed natively.

### GPT-4o / GPT-4.1 (Frame-Based)

OpenAI does not accept video files. Extract frames manually and send as image arrays. OpenAI recommends 2-4 FPS for action detection. GPT-4o has a 128K token context window; GPT-4.1 has 1M tokens. Strongest structured output support via `response_format={"type": "json_schema"}` with guaranteed schema adherence.

**When to choose:** Structured extraction with strict schema compliance, existing OpenAI integration, frame-level detail analysis.

### Claude Sonnet 4.6 (Frame-Based)

Supports up to 600 images per API request (100 for 200K context models). Max image size: 8000x8000 px single, 2000x2000 px in batches >20. Token formula: `tokens = (width * height) / 750`. Optimal frame size: 1568px max dimension (~1.15 megapixels). Files API allows upload-once, reference-by-ID for multi-turn conversations.

**When to choose:** High frame-count analysis (up to 600 frames), multi-turn video conversations, document-style grid analysis.

### Open-Source Alternatives

| Model | Params | Key Feature |
|-------|--------|------------|
| LLaVA-Video-72B | 72B | Competitive video benchmarks, Qwen2 base |
| Qwen2.5-VL-72B | 72B | Dynamic FPS sampling, 1+ hour native-like video |
| InternVL 2.5 | Various | First open-source >70% MMMU, GPT-4o competitive |
| LLaVA-OneVision | 0.5-72B | Single model for image/multi-image/video |

Use when: API cost is prohibitive at scale, privacy requirements demand self-hosting, or you need fine-tuning on domain-specific video.

---

## Frame-to-Model Pipeline Patterns

### Uniform Sampling
Extract frames at a fixed FPS. Simple and predictable. Works well for videos with consistent activity levels.

### Scene-Change / Keyframe Sampling
Use FFmpeg scene detection (`-vf "select='gt(scene,0.3)'"`) or OpenCV to extract frames only when visual content changes. Reduces redundant frames in static scenes, captures transitions.

### Adaptive Sampling
Combine sparse initial pass with dense sampling on segments of interest. Best for long videos where activity is concentrated in specific time ranges.

### Video-to-Grid Technique
Compose N frames into a single tiled image (contact sheet). A 6x8 grid of 48 frames becomes one image for a single API call. Cost: ~$0.004-0.01 per video vs $0.10-0.25 for individual frames. Trade-off: lower per-frame resolution, no zooming into individual frames. Works with any vision model.

FFmpeg one-liner: `ffmpeg -i video.mp4 -vf "fps=1/{interval},scale=-1:320,tile=8x6" -frames:v 1 grid.jpg`

---

## Structured Output Extraction

### Pydantic v2 Models
Define `BaseModel` classes for every extraction target: `VideoFrame`, `VideoScene`, `VideoAnalysis`, `ChangeDetection`, `TimelineEvent`. Use `Field(ge=0.0, le=1.0)` for confidence scores, `timedelta` for timestamps, `Literal` for enum-like fields.

### Instructor Library
Wraps OpenAI, Anthropic, Gemini, and 15+ providers. Converts Pydantic models to provider-specific schema formats automatically. Handles retries on validation failure.

### Provider-Specific Methods

| Provider | Method | Schema Guarantee |
|----------|--------|-----------------|
| OpenAI | `response_format` with `json_schema` | Guaranteed |
| Gemini | `responseMimeType: 'application/json'` + schema | Strong |
| Claude | Tool use with JSON schema | Strong |

---

## Multi-Pass Verification

**Pass 1 (Scan):** Low resolution, sparse frames (0.5 FPS). Identify key moments, anomalies, segments of interest. Cost: minimal.

**Pass 2 (Detail):** High resolution, dense frames (4 FPS) on flagged segments only. Full structured extraction with Pydantic models.

**Pass 3 (Verify):** Re-analyze with a different prompt or model. Compare results. Flag disagreements as low-confidence. Optionally route to human review when confidence < 0.85.

---

## Temporal Reasoning Patterns

### Current Limitations
All video LLMs struggle with detailed action sequence comprehension, temporal progression tracking, and fine-grained event ordering. Root cause: the underlying LLM's inherent difficulty with temporal concepts.

### Change Detection
Compare sequential frame pairs. Classify changes as appearance, disappearance, movement, or state_change. Use explicit "Frame 1 (earlier) | Frame 2 (later)" prompting to anchor temporal direction.

### Event Sequencing
Build timeline models with `precedes`/`follows` relationships. Validate temporal consistency (no circular dependencies). Use TISER-style iterative self-reflection for complex temporal reasoning.

### Progress Tracking
For procedural videos (tutorials, assembly, cooking): define expected steps, track `not_started / in_progress / completed / skipped` status per step, compute completion percentage.

---

## Audio-Visual Fusion

### Transcript-First Pattern
1. Extract audio and transcribe with Whisper/WhisperX (word-level timestamps)
2. Analyze transcript with text LLM to identify moments that need visual context
3. Extract frames only at those moments
4. Combine transcript + frames in multimodal prompt

Cost savings: 80-90% reduction vs analyzing all frames visually. Audio transcription is orders of magnitude cheaper than vision tokens.

### When Audio Alone Suffices
Speech transcription, meeting summaries, podcast analysis. Add visual analysis only for: action description, security/surveillance, tutorials, emotion detection.

---

## Cost Optimization

### Context Caching (Gemini)
- Gemini 2.5+: 90% discount (pay 10% for cached tokens)
- Gemini 2.0: 75% discount (pay 25% for cached tokens)
- Implicit caching is default since May 2025; explicit caching guarantees cache hit
- Cache TTL: configurable, typically 1 hour

### Resolution Scaling

| Resolution | Tokens (Claude) | Cost Multiplier | Notes |
|-----------|----------------|----------------|-------|
| 200x200 | ~54 | 0.03x | May miss small details |
| 512x512 | ~350 | 0.22x | Good for most content |
| 1024x1024 | ~1,400 | 0.88x | Optimal quality/cost |
| 1568x1568 | ~3,280 | 2x+ | Diminishing returns |

### Frame Count vs. Accuracy

| FPS | Relative Cost | Relative Accuracy | Best For |
|-----|--------------|-------------------|----------|
| 0.25 | 1x | ~70% | Overview, existence checks |
| 1 | 4x | ~85% | Most general tasks |
| 4 | 16x | ~95% | Action detection |
| 16 | 64x | ~98%+ | Fine-grained motion |

### Cost Estimates

| Scenario | Approach | Cost |
|----------|----------|------|
| 1-min overview | Gemini native, 1 query | ~$0.02-0.05 |
| 1-min, 10 queries (cached) | Gemini + caching | ~$0.02 + $0.002/query |
| 1-min, 60 frames | GPT-4o | ~$0.15-0.25 |
| 1-min, 60 frames | Claude | ~$0.10-0.20 |
| 1-min, grid (48 frames) | Any vision model | ~$0.004-0.01 |
| 10-min detailed | Gemini native | ~$0.20-0.50 |
| 1-hour cached Q&A (20 queries) | Gemini + caching | ~$1.00-2.00 |

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|-------------|---------|
| Sending full-resolution frames (wastes tokens) | Resize to 1024x1024 or model-optimal size |
| Uniform sampling for long videos (misses key moments) | Adaptive or keyframe-based sampling |
| No caching for repeated queries (10x cost) | Enable Gemini context caching |
| Single-pass analysis for critical tasks (hallucinations undetected) | Multi-pass with verification and confidence scoring |
| Ignoring audio for dialog-heavy content (missing context) | Transcript-first, then selective visual analysis |
| Low resolution 224x224 (information loss, hallucinations) | Use 512x512+ where budget allows |
| Simple linear fusion modules (multimodal misalignment) | Advanced fusion architectures or multi-pass prompting |
| No confidence thresholds (silent failures) | Set minimum confidence (0.85) and route low-confidence to human review |
