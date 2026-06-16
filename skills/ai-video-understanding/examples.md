# AI Video Understanding - Code Examples

Production-quality Python 3.11+ examples with type hints and Pydantic v2.

---

## Pydantic Models for Video Analysis

```python
from __future__ import annotations

from datetime import timedelta
from typing import Literal

from pydantic import BaseModel, Field


class DetectedObject(BaseModel):
    name: str
    confidence: float = Field(ge=0.0, le=1.0)
    location: str = Field(description="Spatial location: top-left, center, bottom-right, etc.")


class VideoFrame(BaseModel):
    timestamp: timedelta
    frame_number: int
    description: str
    objects: list[DetectedObject] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)


class VideoScene(BaseModel):
    start_time: timedelta
    end_time: timedelta
    scene_type: str
    key_frames: list[VideoFrame]
    summary: str


class ChangeDetection(BaseModel):
    frame_before: int
    frame_after: int
    change_type: Literal["appearance", "disappearance", "movement", "state_change"]
    objects_affected: list[str]
    description: str
    confidence: float = Field(ge=0.0, le=1.0)


class TimelineEvent(BaseModel):
    timestamp: timedelta
    event_type: str
    description: str
    precedes: str | None = None
    follows: str | None = None


class VideoAnalysis(BaseModel):
    duration: timedelta
    total_frames_analyzed: int
    scenes: list[VideoScene]
    overall_summary: str
    detected_events: list[str]
    confidence_score: float = Field(ge=0.0, le=1.0)
    timeline: list[TimelineEvent] = Field(default_factory=list)
```

---

## Gemini 2.5 Pro Native Video Analysis with Structured Output

```python
import datetime
import json

import google.generativeai as genai
from google.generativeai import caching

from models import VideoAnalysis  # Import from above


def analyze_video_gemini(
    video_path: str,
    prompt: str = "Analyze this video and extract structured observations.",
    cache_ttl_hours: int = 1,
) -> VideoAnalysis:
    """Analyze video natively with Gemini 2.5 Pro and structured output."""
    video_file = genai.upload_file(video_path)

    # Wait for processing
    while video_file.state.name == "PROCESSING":
        import time
        time.sleep(2)
        video_file = genai.get_file(video_file.name)

    if video_file.state.name == "FAILED":
        raise RuntimeError(f"Video processing failed: {video_file.state.name}")

    # Create cache for multi-query efficiency (90% discount on subsequent queries)
    cache = caching.CachedContent.create(
        model="gemini-2.5-pro",
        display_name=f"video-{video_path}",
        contents=[video_file],
        ttl=datetime.timedelta(hours=cache_ttl_hours),
    )

    model = genai.GenerativeModel.from_cached_content(cache)

    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=VideoAnalysis.model_json_schema(),
        ),
    )

    return VideoAnalysis.model_validate_json(response.text)


def multi_query_cached_analysis(
    video_path: str,
    queries: list[str],
    cache_ttl_hours: int = 1,
) -> list[str]:
    """Run multiple queries against the same video using context caching.

    First query pays full input cost. Subsequent queries pay ~10% (90% cache discount).
    """
    video_file = genai.upload_file(video_path)

    cache = caching.CachedContent.create(
        model="gemini-2.5-pro",
        display_name=f"multi-query-{video_path}",
        contents=[video_file],
        ttl=datetime.timedelta(hours=cache_ttl_hours),
    )

    model = genai.GenerativeModel.from_cached_content(cache)

    results: list[str] = []
    for query in queries:
        response = model.generate_content(query)
        results.append(response.text)

    return results
```

---

## GPT-4o Frame-Based Analysis with Instructor

