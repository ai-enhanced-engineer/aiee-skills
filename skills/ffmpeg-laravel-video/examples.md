# FFmpeg Laravel Video Processing Examples

Real-world implementations showing FFmpeg integration with Laravel for video processing workflows.

## Complete Video Upload Workflow

### Controller

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\UploadVideoRequest;
use App\Jobs\ProcessVideoJob;
use App\Models\Video;
use Illuminate\Http\Request;

class VideoController extends Controller
{
    public function upload(UploadVideoRequest $request)
    {
        // Upload to S3
        $path = $request->file('video')->store('videos/uploads', 's3');

        // Create database record
        $video = Video::create([
            'user_id' => auth()->id(),
            'original_path' => $path,
            'filename' => $request->file('video')->getClientOriginalName(),
            'mime_type' => $request->file('video')->getMimeType(),
            'size' => $request->file('video')->getSize(),
            'status' => 'pending',
        ]);

        // Dispatch processing job
        ProcessVideoJob::dispatch($video->id);

        return response()->json([
            'message' => 'Video uploaded successfully. Processing in background.',
            'video_id' => $video->id,
        ], 201);
    }

    public function show($id)
    {
        $video = Video::where('user_id', auth()->id())->findOrFail($id);

        return response()->json($video);
    }
}
```

### FormRequest Validation

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadVideoRequest extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        return [
            'video' => [
                'required',
                'file',
                'mimes:mp4,mov,avi,wmv',
                'max:512000', // 500MB
            ],
        ];
    }

    public function messages()
    {
        return [
            'video.required' => 'Please select a video file.',
            'video.mimes' => 'Video must be MP4, MOV, AVI, or WMV format.',
            'video.max' => 'Video size must not exceed 500MB.',
        ];
    }
}
```

---

## Video Processing Job

### Complete Job Implementation

```php
<?php

namespace App\Jobs;

use App\Models\Video;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use ProtoneMedia\LaravelFFMpeg\Support\FFMpeg;
use ProtoneMedia\LaravelFFMpeg\Exceptions\EncodingException;
use FFMpeg\Format\Video\X264;

class ProcessVideoJob implements ShouldQueue
{
    use Queueable, InteractsWithQueue, SerializesModels;

    public $timeout = 3600; // 1 hour
    public $tries = 3;
    public $maxExceptions = 1;

    public function __construct(public int $videoId) {}

    public function handle()
    {
        $video = Video::findOrFail($this->videoId);

        try {
            // Update status
            $video->update(['status' => 'processing']);

            // Step 1: Extract metadata
            $this->extractMetadata($video);

            // Step 2: Generate thumbnail
            $this->generateThumbnail($video);

            // Step 3: Convert to H.264 (if needed)
            $this->convertVideo($video);

            // Step 4: Generate HLS playlist (optional)
            // $this->generateHLS($video);

            // Update status
            $video->update(['status' => 'completed', 'processed_at' => now()]);

            Log::info('Video processed successfully', ['video_id' => $this->videoId]);

        } catch (EncodingException $e) {
            Log::error('FFmpeg encoding failed', [
                'video_id' => $this->videoId,
                'error' => $e->getMessage(),
                'stack' => $e->getTraceAsString(),
            ]);

            $video->update(['status' => 'failed', 'error_message' => $e->getMessage()]);

            throw $e;
        }
    }

    private function extractMetadata(Video $video)
    {
        $media = FFMpeg::fromDisk('s3')->open($video->original_path);

        // Duration
        $duration = $media->getDurationInSeconds();

        // Video stream
        $videoStream = $media->getVideoStream();
        $width = $videoStream->get('width');
        $height = $videoStream->get('height');
        $codec = $videoStream->get('codec_name');
        $bitrate = $videoStream->get('bit_rate');

        // Update database
        $video->update([
            'duration' => $duration,
            'width' => $width,
            'height' => $height,
            'codec' => $codec,
            'bitrate' => $bitrate,
        ]);
    }

    private function generateThumbnail(Video $video)
    {
        $thumbnailPath = 'videos/thumbnails/' . basename($video->original_path, '.mp4') . '.jpg';

        // Extract frame at 5 seconds (or 25% through video if shorter)
        $extractTime = min(5, $video->duration * 0.25);

        FFMpeg::fromDisk('s3')
            ->open($video->original_path)
            ->getFrameFromSeconds($extractTime)
            ->export()
            ->toDisk('s3')
            ->save($thumbnailPath);

        $video->update(['thumbnail_path' => $thumbnailPath]);
    }

    private function convertVideo(Video $video)
    {
        // Only convert if not already H.264
        if ($video->codec === 'h264') {
            $video->update(['processed_path' => $video->original_path]);
            return;
        }

        $processedPath = 'videos/processed/' . basename($video->original_path, '.' . pathinfo($video->original_path, PATHINFO_EXTENSION)) . '.mp4';

        $format = (new X264)
            ->setKiloBitrate(3000)
            ->setAudioCodec('aac')
            ->setAudioKiloBitrate(192);

        FFMpeg::fromDisk('s3')
            ->open($video->original_path)
            ->export()
            ->inFormat($format)
            ->toDisk('s3')
            ->save($processedPath);

        $video->update(['processed_path' => $processedPath]);
    }

    private function generateHLS(Video $video)
    {
        $hlsPath = 'videos/hls/' . basename($video->original_path, '.mp4') . '.m3u8';

        $lowBitrate = (new X264)->setKiloBitrate(500);
        $midBitrate = (new X264)->setKiloBitrate(1500);
        $highBitrate = (new X264)->setKiloBitrate(3000);

        FFMpeg::fromDisk('s3')
            ->open($video->processed_path)
            ->exportForHLS()
            ->setSegmentLength(10)
            ->addFormat($lowBitrate, function ($media) {
                $media->addFilter('scale=-2:360');
            })
            ->addFormat($midBitrate, function ($media) {
                $media->addFilter('scale=-2:720');
            })
            ->addFormat($highBitrate)
            ->toDisk('s3')
            ->save($hlsPath);

        $video->update(['hls_path' => $hlsPath]);
    }
}
```

