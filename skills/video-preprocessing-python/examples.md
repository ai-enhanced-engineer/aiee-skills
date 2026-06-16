# Video Preprocessing Examples

## Frame Extraction with Decord (Uniform Sampling)

```python
from pathlib import Path

import numpy as np
from decord import VideoReader, cpu


def extract_uniform_frames(
    video_path: str | Path,
    num_frames: int = 20,
) -> np.ndarray:
    """Extract uniformly spaced frames from video.

    Args:
        video_path: Path to input video file.
        num_frames: Number of frames to extract.

    Returns:
        Array of shape (num_frames, H, W, 3) in uint8.
    """
    vr = VideoReader(str(video_path), ctx=cpu(0))
    total = len(vr)

    if num_frames >= total:
        indices = list(range(total))
    else:
        indices = [
            int(i * (total - 1) / (num_frames - 1))
            for i in range(num_frames)
        ]

    frames: np.ndarray = vr.get_batch(indices).asnumpy()
    return frames


def extract_fps_frames(
    video_path: str | Path,
    target_fps: float = 1.0,
) -> np.ndarray:
    """Extract frames at a target FPS rate.

    Args:
        video_path: Path to input video file.
        target_fps: Desired frames per second.

    Returns:
        Array of shape (N, H, W, 3) in uint8.
    """
    vr = VideoReader(str(video_path), ctx=cpu(0))
    source_fps = vr.get_avg_fps()
    step = max(1, int(source_fps / target_fps))
    indices = list(range(0, len(vr), step))

    return vr.get_batch(indices).asnumpy()
```

## Scene-Change Detection with PySceneDetect

```python
from pathlib import Path

from scenedetect import detect, AdaptiveDetector, ContentDetector
from scenedetect.scene_manager import SceneManager


def detect_scenes(
    video_path: str | Path,
    method: str = "content",
    threshold: float = 27.0,
    min_scene_len: int = 15,
) -> list[tuple[float, float]]:
    """Detect scene boundaries and return timestamp pairs.

    Args:
        video_path: Path to input video.
        method: "content" for hard cuts, "adaptive" for gradual transitions.
        threshold: Detection sensitivity (lower = more scenes).
        min_scene_len: Minimum frames per scene to avoid false positives.

    Returns:
        List of (start_seconds, end_seconds) tuples.
    """
    if method == "adaptive":
        detector = AdaptiveDetector(
            adaptive_threshold=3.5,
            min_scene_len=min_scene_len,
        )
    else:
        detector = ContentDetector(
            threshold=threshold,
            min_scene_len=min_scene_len,
        )

    scenes = detect(str(video_path), detector)

    return [
        (scene[0].get_seconds(), scene[1].get_seconds())
        for scene in scenes
    ]


def extract_scene_keyframes(
    video_path: str | Path,
    scenes: list[tuple[float, float]],
) -> list[tuple[float, "np.ndarray"]]:
    """Extract the midpoint frame from each detected scene.

    Args:
        video_path: Path to input video.
        scenes: List of (start_sec, end_sec) from detect_scenes().

    Returns:
        List of (timestamp_seconds, frame_array) tuples.
    """
    import numpy as np
    from decord import VideoReader, cpu

    vr = VideoReader(str(video_path), ctx=cpu(0))
    fps = vr.get_avg_fps()

    results: list[tuple[float, np.ndarray]] = []
    for start_sec, end_sec in scenes:
        mid_sec = (start_sec + end_sec) / 2
        mid_frame = min(int(mid_sec * fps), len(vr) - 1)
        frame = vr[mid_frame].asnumpy()
        results.append((mid_sec, frame))

    return results
```

## Audio Transcription with faster-whisper