```python
import base64
from pathlib import Path

import instructor
from openai import OpenAI
from pydantic import BaseModel, Field

from models import VideoAnalysis


class FrameAnalysis(BaseModel):
    frame_number: int
    scene_description: str
    objects: list[str]
    action_detected: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)


class VideoSummary(BaseModel):
    frames_analyzed: int
    key_objects: list[str]
    narrative_summary: str
    detected_actions: list[str]
    confidence_score: float = Field(ge=0.0, le=1.0)


def encode_frame(path: str | Path) -> dict:
    """Encode a frame as a base64 image_url content block."""
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return {
        "type": "image_url",
        "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": "low"},
    }


def analyze_frames_gpt4o(
    frame_paths: list[str | Path],
    prompt: str = "Analyze these video frames in sequence. Provide a structured summary.",
) -> VideoSummary:
    """Analyze extracted video frames with GPT-4o using Instructor for structured output."""
    client = instructor.from_openai(OpenAI())

    content: list[dict] = [encode_frame(p) for p in frame_paths]
    content.append({"type": "text", "text": prompt})

    return client.chat.completions.create(
        model="gpt-4o",
        response_model=VideoSummary,
        messages=[{"role": "user", "content": content}],
        max_retries=2,
    )


def analyze_frames_detailed(
    frame_paths: list[str | Path],
) -> list[FrameAnalysis]:
    """Get per-frame structured analysis from GPT-4o."""
    client = instructor.from_openai(OpenAI())

    results: list[FrameAnalysis] = []
    # Process in batches of 20 frames to stay within token limits
    batch_size = 20
    for i in range(0, len(frame_paths), batch_size):
        batch = frame_paths[i : i + batch_size]
        content: list[dict] = [encode_frame(p) for p in batch]
        content.append({
            "type": "text",
            "text": (
                f"Analyze frames {i} through {i + len(batch) - 1}. "
                "Return a structured analysis for each frame."
            ),
        })

        batch_result = client.chat.completions.create(
            model="gpt-4o",
            response_model=list[FrameAnalysis],
            messages=[{"role": "user", "content": content}],
            max_retries=2,
        )
        results.extend(batch_result)

    return results
```

---

## Claude Vision with Frame Grid (Tiled Image)

```python
import base64
from pathlib import Path

import anthropic
from pydantic import BaseModel, Field


class GridAnalysis(BaseModel):
    total_frames_in_grid: int
    scene_transitions: list[str]
    key_observations: list[str]
    narrative_summary: str
    confidence: float = Field(ge=0.0, le=1.0)


def analyze_grid_claude(
    grid_image_path: str | Path,
    rows: int = 6,
    cols: int = 8,
    video_duration_seconds: float = 96.0,
) -> GridAnalysis:
    """Analyze a video-to-grid tiled image with Claude.

    The grid contains rows*cols frames arranged left-to-right, top-to-bottom.
    Each frame represents video_duration / (rows*cols) seconds.
    """
    client = anthropic.Anthropic()

    with open(grid_image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode()

    total_frames = rows * cols
    seconds_per_frame = video_duration_seconds / total_frames

    response = client.messages.create(
        model="claude-sonnet-4-6-20250514",  # Use latest available model ID
        max_tokens=4096,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": image_data,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            f"This is a {cols}x{rows} grid of {total_frames} video frames, "
                            f"read left-to-right, top-to-bottom. Each frame represents "
                            f"~{seconds_per_frame:.1f} seconds of video.\n\n"
                            "Analyze the full video sequence. Return JSON with keys: "
                            "total_frames_in_grid (int), scene_transitions (list[str]), "
                            "key_observations (list[str]), narrative_summary (str), "
                            "confidence (float 0-1)."
                        ),
                    },
                ],
            }
        ],
    )

    # Parse Claude's response — extract JSON from potential markdown wrapping
    import json
    import re
    text = response.content[0].text
    # Handle markdown-wrapped JSON (```json ... ```)
    json_match = re.search(r"```(?:json)?\s*\n(.*?)\n```", text, re.DOTALL)
    raw_json = json_match.group(1) if json_match else text
    raw = json.loads(raw_json)
    return GridAnalysis.model_validate(raw)
```

---

## Video-to-Grid Helper Function

