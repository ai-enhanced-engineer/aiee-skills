# Video Preprocessing Reference

## Library Selection Guide

### Installation Commands

```bash
# TorchCodec (PyTorch GPU pipelines)
pip install torchcodec  # Requires FFmpeg 4-8
conda install -c conda-forge ffmpeg  # For NVDEC support

# Decord (batch random-access extraction)
pip install decord       # v0.6.x, CPU only
pip install decord2      # Community fork, CUDA 12

# ffmpeg-python (transcoding, CLI wrapper)
pip install ffmpeg-python

# PySceneDetect (scene-change detection)
pip install scenedetect[opencv]  # v0.6.7

# faster-whisper (transcription)
pip install faster-whisper  # v1.1.0, needs CUDA 12 + cuDNN 9 for GPU

# WhisperX (transcription + speaker diarization)
pip install whisperx  # Requires HF token for Pyannote models

# Metadata
pip install pymediainfo  # Rich metadata, GPS extraction
```

## Frame Extraction Strategies

### Uniform Sampling

Extract N evenly-spaced frames. Use TorchCodec `decoder[0:-1:step]` or Decord `vr.get_batch(indices)`. Calculate indices as `int(i * (total - 1) / (N - 1))` for i in range(N).

### Scene-Change Detection (PySceneDetect v0.6.7)

Three algorithms:
- **ContentDetector** (threshold=27.0): Fast cuts between shots
- **AdaptiveDetector** (adaptive_threshold=3.5): Camera movement, gradual transitions
- **ThresholdDetector**: Fades to/from black

Set `min_scene_len=15` to avoid false positives on flicker. Extract representative frames at scene midpoints.

### Motion-Based Keyframes

Score frames by Laplacian variance (sharpness) and luminance balance. Select the highest-scoring frame per scene segment. Useful for thumbnail generation where visual quality matters.

## AI Model Input Requirements

| Model | Frame/Duration Limit | Default Behavior | Token Cost |
|-------|---------------------|-----------------|------------|
| **Gemini 2.5 Pro** | ~1hr native video (1M context) | Processes at 1 FPS automatically | ~250 tokens/second of video |
| **GPT-4o** | ~20 images/call (batch for more) | Manual frame sampling required | 170 tokens per 512x512 tile |
| **Claude Sonnet 4.6** | 600 images/request (2000x2000 max in batches >20) | Manual frame sampling required | `(width × height) / 750` tokens per image |

For Gemini: send native video file; videos >60 min benefit from 0.5 FPS pre-sampling. For GPT-4o: ~20 frames per API call is practical; batch calls for longer videos. For Claude: resize frames to ≤1568px on longest side; batches >20 images must be ≤2000x2000px.

## Audio Extraction with faster-whisper

### Setup and GPU Memory

| Model | GPU FP16 | GPU INT8 | CPU INT8 |
|-------|----------|----------|----------|
| large-v3 | 4,525 MB | 2,926 MB | — |
| small | — | — | 1,477 MB |

Use `compute_type="int8"` to halve GPU memory. Enable `vad_filter=True` to skip silence and speed up transcription.

### Speaker Diarization with WhisperX

WhisperX combines faster-whisper with Pyannote 3.1 (DER 11-19%). Workflow: transcribe -> align word timestamps -> run diarization pipeline -> assign speakers to words. Requires Hugging Face auth token for Pyannote model access.

## Metadata Extraction Patterns

### ffprobe (via ffmpeg-python)

Use `ffmpeg.probe(path)` to get duration, resolution, FPS, codec, bitrate, and creation_time from format tags. Parse `r_frame_rate` as a fraction (e.g., "30/1").

### pymediainfo (mobile video)

Provides GPS coordinates (`general.xyz`), device info (`general.performer`), and rotation (`video.rotation`). Rotation is critical for mobile video — phones record in sensor orientation and store rotation as metadata.

### ExifTool

Most comprehensive. Run `exiftool -json -g <path>` for grouped JSON output. Access QuickTime atoms for creation date, camera model; Composite group for GPS and rotation.

## Cloud Processing Patterns

### GCP Cloud Run GPU (GA since June 2025)

- NVIDIA L4 (24GB VRAM): ~$0.67/hour, pay-per-second, scale-to-zero
- Startup time: <5 seconds
- Architecture: Cloud Storage -> Pub/Sub -> Cloud Run Job (GPU) -> Cloud Storage
- Set `nvidia.com/gpu: "1"` in resource limits

### Cost Optimization

| Workload | Service | Rationale |
|----------|---------|-----------|
| <15 min | Lambda (container) | Pay only for execution |
| 15 min - 2 hr | Cloud Run Jobs (GPU) / Fargate | Scale to zero |
| Consistent load | GKE/EKS GPU nodes | Reserved instances cheaper |
| Burst | Modal / Runpod | No infra management |

## Large File Handling

### Chunk Splitting

Use `ffmpeg -c copy -segment_time 300 -f segment` for lossless 5-minute chunks. The `-c copy` flag avoids re-encoding (100x faster). Use `-reset_timestamps 1` so each chunk starts at t=0 (most downstream tools expect this).

### Streaming Processing

Pipe ffmpeg output as raw RGB frames via `image2pipe` format. Read `width * height * 3` bytes per frame from stdout. Constant memory regardless of video length.

### Tempfile Management

Use `tempfile.mkdtemp()` with a context manager that calls `shutil.rmtree()` in the finally block. Without cleanup, intermediate video files accumulate on disk — a 1-hour video pipeline can generate 10+ GB of temp data.

## Hardware Acceleration

| Platform | Encoder | Decoder | Flag |
|----------|---------|---------|------|
| NVIDIA | h264_nvenc | NVDEC (hwaccel="cuda") | `preset="p4"` (balanced) |
| macOS | h264_videotoolbox | VideoToolbox | `video_bitrate="5M"` |
| CPU fallback | libx264 | — | `preset="medium"` |

Detect available encoder at runtime: check `platform.system()` for Darwin, then try `nvidia-smi` for NVENC, fall back to libx264.

## Anti-Patterns

| Anti-Pattern | Pattern |
|-------------|---------|
| `subprocess.Popen(cmd, stdout=open(devnull, 'wb'))` — leaks file handle | Use `stdout=subprocess.DEVNULL` |
| `subprocess.run(["ffmpeg", ...])` with no timeout | Set `timeout=3600` and handle `TimeoutExpired` |
| Accumulating all frames in a list — OOM on long video | Process in batches of 32, `del batch` after each |
| Re-encoding for trim/split (`ffmpeg ... output.mp4`) | Use `-c copy` for stream copy (100x faster) |
| MoviePy `VideoFileClip` without `.close()` | Use try/finally or context manager to close reader |
| `ffmpeg.input().output(ss=10)` — slow seek (decodes from start) | Put `ss=10` on `.input()` for fast input seeking |
| Loading entire video into numpy array for single-frame access | Use Decord/TorchCodec random access: `decoder[frame_idx]` |
| Hardcoding encoder without platform detection | Detect NVENC/VideoToolbox at runtime, fall back to libx264 |
