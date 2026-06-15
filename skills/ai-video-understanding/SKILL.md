---
name: ai-video-understanding
description: Multimodal AI patterns for extracting structured information from video using Gemini, GPT-4o, and Claude vision. Frame sampling strategies, structured output with Pydantic, temporal reasoning, and cost optimization. Use for video analysis, report generation from video, and visual inspection.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/ai-ml/video-understanding
updated: 2026-04-18
---

# AI Video Understanding

Use this skill when building pipelines that extract structured information from video using multimodal LLMs, or when choosing between native video input (Gemini) and frame-based approaches (GPT-4o, Claude).

## Model Comparison

| Model | Video Input | Max Duration/Images | Input $/1M tokens | Best For |
|-------|------------|--------------------|--------------------|----------|
| Gemini 2.5 Pro | Native | 1 hour, 10 videos | $4.00 | Long-form, temporal reasoning, cached Q&A |
| Gemini 2.5 Flash | Native | Similar to Pro | ~$0.50 | High-volume, cost-sensitive |
| GPT-4o | Frame-based | Hundreds of frames | $2.50 | Structured extraction, schema adherence |
| Claude Sonnet 4.6 | Frame-based | 600 images/request | $3.00 | High frame-count, multi-turn analysis |

## Frame Sampling Quick Reference

| Task Type | Recommended FPS | Accuracy |
|-----------|----------------|----------|
| General overview | 0.5-1 FPS | ~85% |
| Action detection | 2-4 FPS | ~95% |
| Fine-grained motion | 8-16 FPS | ~98%+ |
| Long-form (budget) | Grid: 48 frames/image | ~70-80% |

## Cost Optimization

- Enable Gemini context caching for multi-query workflows (90% discount on cached tokens)
- Use video-to-grid (48 frames in one image) for single-call analysis at ~$0.01/video
- Resize frames to 1024x1024 for optimal quality/cost balance
- Apply transcript-first pattern: cheap audio analysis, then selective visual only where needed
- Use multi-pass: sparse low-res scan first, then dense high-res on flagged segments only

See [reference.md](./reference.md) for detailed patterns and architecture decisions.
See [examples.md](./examples.md) for production code examples.