```python
import subprocess
from pathlib import Path


def get_video_duration(video_path: str) -> float:
    """Get video duration in seconds using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        video_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    import json
    info = json.loads(result.stdout)
    return float(info["format"]["duration"])


def extract_frames(
    video_path: str,
    output_dir: str,
    fps: float = 1.0,
    resolution: str = "1024:-1",
) -> list[Path]:
    """Extract frames from video at specified FPS and resolution.

    Args:
        video_path: Path to input video file.
        output_dir: Directory to write extracted JPEG frames.
        fps: Frames per second to extract.
        resolution: FFmpeg scale filter value. "1024:-1" scales width to 1024,
                     maintaining aspect ratio.

    Returns:
        Sorted list of extracted frame file paths.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps},scale={resolution}",
        "-q:v", "2",
        str(out / "frame_%04d.jpg"),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return sorted(out.glob("frame_*.jpg"))


def create_frame_grid(
    video_path: str,
    output_path: str,
    cols: int = 8,
    rows: int = 6,
    frame_height: int = 320,
) -> Path:
    """Create a tiled contact sheet from a video for single-API-call analysis.

    Produces a single image containing cols*rows frames arranged in a grid.

    Args:
        video_path: Path to input video.
        output_path: Path for output grid image (JPEG recommended).
        cols: Number of columns in the grid.
        rows: Number of rows in the grid.
        frame_height: Height of each individual frame thumbnail in pixels.

    Returns:
        Path to the generated grid image.
    """
    duration = get_video_duration(video_path)
    total_frames = cols * rows
    interval = duration / total_frames

    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{interval},scale=-1:{frame_height},tile={cols}x{rows}",
        "-frames:v", "1",
        "-y", output_path,
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return Path(output_path)


def extract_keyframes(
    video_path: str,
    output_dir: str,
    scene_threshold: float = 0.3,
    resolution: str = "1024:-1",
) -> list[Path]:
    """Extract scene-change keyframes using FFmpeg scene detection.

    Only captures frames where the visual content changes significantly,
    reducing redundant frames from static scenes.
    """
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"select='gt(scene\\,{scene_threshold})',scale={resolution}",
        "-vsync", "vfr",
        "-q:v", "2",
        str(out / "keyframe_%04d.jpg"),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    return sorted(out.glob("keyframe_*.jpg"))
```

---

## Multi-Pass Verification Pipeline

```python
from pydantic import BaseModel, Field


class KeyMoment(BaseModel):
    start_seconds: float
    end_seconds: float
    description: str
    priority: float = Field(ge=0.0, le=1.0)


class ScanResult(BaseModel):
    key_moments: list[KeyMoment]
    overall_description: str


class DetailedFinding(BaseModel):
    segment_start: float
    segment_end: float
    findings: list[str]
    confidence: float = Field(ge=0.0, le=1.0)


class VerifiedAnalysis(BaseModel):
    findings: list[DetailedFinding]
    overall_confidence: float = Field(ge=0.0, le=1.0)
    requires_human_review: bool


def multi_pass_analysis(
    video_path: str,
    confidence_threshold: float = 0.85,
) -> VerifiedAnalysis:
    """Three-pass video analysis: scan, detail, verify.

    Pass 1: Low resolution, sparse frames (0.5 FPS) to identify key moments.
    Pass 2: High resolution, dense frames (4 FPS) on flagged segments only.
    Pass 3: Re-analyze with a different prompt to verify findings.
    """
    # Pass 1: Quick scan
    sparse_frames = extract_frames(video_path, "/tmp/pass1", fps=0.5, resolution="512:-1")
    scan_result = _scan_pass(sparse_frames)  # Returns ScanResult via LLM

    # Pass 2: Detailed analysis on flagged segments
    detailed_findings: list[DetailedFinding] = []
    for moment in scan_result.key_moments:
        segment_frames = extract_frames(
            video_path, f"/tmp/pass2_{moment.start_seconds}",
            fps=4.0, resolution="1024:-1",
        )
        finding = _detail_pass(segment_frames, moment)  # Returns DetailedFinding via LLM
        detailed_findings.append(finding)

    # Pass 3: Verification with different prompt framing
    verified_findings: list[DetailedFinding] = []
    for finding in detailed_findings:
        verification = _verify_pass(finding, video_path)
        # Average confidence between original and verification
        merged_confidence = (finding.confidence + verification.confidence) / 2
        verified_findings.append(
            finding.model_copy(update={"confidence": merged_confidence})
        )

    overall_confidence = (
        sum(f.confidence for f in verified_findings) / len(verified_findings)
        if verified_findings
        else 0.0
    )

    return VerifiedAnalysis(
        findings=verified_findings,
        overall_confidence=overall_confidence,
        requires_human_review=overall_confidence < confidence_threshold,
    )


def _scan_pass(frames: list) -> ScanResult:
    """Pass 1: Quick identification of key moments (implement with your LLM of choice)."""
    ...


def _detail_pass(frames: list, moment: KeyMoment) -> DetailedFinding:
    """Pass 2: Detailed extraction on a specific segment."""
    ...


def _verify_pass(finding: DetailedFinding, video_path: str) -> DetailedFinding:
    """Pass 3: Re-analyze with verification prompt."""
    ...
```

