# Laravel S3 Storage Examples

Example implementations for a production Laravel app showing Laravel S3 file upload patterns.

## Example S3 Configuration

### Filesystem Configuration

**File:** `config/filesystems.php`

```php
<?php

return [
    'default' => env('FILESYSTEM_DRIVER', 'local'),

    'disks' => [
        'local' => [
            'driver' => 'local',
            'root' => storage_path('app'),
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'cache' => [
                'store' => 'memcached',
                'expire' => 600,
                'prefix' => 'cache-prefix',
            ],
        ],
    ],

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],
];
```

### Environment Variables

**File:** `.env.example`

```bash
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=your-bucket-name
AWS_URL=https://your-bucket.s3.us-east-1.amazonaws.com
```

---

## File Upload Action Pattern

This example shows S3-specific file uploads using the Action pattern. For general Action pattern architecture and repository integration, see `laravel-modern-patterns/examples.md` Section 2 (Item Detection Example).

## Shape Image Upload

### Action Class (Business Logic)

**File:** `app/Actions/Items/SaveItemAction.php`

```php
<?php

namespace App\Actions\Shapes;

use App\Repositories\ShapeRepository;
use Illuminate\Support\Facades\Storage;

class SaveItemAction
{
    private $shapeRepository;

    public function __construct(ShapeRepository $shapeRepository)
    {
        $this->shapeRepository = $shapeRepository;
    }

    public function execute($file, $userId, $shape)
    {
        // Upload to S3 with public visibility
        $path = Storage::disk('s3')->put('items', $file, 'public');

        // Get public URL
        $url = Storage::disk('s3')->url($path);

        // Save to database
        return $this->shapeRepository->save($userId, $shape, $url);
    }
}
```

**Key Points:**
- Uploads to `shapes/` folder in S3
- Uses `'public'` visibility for user-accessible images
- Returns public URL for immediate use
- Repository handles database persistence

### Controller (HTTP Layer)

**File:** `app/Http/Controllers/ItemController.php`

```php
<?php

namespace App\Http\Controllers;

use App\Actions\Shapes\SaveItemAction;
use Illuminate\Http\Request;

class ItemController extends Controller
{
    public function save(Request $request, SaveItemAction $action)
    {
        // Validate upload
        $validated = $request->validate([
            'image' => 'required|image|mimes:jpeg,jpg,png|max:2048',
            'shape' => 'required|string|max:255',
        ]);

        // Execute action
        $shape = $action->execute(
            $validated['image'],
            auth()->id(),
            $validated['shape']
        );

        return response()->json([
            'message' => 'Shape saved successfully',
            'shape' => $shape,
        ], 201);
    }
}
```

**Validation Rules:**
- `image` - Must be valid image file
- `mimes:jpeg,jpg,png` - Only JPEG and PNG allowed
- `max:2048` - Max 2MB file size
- `shape` - Shape name (string, max 255 chars)

---

## Complete File Upload Example

### Enhanced Upload Action with Validation

```php
<?php

namespace App\Actions;

use App\Repositories\FileRepository;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class UploadFileAction
{
    private $fileRepository;

    public function __construct(FileRepository $fileRepository)
    {
        $this->fileRepository = $fileRepository;
    }

    public function execute($file, $userId, $visibility = 'public')
    {
        // Generate unique filename
        $filename = Str::uuid() . '.' . $file->getClientOriginalExtension();

        // Upload to S3
        $path = Storage::disk('s3')->putFileAs(
            'uploads',
            $file,
            $filename,
            $visibility
        );

        // Get URL based on visibility
        if ($visibility === 'public') {
            $url = Storage::disk('s3')->url($path);
        } else {
            // Generate signed URL for private files (expires in 1 hour)
            $url = Storage::disk('s3')->temporaryUrl(
                $path,
                now()->addHour()
            );
        }

        // Save metadata to database
        return $this->fileRepository->create([
            'user_id' => $userId,
            'path' => $path,
            'url' => $url,
            'filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'visibility' => $visibility,
        ]);
    }
}
```

### FormRequest for Upload Validation

**File:** `app/Http/Requests/UploadImageRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadImageRequest extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        return [
            'image' => [
                'required',
                'image',
                'mimes:jpeg,jpg,png,gif',
                'max:2048', // 2MB
                'dimensions:min_width=100,min_height=100,max_width=4000,max_height=4000',
            ],
        ];
    }

    public function messages()
    {
        return [
            'image.required' => 'Please upload an image.',
            'image.image' => 'The uploaded file must be an image.',
            'image.mimes' => 'Only JPEG, PNG, and GIF images are allowed.',
            'image.max' => 'Image size must not exceed 2MB.',
            'image.dimensions' => 'Image dimensions must be between 100x100 and 4000x4000 pixels.',
        ];
    }
}
```

### Controller with FormRequest

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\UploadImageRequest;
use App\Actions\UploadFileAction;

class ImageController extends Controller
{
    public function upload(UploadImageRequest $request, UploadFileAction $action)
    {
        // Request is already validated by FormRequest
        $file = $action->execute(
            $request->file('image'),
            auth()->id(),
            'public'
        );

        return response()->json([
            'message' => 'Image uploaded successfully',
            'file' => [
                'url' => $file->url,
                'filename' => $file->filename,
                'size' => $file->size,
            ],
        ], 201);
    }
}
```

---

## Private File with Signed URLs

### Document Upload (Private)

```php
<?php

namespace App\Actions\Documents;

use App\Repositories\DocumentRepository;
use Illuminate\Support\Facades\Storage;

class UploadDocumentAction
{
    private $documentRepository;