```python
from dataclasses import dataclass
from pathlib import Path
import subprocess
import tempfile


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str
    language: str


def extract_audio_to_wav(
    video_path: str | Path,
    sample_rate: int = 16000,
) -> Path:
    """Extract audio track as 16kHz mono WAV for Whisper.

    Args:
        video_path: Path to input video.
        sample_rate: Output sample rate (Whisper expects 16000).

    Returns:
        Path to temporary WAV file. Caller must clean up.
    """
    fd, tmp_path = tempfile.mkstemp(suffix=".wav", prefix="audio_")
    os.close(fd)
    output = Path(tmp_path)
    subprocess.run(
        [
            "ffmpeg", "-i", str(video_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", str(sample_rate),
            "-ac", "1",
            str(output),
        ],
        check=True,
        capture_output=True,
    )
    return output


def transcribe_video(
    video_path: str | Path,
    model_size: str = "large-v3",
    device: str = "cuda",
    compute_type: str = "float16",
) -> list[TranscriptSegment]:
    """Transcribe video audio using faster-whisper.

    Args:
        video_path: Path to input video.
        model_size: Whisper model (tiny|base|small|medium|large-v2|large-v3).
        device: "cuda" or "cpu".
        compute_type: "float16", "int8", or "float32".

    Returns:
        List of transcript segments with timestamps.
    """
    from faster_whisper import WhisperModel

    audio_path = extract_audio_to_wav(video_path)
    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
        segments, info = model.transcribe(
            str(audio_path),
            beam_size=5,
            word_timestamps=True,
            vad_filter=True,
        )

        results: list[TranscriptSegment] = []
        for seg in segments:
            results.append(TranscriptSegment(
                start=seg.start,
                end=seg.end,
                text=seg.text.strip(),
                language=info.language,
            ))
        return results
    finally:
        audio_path.unlink(missing_ok=True)
```

## Metadata Extraction from Mobile Video

```python
from dataclasses import dataclass
from pathlib import Path

import ffmpeg


@dataclass
class VideoMetadata:
    duration_seconds: float
    width: int
    height: int
    fps: float
    codec: str
    bitrate: int
    creation_time: str | None
    rotation: int | None


def get_video_metadata(video_path: str | Path) -> VideoMetadata:
    """Extract technical metadata using ffprobe.

    Args:
        video_path: Path to input video.

    Returns:
        VideoMetadata with duration, resolution, FPS, codec info.

    Raises:
        ValueError: If no video stream is found.
    """
    probe = ffmpeg.probe(str(video_path))

    video_stream = next(
        (s for s in probe["streams"] if s["codec_type"] == "video"),
        None,
    )
    if video_stream is None:
        raise ValueError(f"No video stream in {video_path}")

    # Parse fractional FPS (e.g., "30000/1001")
    r_num, r_den = video_stream["r_frame_rate"].split("/")
    fps = int(r_num) / int(r_den)

    # Rotation from side_data or displaymatrix
    rotation: int | None = None
    for side_data in video_stream.get("side_data_list", []):
        if "rotation" in side_data:
            rotation = int(side_data["rotation"])

    return VideoMetadata(
        duration_seconds=float(probe["format"]["duration"]),
        width=video_stream["width"],
        height=video_stream["height"],
        fps=round(fps, 3),
        codec=video_stream["codec_name"],
        bitrate=int(probe["format"].get("bit_rate", 0)),
        creation_time=probe["format"].get("tags", {}).get("creation_time"),
        rotation=rotation,
    )


def get_mobile_metadata_rich(video_path: str | Path) -> dict:
    """Extract rich metadata including GPS from mobile video.

    Requires pymediainfo: pip install pymediainfo

    Args:
        video_path: Path to mobile-captured video.

    Returns:
        Dict with device, GPS, rotation, and creation date.
    """
    from pymediainfo import MediaInfo

    info = MediaInfo.parse(str(video_path))
    general = info.general_tracks[0] if info.general_tracks else None
    video = info.video_tracks[0] if info.video_tracks else None

    result: dict = {
        "duration_ms": getattr(general, "duration", None),
        "creation_date": getattr(general, "recorded_date", None),
        "device": getattr(general, "performer", None),
        "gps": getattr(general, "xyz", None),
    }

    if video:
        result.update({
            "width": video.width,
            "height": video.height,
            "rotation": video.rotation,
            "frame_rate": video.frame_rate,
        })

    return result
```

## Memory-Efficient Processing Pipeline