---

## Transcript-First Analysis Pattern

```python
import whisperx
from pydantic import BaseModel, Field


class VisualMoment(BaseModel):
    start_seconds: float
    end_seconds: float
    reason: str


class TranscriptInsight(BaseModel):
    summary: str
    needs_visual: list[VisualMoment]
    speaker_segments: list[dict]


class CombinedAnalysis(BaseModel):
    transcript_summary: str
    visual_findings: list[str]
    combined_narrative: str
    confidence: float = Field(ge=0.0, le=1.0)


def transcript_first_analysis(
    video_path: str,
    audio_path: str | None = None,
    whisper_model: str = "large-v3",
) -> CombinedAnalysis:
    """Cost-optimized pipeline: transcribe audio first, then selectively analyze visuals.

    Audio transcription is orders of magnitude cheaper than vision tokens.
    This pattern reduces visual analysis to only the moments that need it.
    """
    # Step 1: Extract and transcribe audio
    if audio_path is None:
        audio_path = _extract_audio(video_path)

    model = whisperx.load_model(whisper_model, device="cuda", compute_type="float16")
    result = model.transcribe(audio_path, batch_size=16)

    # Align for word-level timestamps
    align_model, metadata = whisperx.load_align_model(
        language_code=result["language"], device="cuda"
    )
    aligned = whisperx.align(
        result["segments"], align_model, metadata, audio_path, device="cuda"
    )

    # Step 2: Analyze transcript to identify moments needing visual context
    transcript_text = " ".join(seg["text"] for seg in aligned["segments"])
    transcript_insight = _analyze_transcript(transcript_text)  # Returns TranscriptInsight

    # Step 3: Selective visual analysis only where transcript indicates need
    visual_findings: list[str] = []
    for moment in transcript_insight.needs_visual:
        frames = extract_frames(
            video_path,
            f"/tmp/visual_{moment.start_seconds}",
            fps=2.0,
            resolution="1024:-1",
        )
        finding = _analyze_visual_segment(frames, moment, transcript_text)
        visual_findings.append(finding)

    # Step 4: Combine transcript and visual analyses
    return CombinedAnalysis(
        transcript_summary=transcript_insight.summary,
        visual_findings=visual_findings,
        combined_narrative=_combine(transcript_insight, visual_findings),
        confidence=0.9,
    )


def _extract_audio(video_path: str) -> str:
    """Extract audio track from video using FFmpeg."""
    import subprocess
    audio_path = video_path.rsplit(".", 1)[0] + ".wav"
    subprocess.run(
        ["ffmpeg", "-i", video_path, "-vn", "-acodec", "pcm_s16le",
         "-ar", "16000", "-ac", "1", "-y", audio_path],
        check=True, capture_output=True,
    )
    return audio_path


def _analyze_transcript(text: str) -> TranscriptInsight:
    """Analyze transcript to identify moments needing visual context."""
    ...


def _analyze_visual_segment(frames: list, moment: VisualMoment, transcript: str) -> str:
    """Analyze visual frames with transcript context."""
    ...


def _combine(transcript: TranscriptInsight, visual: list[str]) -> str:
    """Combine transcript and visual analyses into a unified narrative."""
    ...
```

---

## Complete Pipeline: Video to Structured Pydantic Report

