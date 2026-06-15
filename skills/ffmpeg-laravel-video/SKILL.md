---
name: ffmpeg-laravel-video
description: FFmpeg integration with Laravel for video processing. Thumbnail generation, format conversion, video metadata extraction, streaming. Use for video upload features, thumbnail generation, or media processing.
kb-sources:
  - wiki/software-engineering/ffmpeg-video
updated: 2026-04-18
---

# FFmpeg Video Processing in Laravel

Laravel wrapper for FFmpeg using `protonemedia/laravel-ffmpeg`.

## When to Use

- Generating video thumbnails
- Converting video formats
- Extracting video metadata (duration, resolution, codec)
- HLS/DASH streaming setup
- Video watermarking
- Processing uploaded videos
- Queue-based video processing

## Quick Setup Pattern

**Generate Thumbnail:**
```php
use ProtoneMedia\LaravelFFMpeg\Support\FFMpeg;

FFMpeg::fromDisk('s3')
    ->open('videos/input.mp4')
    ->getFrameFromSeconds(10)
    ->export()
    ->toDisk('s3')
    ->save('thumbnails/video-thumb.jpg');
```

**Convert Video Format:**
```php
FFMpeg::fromDisk('s3')
    ->open('videos/input.mov')
    ->export()
    ->inFormat(new \FFMpeg\Format\Video\X264)
    ->save('videos/output.mp4');
```

## Common Operations

| Operation | Use Case | Method |
|-----------|----------|--------|
| Thumbnail | Video preview | `getFrameFromSeconds(10)->save('thumb.jpg')` |
| Format conversion | MP4, WebM, AVI | `inFormat(new X264)->save('output.mp4')` |
| Metadata | Duration, resolution | `getDurationInSeconds()`, `getVideoStream()` |
| HLS streaming | Adaptive bitrate | `exportForHLS()->save('stream.m3u8')` |
| Watermark | Branding | `addFilter('-i', 'logo.png')` |

## Queue Pattern

**Queue-based processing recommended:** Video processing blocks HTTP requests. Queue jobs enable async processing with timeouts and retries.

```php
// Controller
class VideoController extends Controller
{
    public function upload(Request $request)
    {
        $path = $request->file('video')->store('videos', 's3');
        ProcessVideoJob::dispatch($path);
        return response()->json(['processing' => true]);
    }
}

// Job (basic structure - see examples.md for full implementation)
class ProcessVideoJob implements ShouldQueue
{
    use Queueable;

    public $timeout = 1800; // 30 minutes
    public $tries = 3;

    public function handle()
    {
        FFMpeg::fromDisk('s3')
            ->open($this->videoPath)
            ->getFrameFromSeconds(5)
            ->export()
            ->save('thumbnails/thumb.jpg');
    }
}
```

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| FFmpeg not found | Install via Dockerfile (see reference.md) (not installed in Docker) |
| Timeout | Use queue with `timeout = 1800` (synchronous processing) |
| Memory exhausted | Set PHP `memory_limit = 512M` (large video processing) |
| Missing codec | Install `ffmpeg` package (not `ffmpeg-lite`) (FFmpeg build incomplete) |

See **reference.md** for installation, HLS streaming, security hardening, format options.
See **examples.md** for complete job implementations, anti-patterns, Docker setup.