```python
import subprocess
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Generator
import shutil
import tempfile

import ffmpeg
import numpy as np


@contextmanager
def video_workspace(prefix: str = "video_proc_") -> Generator[Path, None, None]:
    """Temporary directory with automatic cleanup.

    Yields:
        Path to temporary workspace directory.
    """
    workspace = Path(tempfile.mkdtemp(prefix=prefix))
    try:
        yield workspace
    finally:
        shutil.rmtree(workspace, ignore_errors=True)


def process_video_streaming(
    video_path: str | Path,
    process_fn: Callable[[np.ndarray, int], None],
    fps: float = 1.0,
) -> int:
    """Stream video frames through a callback without loading entire file.

    Args:
        video_path: Path to input video.
        process_fn: Callback receiving (frame_array, frame_index).
        fps: Sampling rate in frames per second.

    Returns:
        Total number of frames processed.
    """
    probe = ffmpeg.probe(str(video_path))
    video_stream = next(s for s in probe["streams"] if s["codec_type"] == "video")
    width: int = video_stream["width"]
    height: int = video_stream["height"]
    frame_size = width * height * 3

    cmd = [
        "ffmpeg",
        "-i", str(video_path),
        "-vf", f"fps={fps}",
        "-f", "image2pipe",
        "-pix_fmt", "rgb24",
        "-vcodec", "rawvideo",
        "-",
    ]

    frame_idx = 0
    with subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    ) as proc:
        assert proc.stdout is not None
        while True:
            raw = proc.stdout.read(frame_size)
            if len(raw) < frame_size:
                break
            frame = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3)
            process_fn(frame, frame_idx)
            frame_idx += 1

    return frame_idx


def split_video_chunks(
    video_path: str | Path,
    chunk_seconds: int = 300,
    output_dir: Path | None = None,
) -> list[Path]:
    """Split video into chunks using stream copy (no re-encoding).

    Args:
        video_path: Path to input video.
        chunk_seconds: Duration of each chunk in seconds.
        output_dir: Directory for chunks. Uses temp dir if None.

    Returns:
        Sorted list of chunk file paths.
    """
    if output_dir is None:
        output_dir = Path(tempfile.mkdtemp(prefix="chunks_"))
    output_dir.mkdir(parents=True, exist_ok=True)

    pattern = str(output_dir / "chunk_%03d.mp4")
    subprocess.run(
        [
            "ffmpeg", "-i", str(video_path),
            "-c", "copy",
            "-map", "0",
            "-segment_time", str(chunk_seconds),
            "-f", "segment",
            "-reset_timestamps", "1",
            pattern,
        ],
        check=True,
        capture_output=True,
        timeout=3600,
    )

    return sorted(output_dir.glob("chunk_*.mp4"))
```

## Cloud Run Job for Video Processing

```python
"""Cloud Run GPU job for batch video processing.

Deploy:
    gcloud run jobs create video-process \
        --image gcr.io/PROJECT/video-processor \
        --gpu 1 --gpu-type nvidia-l4 \
        --memory 16Gi --cpu 4 \
        --max-retries 2 --task-timeout 3600s
"""
import os
from pathlib import Path

from google.cloud import storage


def download_from_gcs(bucket_name: str, blob_name: str, local_path: Path) -> None:
    """Download a file from GCS."""
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    bucket.blob(blob_name).download_to_filename(str(local_path))


def upload_to_gcs(local_path: Path, bucket_name: str, blob_name: str) -> str:
    """Upload a file to GCS and return the gs:// URI."""
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    bucket.blob(blob_name).upload_from_filename(str(local_path))
    return f"gs://{bucket_name}/{blob_name}"


def cloud_run_main() -> None:
    """Entry point for Cloud Run job.

    Environment variables:
        INPUT_BUCKET: GCS bucket with source videos.
        OUTPUT_BUCKET: GCS bucket for processed output.
        VIDEO_KEY: Blob name of the video to process.
    """
    input_bucket = os.environ["INPUT_BUCKET"]
    output_bucket = os.environ["OUTPUT_BUCKET"]
    video_key = os.environ["VIDEO_KEY"]

    with video_workspace(prefix="cloud_run_") as workspace:
        local_video = workspace / "input.mp4"
        download_from_gcs(input_bucket, video_key, local_video)

        # Extract frames
        frames = extract_uniform_frames(local_video, num_frames=20)

        # Transcribe audio
        segments = transcribe_video(
            local_video,
            model_size="large-v3",
            device="cuda",
            compute_type="float16",
        )

        # Get metadata
        metadata = get_video_metadata(local_video)

        # Save outputs
        import json
        import numpy as np

        output_stem = Path(video_key).stem

        np.save(str(workspace / "frames.npy"), frames)
        upload_to_gcs(
            workspace / "frames.npy",
            output_bucket,
            f"{output_stem}/frames.npy",
        )

        transcript_data = {
            "metadata": {
                "duration": metadata.duration_seconds,
                "resolution": f"{metadata.width}x{metadata.height}",
                "fps": metadata.fps,
                "codec": metadata.codec,
            },
            "segments": [
                {"start": s.start, "end": s.end, "text": s.text}
                for s in segments
            ],
        }
        transcript_path = workspace / "transcript.json"
        transcript_path.write_text(json.dumps(transcript_data, indent=2))
        upload_to_gcs(
            transcript_path,
            output_bucket,
            f"{output_stem}/transcript.json",
        )


if __name__ == "__main__":
    cloud_run_main()
```