```python
import tempfile
from pathlib import Path

from pydantic import BaseModel, Field


class VideoReport(BaseModel):
    title: str
    duration_seconds: float
    total_scenes: int
    scenes: list[dict]
    key_findings: list[str]
    timeline: list[dict]
    overall_summary: str
    confidence: float = Field(ge=0.0, le=1.0)
    cost_estimate_usd: float


def video_to_report(
    video_path: str,
    provider: str = "gemini",
    detail_level: str = "standard",
) -> VideoReport:
    """End-to-end pipeline: video file to structured Pydantic report.

    Args:
        video_path: Path to video file.
        provider: "gemini" (native), "openai" (frame-based), or "claude" (frame-based).
        detail_level: "overview" (0.5 FPS), "standard" (2 FPS), "detailed" (4 FPS).
    """
    duration = get_video_duration(video_path)

    fps_map = {"overview": 0.5, "standard": 2.0, "detailed": 4.0}
    fps = fps_map[detail_level]

    if provider == "gemini":
        # Native video - no frame extraction needed
        analysis = analyze_video_gemini(video_path)
        cost = estimate_cost(duration, provider="gemini", cached=False)
    elif provider == "openai":
        with tempfile.TemporaryDirectory() as tmp:
            frames = extract_frames(video_path, tmp, fps=fps)
            summary = analyze_frames_gpt4o([str(f) for f in frames])
            analysis = summary
            cost = estimate_cost(duration, provider="openai", num_frames=len(frames))
    elif provider == "claude":
        with tempfile.TemporaryDirectory() as tmp:
            grid_path = str(Path(tmp) / "grid.jpg")
            create_frame_grid(video_path, grid_path)
            grid_result = analyze_grid_claude(grid_path, video_duration_seconds=duration)
            analysis = grid_result
            cost = estimate_cost(duration, provider="claude", grid=True)
    else:
        raise ValueError(f"Unknown provider: {provider}")

    return VideoReport(
        title=f"Video Analysis: {Path(video_path).name}",
        duration_seconds=duration,
        total_scenes=len(getattr(analysis, "scenes", [])) or 1,
        scenes=[],
        key_findings=getattr(analysis, "key_observations", []),
        timeline=[],
        overall_summary=getattr(analysis, "narrative_summary", str(analysis)),
        confidence=getattr(analysis, "confidence", getattr(analysis, "confidence_score", 0.8)),
        cost_estimate_usd=cost,
    )
```

---

## Cost Estimation Helper

```python
def estimate_cost(
    duration_seconds: float,
    provider: str = "gemini",
    num_frames: int | None = None,
    cached: bool = False,
    grid: bool = False,
    resolution: int = 1024,
) -> float:
    """Estimate API cost for video analysis in USD.

    Based on published pricing as of March 2026. Verify with provider docs.

    Args:
        duration_seconds: Video duration in seconds.
        provider: "gemini", "openai", or "claude".
        num_frames: Number of frames (for frame-based providers).
        cached: Whether Gemini context caching is active.
        grid: Whether using video-to-grid (single image) approach.
        resolution: Frame resolution (width in pixels).
    """
    if grid:
        # Single image, ~1400 tokens at 1024x1024
        tokens = (resolution * resolution) / 750
        prices = {"gemini": 4.0, "openai": 2.5, "claude": 3.0}
        return tokens * prices.get(provider, 3.0) / 1_000_000

    if provider == "gemini":
        # Audio: 32 tokens/sec, video tokens vary
        audio_tokens = duration_seconds * 32
        # Approximate video tokens (varies by resolution and content)
        video_tokens = duration_seconds * 250  # rough estimate
        total_tokens = audio_tokens + video_tokens
        cost_per_million = 4.0
        if cached:
            cost_per_million *= 0.1  # 90% cache discount
        return total_tokens * cost_per_million / 1_000_000

    if provider == "openai":
        if num_frames is None:
            num_frames = int(duration_seconds * 2)  # default 2 FPS
        tokens_per_frame = (resolution * resolution) / 750
        total_tokens = num_frames * tokens_per_frame
        return total_tokens * 2.5 / 1_000_000

    if provider == "claude":
        if num_frames is None:
            num_frames = int(duration_seconds * 2)
        tokens_per_frame = (resolution * resolution) / 750
        total_tokens = num_frames * tokens_per_frame
        return total_tokens * 3.0 / 1_000_000

    raise ValueError(f"Unknown provider: {provider}")
```
