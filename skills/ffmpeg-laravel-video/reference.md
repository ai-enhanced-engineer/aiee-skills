# FFmpeg Laravel Video Processing Reference

Comprehensive guide to FFmpeg integration with Laravel using protonemedia/laravel-ffmpeg.

## Package Overview

**Package:** `protonemedia/laravel-ffmpeg-pro`
**FFmpeg Version:** 4.4+ / 5.0+
**Laravel:** 8.x - 11.x
**PHP:** 8.1+

### Core Capabilities

- Thumbnail generation (single/multiple frames)
- Video format conversion (MP4, WebM, AVI, MOV)
- HLS/DASH adaptive streaming
- Metadata extraction (FFprobe)
- Watermarking and overlays
- Video concatenation
- Custom FFmpeg filters

---

## Thumbnail Generation

### Single Thumbnail (Seeking - 3.8x Faster)

```php
use ProtoneMedia\LaravelFFMpeg\Support\FFMpeg;

// Extract frame at specific time (fastest method)
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->getFrameFromSeconds(10)        // Seek to 10 seconds
    ->export()
    ->toDisk('s3')
    ->save('thumbnails/thumb.jpg');

// Alternative: String format
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->getFrameFromString('00:00:10.00')
    ->export()
    ->toDisk('s3')
    ->save('thumbnails/thumb.jpg');
```

### Multiple Thumbnails

```php
// Export frames at specific times
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->exportFramesBySeconds([5, 10, 15, 20])
    ->toDisk('s3')
    ->save('thumbnails/thumb_%03d.jpg');
// Creates: thumb_001.jpg, thumb_002.jpg, thumb_003.jpg, thumb_004.jpg

// Export frames at specific percentages
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->exportFramesByPercentage([25, 50, 75])
    ->toDisk('s3')
    ->save('thumbnails/thumb_%03d.jpg');
```

### Thumbnail Sprite/Tile Generation

```php
// Generate single image with multiple frames (VTT preview)
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->exportTile(function (\ProtoneMedia\LaravelFFMpeg\Exporters\TileExporter $tile) {
        $tile->interval(10)              // Every 10 seconds
             ->grid(5, 4)                 // 5 columns, 4 rows (20 thumbs)
             ->scale(160, 90);            // Each thumbnail size
    })
    ->toDisk('s3')
    ->save('thumbnails/sprite.jpg');
```

---

## Format Conversion

### Basic H.264 Conversion

```php
use FFMpeg\Format\Video\X264;

$format = (new X264)
    ->setKiloBitrate(5000)         // 5 Mbps video
    ->setAudioCodec('aac')
    ->setAudioKiloBitrate(192);    // 192 kbps audio

FFMpeg::fromDisk('s3')
    ->open('videos/input.mov')
    ->export()
    ->inFormat($format)
    ->toDisk('s3')
    ->save('videos/output.mp4');
```

### Multi-Format Export

```php
$formats = [
    (new X264('aac'))->setKiloBitrate(5000),  // High quality
    (new X264('aac'))->setKiloBitrate(2000),  // Medium quality
    (new \FFMpeg\Format\Video\WebM)->setKiloBitrate(1000), // Low quality WebM
];

foreach ($formats as $index => $format) {
    FFMpeg::fromDisk('s3')
        ->open('videos/input.mov')
        ->export()
        ->inFormat($format)
        ->save("videos/output_{$index}.mp4");
}
```

---

## Metadata Extraction

### Video Information

```php
$media = FFMpeg::fromDisk('s3')->open('videos/video.mp4');

// Duration
$duration = $media->getDurationInSeconds();         // 120.5
$formattedDuration = $media->getDurationInMiliseconds(); // 120500

// Video stream
$videoStream = $media->getVideoStream();
$width = $videoStream->get('width');                // 1920
$height = $videoStream->get('height');              // 1080
$codecName = $videoStream->get('codec_name');       // h264
$bitrate = $videoStream->get('bit_rate');           // 5000000
$fps = $videoStream->get('r_frame_rate');           // 30/1

// Audio stream
$audioStream = $media->getAudioStream();
$audioCodec = $audioStream->get('codec_name');      // aac
$sampleRate = $audioStream->get('sample_rate');     // 48000
$channels = $audioStream->get('channels');          // 2
```

### Validation Before Processing