    public function __construct(DocumentRepository $documentRepository)
    {
        $this->documentRepository = $documentRepository;
    }

    public function execute($file, $userId)
    {
        // Upload as private file (no third parameter = private)
        $path = Storage::disk('s3')->put('documents', $file);

        // Save to database
        $document = $this->documentRepository->create([
            'user_id' => $userId,
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
        ]);

        return $document;
    }

    public function getDownloadUrl($documentPath, $expiresInMinutes = 5)
    {
        // Generate temporary signed URL
        return Storage::disk('s3')->temporaryUrl(
            $documentPath,
            now()->addMinutes($expiresInMinutes),
            [
                'ResponseContentDisposition' => 'attachment',
            ]
        );
    }
}
```

### Controller for Document Download

```php
<?php

namespace App\Http\Controllers;

use App\Models\Document;
use App\Actions\Documents\UploadDocumentAction;

class DocumentController extends Controller
{
    public function download($id, UploadDocumentAction $action)
    {
        $document = Document::where('user_id', auth()->id())
            ->findOrFail($id);

        // Generate signed URL (expires in 5 minutes)
        $url = $action->getDownloadUrl($document->path, 5);

        return redirect($url);
    }
}
```

---

## Streaming Large Files

### Video Upload (Memory Efficient)

```php
<?php

namespace App\Actions\Videos;

use App\Repositories\VideoRepository;
use Illuminate\Support\Facades\Storage;

class UploadVideoAction
{
    private $videoRepository;

    public function __construct(VideoRepository $videoRepository)
    {
        $this->videoRepository = $videoRepository;
    }

    public function execute($file, $userId)
    {
        // Stream upload for large files (memory efficient)
        $stream = fopen($file->getRealPath(), 'r');
        $path = Storage::disk('s3')->put(
            'videos/' . $file->hashName(),
            $stream,
            'private'
        );
        fclose($stream);

        // Save metadata
        return $this->videoRepository->create([
            'user_id' => $userId,
            'path' => $path,
            'filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'duration' => null, // Set by FFmpeg processing job
        ]);
    }
}
```

### Stream Download to Browser

```php
<?php

namespace App\Http\Controllers;

use App\Models\Video;
use Illuminate\Support\Facades\Storage;

class VideoController extends Controller
{
    public function stream($id)
    {
        $video = Video::where('user_id', auth()->id())
            ->findOrFail($id);

        // Stream video to browser (memory efficient)
        return response()->streamDownload(function () use ($video) {
            $stream = Storage::disk('s3')->readStream($video->path);
            fpassthru($stream);
            fclose($stream);
        }, $video->filename, [
            'Content-Type' => $video->mime_type,
        ]);
    }
}
```

---

## S3 Bucket Policy Examples

### Public Read for Specific Folder

**Allow public access to `/public/*` folder only:**

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::your-bucket/public/*"
        }
    ]
}
```

### CORS Configuration for Direct Upload

**S3 Bucket CORS Configuration:**

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "POST", "PUT"],
        "AllowedOrigins": [
            "https://yourdomain.com",
            "http://localhost:3000"
        ],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

---

## Before/After: Security Improvements

### Before: Insecure Upload

```php
<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class UnsafeController extends Controller
{
    public function upload(Request $request)
    {
        // ❌ WRONG: No validation
        $file = $request->file('file');

        // ❌ WRONG: No MIME type check (security risk!)
        $path = Storage::disk('s3')->put('uploads', $file, 'public');

        return response()->json(['url' => Storage::disk('s3')->url($path)]);
    }
}
```

**Issues:**
- No file validation (user can upload malware)
- No size limit (user can fill bucket)
- No MIME type check (security vulnerability)
- No authentication (anyone can upload)

---

### After: Secure Upload

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\UploadFileRequest;
use App\Actions\UploadFileAction;

class SecureController extends Controller
{
    public function __construct()
    {
        $this->middleware('auth');
    }

    public function upload(UploadFileRequest $request, UploadFileAction $action)
    {
        // ✅ CORRECT: Validated by FormRequest
        // ✅ CORRECT: Authenticated user required
        // ✅ CORRECT: Business logic in Action class

        $file = $action->execute(
            $request->file('file'),
            auth()->id(),
            'public'
        );

        return response()->json([
            'message' => 'File uploaded successfully',
            'url' => $file->url,
        ], 201);
    }
}
```

**File:** `app/Http/Requests/UploadFileRequest.php`

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UploadFileRequest extends FormRequest
{
    public function authorize()
    {
        return true;
    }

    public function rules()
    {
        return [
            'file' => [
                'required',
                'file',
                'mimes:jpeg,jpg,png,pdf,docx',
                'max:5120', // 5MB
            ],
        ];
    }
}
```

**Improvements:**
- ✅ Authentication required
- ✅ File validation (MIME type, size)
- ✅ Separation of concerns (Action class)
- ✅ Proper error handling

---

## IAM Policy for Laravel Application

### Minimum Required Permissions

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ListBucket",
            "Effect": "Allow",
            "Action": "s3:ListBucket",
            "Resource": "arn:aws:s3:::your-bucket"
        },
        {
            "Sid": "ObjectOperations",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:PutObjectAcl"
            ],
            "Resource": "arn:aws:s3:::your-bucket/*"
        }
    ]
}
```

**What Each Permission Does:**
- `s3:ListBucket` - List files in bucket (for `exists()`, `files()`)
- `s3:PutObject` - Upload files
- `s3:GetObject` - Download files
- `s3:DeleteObject` - Delete files
- `s3:PutObjectAcl` - Set file visibility (public/private)

---

This combines real-world implementation patterns with production security best practices!