## Complete Pipeline: Video to AI-Ready Output

```python
"""End-to-end pipeline: video -> frames + transcript + metadata -> AI-ready payload.

Suitable for feeding into Gemini, GPT-4o, or Claude vision APIs.
"""
import base64
import io
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image


@dataclass
class AIReadyOutput:
    """Structured output ready for vision model consumption."""
    frames_base64: list[str]
    transcript_text: str
    segments: list[dict]
    metadata: dict
    scene_timestamps: list[tuple[float, float]]


def frame_to_base64(frame: np.ndarray, max_side: int = 1568) -> str:
    """Convert numpy frame to base64 JPEG, resizing if needed.

    Args:
        frame: RGB array of shape (H, W, 3).
        max_side: Maximum dimension (1568 for Claude, 512 for GPT-4o tiles).

    Returns:
        Base64-encoded JPEG string.
    """
    img = Image.fromarray(frame)

    # Resize if either dimension exceeds max_side
    if max(img.size) > max_side:
        ratio = max_side / max(img.size)
        new_size = (int(img.width * ratio), int(img.height * ratio))
        img = img.resize(new_size, Image.LANCZOS)

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def prepare_for_ai(
    video_path: str | Path,
    target_model: str = "claude",
    num_frames: int = 20,
    transcribe: bool = True,
) -> AIReadyOutput:
    """Full pipeline: extract frames, transcribe, gather metadata.

    Args:
        video_path: Path to input video.
        target_model: "claude" (max 600 frames, 1568px), "gpt4o" (max 20, 512px),
                      or "gemini" (1 FPS auto).
        num_frames: Number of frames to extract (ignored for gemini).
        transcribe: Whether to run audio transcription.

    Returns:
        AIReadyOutput with base64 frames, transcript, metadata, and scene info.
    """
    video_path = Path(video_path)

    # Configure per model
    model_config: dict[str, dict] = {
        "claude": {"max_frames": 600, "max_side": 1568},
        "gpt4o": {"max_frames": 20, "max_side": 512},  # ~20 per API call; batch calls for more
        "gemini": {"max_frames": 3600, "max_side": 1024},
    }
    config = model_config.get(target_model, model_config["claude"])
    effective_frames = min(num_frames, config["max_frames"])

    # 1. Detect scenes
    scenes = detect_scenes(video_path, method="content", threshold=27.0)

    # 2. Extract frames — use scene keyframes if enough scenes, else uniform
    if len(scenes) >= effective_frames:
        scene_keyframes = extract_scene_keyframes(video_path, scenes[:effective_frames])
        raw_frames = np.stack([f for _, f in scene_keyframes])
    else:
        raw_frames = extract_uniform_frames(video_path, effective_frames)

    # 3. Convert to base64
    frames_b64 = [
        frame_to_base64(frame, max_side=config["max_side"])
        for frame in raw_frames
    ]

    # 4. Transcribe audio
    segments: list[TranscriptSegment] = []
    transcript_text = ""
    if transcribe:
        segments = transcribe_video(video_path, device="cuda", compute_type="float16")
        transcript_text = " ".join(s.text for s in segments)

    # 5. Metadata
    meta = get_video_metadata(video_path)

    return AIReadyOutput(
        frames_base64=frames_b64,
        transcript_text=transcript_text,
        segments=[
            {"start": s.start, "end": s.end, "text": s.text}
            for s in segments
        ],
        metadata={
            "duration_seconds": meta.duration_seconds,
            "resolution": f"{meta.width}x{meta.height}",
            "fps": meta.fps,
            "codec": meta.codec,
            "rotation": meta.rotation,
            "creation_time": meta.creation_time,
        },
        scene_timestamps=scenes,
    )
```