---

## Video Model

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Video extends Model
{
    protected $fillable = [
        'user_id',
        'original_path',
        'processed_path',
        'thumbnail_path',
        'hls_path',
        'filename',
        'mime_type',
        'size',
        'duration',
        'width',
        'height',
        'codec',
        'bitrate',
        'status',
        'error_message',
        'processed_at',
    ];

    protected $casts = [
        'duration' => 'float',
        'size' => 'integer',
        'width' => 'integer',
        'height' => 'integer',
        'bitrate' => 'integer',
        'processed_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function getThumbnailUrlAttribute()
    {
        return $this->thumbnail_path
            ? Storage::disk('s3')->url($this->thumbnail_path)
            : null;
    }

    public function getVideoUrlAttribute()
    {
        return $this->processed_path
            ? Storage::disk('s3')->temporaryUrl($this->processed_path, now()->addHours(2))
            : null;
    }

    public function getHlsUrlAttribute()
    {
        return $this->hls_path
            ? Storage::disk('s3')->url($this->hls_path)
            : null;
    }

    public function getFormattedDurationAttribute()
    {
        if (!$this->duration) return null;

        $minutes = floor($this->duration / 60);
        $seconds = $this->duration % 60;

        return sprintf('%d:%02d', $minutes, $seconds);
    }

    public function getFormattedSizeAttribute()
    {
        $units = ['B', 'KB', 'MB', 'GB'];
        $size = $this->size;
        $unit = 0;

        while ($size >= 1024 && $unit < count($units) - 1) {
            $size /= 1024;
            $unit++;
        }

        return round($size, 2) . ' ' . $units[$unit];
    }
}
```

---

## Migration

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::create('videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
            $table->string('original_path');
            $table->string('processed_path')->nullable();
            $table->string('thumbnail_path')->nullable();
            $table->string('hls_path')->nullable();
            $table->string('filename');
            $table->string('mime_type');
            $table->bigInteger('size');              // bytes
            $table->float('duration')->nullable();    // seconds
            $table->integer('width')->nullable();     // pixels
            $table->integer('height')->nullable();    // pixels
            $table->string('codec')->nullable();      // h264, hevc, etc.
            $table->bigInteger('bitrate')->nullable(); // bits per second
            $table->enum('status', ['pending', 'processing', 'completed', 'failed'])->default('pending');
            $table->text('error_message')->nullable();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down()
    {
        Schema::dropIfExists('videos');
    }
};
```

---

## Docker Setup

### Dockerfile for FFmpeg

```dockerfile
FROM php:8.1-fpm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    zip \
    unzip \
    ffmpeg

# Clear cache
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# Verify FFmpeg installation
RUN ffmpeg -version

# Set working directory
WORKDIR /var/www
```

### Laravel Sail Customization

**docker/8.1/Dockerfile:**

```dockerfile
FROM sail-8.1/app

# Install FFmpeg
USER root

RUN apt-get update \
    && apt-get install -y ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Verify installation
RUN ffmpeg -version

USER sail
```

---

## Queue Configuration

### config/queue.php

```php
'connections' => [
    'redis' => [
        'driver' => 'redis',
        'connection' => 'default',
        'queue' => env('REDIS_QUEUE', 'default'),
        'retry_after' => 7200, // 2 hours (longer than job timeout)
        'block_for' => null,
    ],
],
```

### Supervisor Config

**supervisord.conf:**

```ini
[program:laravel-worker-videos]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/artisan queue:work redis --queue=videos --timeout=3600 --memory=512 --tries=3 --sleep=3
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
user=www-data
numprocs=2
redirect_stderr=true
stdout_logfile=/var/www/storage/logs/worker.log
stopwaitsecs=3700
```

---

## API Routes

```php
<?php

use App\Http\Controllers\VideoController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/videos', [VideoController::class, 'upload']);
    Route::get('/videos/{id}', [VideoController::class, 'show']);
    Route::get('/videos', [VideoController::class, 'index']);
    Route::delete('/videos/{id}', [VideoController::class, 'destroy']);
});
```

---

## Testing

### Feature Test

```php
<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\Video;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class VideoUploadTest extends TestCase
{
    use RefreshDatabase;

    public function test__upload__valid_video__creates_video_and_dispatches_job()
    {
        Queue::fake();
        Storage::fake('s3');

        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('video.mp4', 10240, 'video/mp4');

        $response = $this->actingAs($user)
            ->postJson('/api/videos', ['video' => $file]);

        $response->assertStatus(201);
        $response->assertJsonStructure(['video_id', 'message']);

        // Assert video created
        $this->assertDatabaseHas('videos', [
            'user_id' => $user->id,
            'status' => 'pending',
        ]);

        // Assert file uploaded
        Storage::disk('s3')->assertExists('videos/uploads/' . $file->hashName());

        // Assert job dispatched
        Queue::assertPushed(\App\Jobs\ProcessVideoJob::class);
    }

    public function test__upload__invalid_mime_type__returns_error()
    {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->create('file.txt', 1024, 'text/plain');

        $response = $this->actingAs($user)
            ->postJson('/api/videos', ['video' => $file]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['video']);
    }
}
```

This provides a complete, production-ready video processing workflow with FFmpeg in Laravel!