```php
public function validateVideo($path)
{
    $media = FFMpeg::fromDisk('s3')->open($path);

    // Check duration (e.g., max 30 minutes)
    if ($media->getDurationInSeconds() > 1800) {
        throw new \Exception('Video exceeds maximum duration');
    }

    // Check resolution (e.g., max 1920x1080)
    $stream = $media->getVideoStream();
    if ($stream->get('width') > 1920 || $stream->get('height') > 1080) {
        throw new \Exception('Video resolution too high');
    }

    // Check codec (only allow H.264)
    if ($stream->get('codec_name') !== 'h264') {
        throw new \Exception('Only H.264 codec allowed');
    }

    return true;
}
```

---

## HLS Streaming

### Basic HLS Export

```php
use FFMpeg\Format\Video\X264;

$lowBitrate = (new X264)->setKiloBitrate(500);
$midBitrate = (new X264)->setKiloBitrate(1500);
$highBitrate = (new X264)->setKiloBitrate(3000);

FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->exportForHLS()
    ->setSegmentLength(10)              // 10-second segments
    ->addFormat($lowBitrate, function ($media) {
        $media->addFilter('scale=-2:360'); // 360p
    })
    ->addFormat($midBitrate, function ($media) {
        $media->addFilter('scale=-2:720'); // 720p
    })
    ->addFormat($highBitrate)              // Original quality
    ->toDisk('s3')
    ->save('streams/video.m3u8');
```

### Encrypted HLS (AES-128)

```php
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->exportForHLS()
    ->withEncryptionKey(
        \Illuminate\Support\Str::random(16), // 128-bit key
        url('/api/hls/key')                   // Key URL
    )
    ->save('streams/video.m3u8');
```

---

## Advanced Features

### Watermark

```php
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->addFilter(['-i', storage_path('watermark.png')])
    ->addFilter([
        '-filter_complex',
        '[0:v][1:v]overlay=W-w-10:H-h-10' // Bottom right corner
    ])
    ->export()
    ->save('videos/watermarked.mp4');
```

### Video Concatenation

```php
use ProtoneMedia\LaravelFFMpeg\FFMpeg\ConcatFilter;

FFMpeg::fromDisk('s3')
    ->open(['video1.mp4', 'video2.mp4', 'video3.mp4'])
    ->addFilter(new ConcatFilter)
    ->export()
    ->toDisk('s3')
    ->save('videos/combined.mp4');
```

### Custom Filters

```php
// Black and white filter
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->addFilter('-vf', 'hue=s=0')
    ->export()
    ->save('videos/bw.mp4');

// Speed up 2x
FFMpeg::fromDisk('s3')
    ->open('videos/video.mp4')
    ->addFilter('-vf', 'setpts=0.5*PTS')
    ->export()
    ->save('videos/fast.mp4');
```

---

## Queue Integration

### Job Implementation

```php
namespace App\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use ProtoneMedia\LaravelFFMpeg\Support\FFMpeg;
use ProtoneMedia\LaravelFFMpeg\Exceptions\EncodingException;

class ProcessVideoJob implements ShouldQueue
{
    use Queueable, InteractsWithQueue, SerializesModels;

    public $timeout = 3600; // 1 hour
    public $tries = 3;
    public $maxExceptions = 1;

    public function __construct(
        public string $videoPath,
        public int $videoId
    ) {}

    public function handle()
    {
        try {
            // Update status
            \App\Models\Video::find($this->videoId)->update(['status' => 'processing']);

            // Generate thumbnail
            FFMpeg::fromDisk('s3')
                ->open($this->videoPath)
                ->getFrameFromSeconds(5)
                ->export()
                ->toDisk('s3')
                ->save($this->getThumbnailPath());

            // Convert to H.264
            $format = (new \FFMpeg\Format\Video\X264)
                ->setKiloBitrate(3000)
                ->setAudioCodec('aac')
                ->setAudioKiloBitrate(192);

            FFMpeg::fromDisk('s3')
                ->open($this->videoPath)
                ->export()
                ->inFormat($format)
                ->toDisk('s3')
                ->save($this->getConvertedPath());

            // Update status
            \App\Models\Video::find($this->videoId)->update([
                'status' => 'completed',
                'thumbnail_path' => $this->getThumbnailPath(),
                'processed_path' => $this->getConvertedPath(),
            ]);

        } catch (EncodingException $e) {
            \Log::error('FFmpeg encoding failed', [
                'video_id' => $this->videoId,
                'error' => $e->getMessage(),
            ]);

            \App\Models\Video::find($this->videoId)->update(['status' => 'failed']);

            throw $e;
        }
    }

    private function getThumbnailPath()
    {
        return str_replace('.mp4', '_thumb.jpg', $this->videoPath);
    }

    private function getConvertedPath()
    {
        return str_replace('.mp4', '_converted.mp4', $this->videoPath);
    }
}
```

