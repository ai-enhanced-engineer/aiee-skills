---
name: video-preprocessing-python
description: Python video preprocessing for AI pipelines using ffmpeg-python and faster-whisper, including frame extraction, scene detection, codec normalization, audio transcription, and cloud processing. Use for preparing mobile-captured video for vision model consumption.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/ai-ml/video-preprocessing
updated: 2026-05-21
---

# Video Preprocessing for AI Pipelines (Python 3.11+)

Use this skill when building or modifying Python pipelines that ingest video for AI/ML consumption — frame extraction, transcription, scene detection, metadata parsing, or cloud-based batch processing.

## Library Decision Matrix

| Library | When to Use | GPU | Version |
|---------|------------|-----|---------|
| **TorchCodec** | PyTorch training loops, GPU-accelerated batch decoding | NVDEC | 0.10 |
| **Decord** | Random-access frame extraction, non-PyTorch ML pipelines | Build from src | 0.6.x |
| **ffmpeg-python** | Transcoding, trimming, hardware-accelerated encoding | NVENC/VideoToolbox | 0.2.x |
| **VidGear** | Real-time streaming, multi-camera capture | Via backend | 0.3.x |

## Frame Sampling Quick Reference

| Strategy | Use Case | Typical Rate |
|----------|----------|-------------|
| Uniform | General analysis, consistent coverage | Every Nth frame |
| Scene-change (PySceneDetect) | Summarization, action recognition | 1 frame/scene |
| Keyframe (I-frame) | Thumbnails, indexing | Codec-dependent |
| Adaptive/motion-based | Smart sampling, compression | Content-driven |

## Audio Extraction Quick Reference

- **faster-whisper 1.1.0**: 4x faster than OpenAI Whisper, FP16 large-v3 needs 4.5GB VRAM
- **WhisperX**: Adds speaker diarization via Pyannote 3.1 (requires HF token)
- Whisper-family models expect 16kHz mono PCM input

## References

- See `reference.md` for detailed patterns, model constraints, hardware acceleration, and anti-patterns
- See `examples.md` for production code examples including complete pipelines