### Queue Configuration

**config/queue.php:**

```php
'connections' => [
    'redis' => [
        'driver' => 'redis',
        'connection' => 'default',
        'queue' => env('REDIS_QUEUE', 'default'),
        'retry_after' => 7200, // 2 hours
        'block_for' => null,
    ],
],
```

**Supervisor Configuration:**

```ini
[program:laravel-worker-video]
process_name=%(program_name)s_%(process_num)02d
command=php /path/to/artisan queue:work redis --queue=videos --timeout=3600 --memory=512 --tries=3
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/path/to/worker.log
stopwaitsecs=3700
```

---

## Docker Installation

### Dockerfile

```dockerfile
FROM php:8.1-fpm

# Install FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Verify installation
RUN ffmpeg -version
```

### Laravel Sail Customization

**docker/8.1/Dockerfile:**

```dockerfile
FROM sail-8.1/app

# Install FFmpeg
RUN apt-get update \
    && apt-get install -y ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
```

**docker-compose.yml:**

```yaml
services:
    laravel.test:
        build:
            context: ./docker/8.1
            dockerfile: Dockerfile
```

---

## Anti-Patterns

### 1. Synchronous Processing

```php
// ❌ WRONG: Blocks HTTP request
public function upload(Request $request) {
    $path = $request->file('video')->store('videos');
    FFMpeg::open($path)->export()->save('output.mp4'); // Takes minutes!
    return response()->json(['done']);
}

// ✅ CORRECT: Queue-based
public function upload(Request $request) {
    $path = $request->file('video')->store('videos', 's3');
    ProcessVideoJob::dispatch($path, $videoId);
    return response()->json(['processing' => true]);
}
```

### 2. Missing Error Handling

```php
// ❌ WRONG: No error handling
FFMpeg::open('video.mp4')->getFrameFromSeconds(10)->save('thumb.jpg');

// ✅ CORRECT: Try-catch
try {
    FFMpeg::open('video.mp4')->getFrameFromSeconds(10)->save('thumb.jpg');
} catch (EncodingException $e) {
    Log::error('FFmpeg failed: ' . $e->getMessage());
    // Notify user, retry, or mark as failed
}
```

### 3. No Memory/Timeout Limits

```php
// ❌ WRONG: Default PHP limits (120s, 128M)
class ProcessVideoJob implements ShouldQueue {}

// ✅ CORRECT: Explicit limits
class ProcessVideoJob implements ShouldQueue {
    public $timeout = 3600; // 1 hour
    // php.ini: memory_limit = 512M
}
```

### 4. Missing FFmpeg in Docker

```dockerfile
# ❌ WRONG: No FFmpeg
FROM php:8.1-fpm

# ✅ CORRECT: FFmpeg installed
FROM php:8.1-fpm
RUN apt-get update && apt-get install -y ffmpeg
```

---

## Performance Benchmarks

| Operation | Video (1080p, 120s) | Time (Seeking) | Time (FPS Filter) | Speedup |
|-----------|---------------------|----------------|-------------------|---------|
| Single thumbnail | H.264, 5Mbps | 10s | 38s | 3.8x |
| 10 thumbnails | H.264, 5Mbps | 15s | 45s | 3.0x |
| Format conversion | MOV → MP4 | 120s | N/A | N/A |
| HLS 3-variant | 1080p source | 180s | N/A | N/A |

**Performance note:** Seeking (`getFrameFromSeconds`) is 3.8x faster than fps filtering for thumbnail generation.

---

## Official Documentation

- [protonemedia/laravel-ffmpeg GitHub](https://github.com/protonemedia/laravel-ffmpeg)
- [FFmpeg Official Documentation](https://ffmpeg.org/documentation.html)
- [Pascal Baljet - How to use FFmpeg in Laravel](https://pascalbaljet.dev/how-to-use-ffmpeg-in-your-laravel-projects)
- [Quantizd - Transcoding Videos with Laravel Queues](https://quantizd.com/transcoding-videos-using-ffmpeg-and-laravel-queues/)
