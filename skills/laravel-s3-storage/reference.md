# Laravel S3 Storage Reference

Comprehensive guide to Laravel Flysystem S3 integration including security best practices, bucket configuration, and advanced patterns.

## Configuration

### Basic S3 Disk Setup

**File:** `config/filesystems.php`

```php
'disks' => [
    's3' => [
        'driver' => 's3',
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION'),
        'bucket' => env('AWS_BUCKET'),
        'url' => env('AWS_URL'),
        'endpoint' => env('AWS_ENDPOINT'),
        'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),

        // Optional: Response caching
        'cache' => [
            'store' => 'memcached',
            'expire' => 600,
            'prefix' => 'cache-prefix',
        ],
    ],
],
```

### Credential Management Best Practices

#### Recommended: IAM Roles (EC2/ECS/Lambda)

When running Laravel on AWS infrastructure, **prefer IAM roles over access keys**:

```php
// Remove these from .env when using IAM roles
// AWS_ACCESS_KEY_ID=
// AWS_SECRET_ACCESS_KEY=
```

**Why IAM Roles are Better:**
- Credentials auto-rotate every 6-12 hours
- No long-lived credentials in `.env` files
- Reduces credential leak risk
- Simplifies key rotation

#### Development: Access Keys

For local development, use access keys with **minimum required permissions**:

```bash
# .env
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=my-app-bucket
```

**Security:** Never commit `.env` to version control. Use `.env.example` with placeholder values.

---

## Storage Operations

### Upload Files

#### Basic Upload

```php
use Illuminate\Support\Facades\Storage;

// Upload to root of bucket
$path = Storage::disk('s3')->put('file.jpg', $fileContents);

// Upload to specific folder
$path = Storage::disk('s3')->put('images', $file);
// Returns: images/randomHash.jpg

// Upload with custom filename
$path = Storage::disk('s3')->putFileAs('images', $file, 'custom-name.jpg');
// Returns: images/custom-name.jpg
```

#### Upload with Visibility

```php
// Public file (readable by anyone)
$path = Storage::disk('s3')->put('images', $file, 'public');

// Private file (requires signed URL)
$path = Storage::disk('s3')->put('documents', $file, 'private');
// Note: 'private' is default if not specified
```

### Download Files

```php
// Get file contents
$contents = Storage::disk('s3')->get('path/to/file.jpg');

// Check if file exists
if (Storage::disk('s3')->exists('path/to/file.jpg')) {
    // File exists
}

// Get file size
$size = Storage::disk('s3')->size('path/to/file.jpg'); // In bytes

// Get file last modified timestamp
$lastModified = Storage::disk('s3')->lastModified('path/to/file.jpg');
```

### Delete Files

```php
// Delete single file
Storage::disk('s3')->delete('path/to/file.jpg');

// Delete multiple files
Storage::disk('s3')->delete([
    'path/to/file1.jpg',
    'path/to/file2.jpg',
]);

// Delete directory
Storage::disk('s3')->deleteDirectory('images/temp');
```

---

## Public vs Private Files

### Public Files

**Use case:** User profile pictures, blog post images, public assets

```php
// Upload with public visibility
$path = Storage::disk('s3')->put('avatars', $file, 'public');

// Get permanent public URL
$url = Storage::disk('s3')->url($path);
// Returns: https://bucket.s3.region.amazonaws.com/avatars/abc123.jpg
```

**S3 Bucket Policy for Public Read:**

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

**Note:** Only make specific folders public (e.g., `/public/*`), not the entire bucket.

### Private Files

**Use case:** User documents, invoices, sensitive data

```php
// Upload as private (default)
$path = Storage::disk('s3')->put('invoices', $file);

// Generate signed URL (expires in 5 minutes)
$url = Storage::disk('s3')->temporaryUrl(
    $path,
    now()->addMinutes(5)
);
// Returns: https://bucket.s3.region.amazonaws.com/invoices/file.pdf?X-Amz-Expires=300&X-Amz-Signature=...

// Custom expiration
$url = Storage::disk('s3')->temporaryUrl(
    $path,
    now()->addHours(24),
    [
        'ResponseContentType' => 'application/pdf',
        'ResponseContentDisposition' => 'attachment; filename=invoice.pdf',
    ]
);
```

---

## File Validation

### FormRequest Validation

**Create FormRequest:**

```bash
php artisan make:request UploadImageRequest
```

**File:** `app/Http/Requests/UploadImageRequest.php`

```php
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
                'image',                      // Must be image
                'mimes:jpeg,jpg,png,gif',     // Allowed MIME types
                'max:2048',                   // Max 2MB
                'dimensions:min_width=100,min_height=100,max_width=4000,max_height=4000',
            ],
        ];
    }

    public function messages()
    {
        return [
            'image.required' => 'Please upload an image.',
            'image.image' => 'File must be an image.',
            'image.mimes' => 'Image must be jpeg, jpg, png, or gif.',
            'image.max' => 'Image must not exceed 2MB.',
            'image.dimensions' => 'Image must be between 100x100 and 4000x4000 pixels.',
        ];
    }
}
```

**Controller Usage:**

```php
use App\Http\Requests\UploadImageRequest;

public function upload(UploadImageRequest $request)
{
    // Request is already validated!
    $path = Storage::disk('s3')->put('images', $request->file('image'), 'public');
    $url = Storage::disk('s3')->url($path);

    return response()->json(['url' => $url]);
}
```

### Common Validation Rules

| Rule | Example | Purpose |
|------|---------|---------|
| `required` | `'file' => 'required'` | File must be present |
| `file` | `'file' => 'file'` | Must be uploaded file |
| `image` | `'file' => 'image'` | Must be image (jpeg, png, bmp, gif, svg, webp) |
| `mimes` | `'file' => 'mimes:pdf,docx'` | Specific MIME types |
| `mimetypes` | `'file' => 'mimetypes:video/mp4'` | Exact MIME type |
| `max` | `'file' => 'max:5120'` | Max size in KB (5MB) |
| `dimensions` | `'file' => 'dimensions:min_width=100'` | Image dimensions |

### Server-Side MIME Type Validation

**Always validate MIME types server-side**, as client-side validation can be bypassed.

```php
// ❌ WRONG: Trusting file extension
if (pathinfo($file->getClientOriginalName(), PATHINFO_EXTENSION) === 'jpg') {
    // Attacker can rename malware.exe to malware.jpg
}

// ✅ CORRECT: Server-side MIME type check
$request->validate([
    'file' => 'required|mimes:jpeg,jpg,png'
]);
```

---

## Streaming Large Files

### Memory-Efficient Upload

```php
// ❌ WRONG: Loads entire file into memory (1GB file = 1GB RAM)
$contents = file_get_contents($filePath);
Storage::disk('s3')->put($path, $contents);

// ✅ CORRECT: Streams file (constant low memory)
$stream = fopen($filePath, 'r');
Storage::disk('s3')->put($path, $stream);
fclose($stream);
```

### Memory-Efficient Download

```php
// Stream file to browser (low memory)
return response()->streamDownload(function () use ($path) {
    $stream = Storage::disk('s3')->readStream($path);
    fpassthru($stream);
    fclose($stream);
}, 'large-video.mp4', [
    'Content-Type' => 'video/mp4',
]);
```

### Chunked Upload (Multipart)

For files >100MB, use multipart uploads:

```php
use Aws\S3\MultipartUploader;
use Aws\Exception\MultipartUploadException;

$uploader = new MultipartUploader(
    Storage::disk('s3')->getDriver()->getAdapter()->getClient(),
    $filePath,
    [
        'bucket' => env('AWS_BUCKET'),
        'key'    => 'videos/large-file.mp4',
    ]
);

try {
    $result = $uploader->upload();
    $url = $result['ObjectURL'];
} catch (MultipartUploadException $e) {
    // Handle failure
}
```

---

## Signed URLs

### Temporary Download Links

```php
// Generate URL that expires in 5 minutes
$url = Storage::disk('s3')->temporaryUrl(
    'private/document.pdf',
    now()->addMinutes(5)
);

// Custom expiration and headers
$url = Storage::disk('s3')->temporaryUrl(
    'private/invoice.pdf',
    now()->addHours(1),
    [
        'ResponseContentType' => 'application/pdf',
        'ResponseContentDisposition' => 'attachment; filename=invoice-2024.pdf',
    ]
);
```

### Presigned Upload URLs (Direct Browser Upload)

**Laravel 9.52+ Feature:**

```php
// Allow user to upload directly to S3 from browser
$response = Storage::disk('s3')->temporaryUploadUrl(
    'uploads/user-file.jpg',
    now()->addMinutes(5)
);

// Returns: ['url' => '...', 'headers' => [...]]
```

**Laravel 8.x Workaround:**

```php
use Aws\S3\S3Client;

$client = new S3Client([
    'version' => 'latest',
    'region'  => env('AWS_DEFAULT_REGION'),
]);

$cmd = $client->getCommand('PutObject', [
    'Bucket' => env('AWS_BUCKET'),
    'Key'    => 'uploads/user-file.jpg',
]);

$request = $client->createPresignedRequest($cmd, '+5 minutes');
$presignedUrl = (string) $request->getUri();
```

---

## S3 Bucket Configuration

### Block Public Access (Recommended Default)

Enable "Block all public access" on bucket, then use bucket policies for selective access:

**S3 Console:** Bucket → Permissions → Block public access → Edit

- ✅ Block all public access
- Use bucket policies to allow specific folders

### Bucket Policy for Selective Public Access

Allow public read for `/public/*` folder only:

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

### CORS Configuration

For direct browser uploads, configure CORS:

**S3 Console:** Bucket → Permissions → CORS → Edit

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["GET", "POST", "PUT"],
        "AllowedOrigins": ["https://yourdomain.com", "http://localhost:3000"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3000
    }
]
```

**Important:** Only allow trusted origins. Don't use `"*"` in production.

### Server-Side Encryption

Enable encryption for all objects:

**S3 Console:** Bucket → Properties → Default encryption → Enable

- AES-256 (SSE-S3) - Free, automatic
- AWS KMS (SSE-KMS) - More control, costs extra

---

## Security Best Practices

### 1. Use IAM Roles (When Possible)

```php
// ✅ CORRECT: IAM role (no credentials in .env)
// Laravel automatically uses EC2 instance role

// ❌ WRONG: Hardcoded credentials
'key' => 'AKIAIOSFODNN7EXAMPLE',
'secret' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
```

### 2. Minimum IAM Permissions

Create IAM user with only required permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::your-bucket/*"
        },
        {
            "Effect": "Allow",
            "Action": "s3:ListBucket",
            "Resource": "arn:aws:s3:::your-bucket"
        }
    ]
}
```

### 3. Server-Side Validation

```php
// ❌ WRONG: No validation
$path = Storage::disk('s3')->put('uploads', $request->file('file'));

// ✅ CORRECT: Validated
$request->validate([
    'file' => 'required|mimes:pdf,docx|max:5120'
]);
$path = Storage::disk('s3')->put('uploads', $request->file('file'));
```

### 4. Use Signed URLs for Private Files

```php
// ❌ WRONG: Permanent URL to private file
$url = Storage::disk('s3')->url('private/sensitive.pdf');

// ✅ CORRECT: Temporary signed URL
$url = Storage::disk('s3')->temporaryUrl(
    'private/sensitive.pdf',
    now()->addMinutes(5)
);
```

### 5. Enable Bucket Versioning

**S3 Console:** Bucket → Properties → Bucket Versioning → Enable

- Protects against accidental deletion
- Allows file recovery

### 6. Implement Lifecycle Policies

Auto-delete old files:

**S3 Console:** Bucket → Management → Lifecycle rules

```json
{
    "Rules": [
        {
            "Id": "Delete temp files after 7 days",
            "Filter": {
                "Prefix": "temp/"
            },
            "Status": "Enabled",
            "Expiration": {
                "Days": 7
            }
        }
    ]
}
```

---

## Anti-Patterns

### 1. Hardcoded Credentials

```php
// ❌ WRONG
's3' => [
    'key' => 'AKIAIOSFODNN7EXAMPLE',
    'secret' => 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
]

// ✅ CORRECT
's3' => [
    'key' => env('AWS_ACCESS_KEY_ID'),
    'secret' => env('AWS_SECRET_ACCESS_KEY'),
]
```

### 2. Missing File Validation

```php
// ❌ WRONG: No validation
Storage::disk('s3')->put('uploads', $request->file('file'));

// ✅ CORRECT: Validated upload
$request->validate(['file' => 'required|mimes:pdf|max:5120']);
Storage::disk('s3')->put('uploads', $request->file('file'));
```

### 3. Public Bucket

```php
// ❌ WRONG: Entire bucket public
// Bucket Policy: "Resource": "arn:aws:s3:::your-bucket/*"

// ✅ CORRECT: Only specific folder public
// Bucket Policy: "Resource": "arn:aws:s3:::your-bucket/public/*"
```

### 4. Missing CORS Configuration

```
// ❌ WRONG: No CORS = browser errors
Access to fetch at 'https://bucket.s3.amazonaws.com/file.jpg' from origin 'https://yourdomain.com' has been blocked by CORS policy

// ✅ CORRECT: Configure CORS on S3 bucket
```

### 5. Storing Files Locally First

```php
// ❌ WRONG: Unnecessary local storage
Storage::disk('local')->put('temp.jpg', $file);
$contents = Storage::disk('local')->get('temp.jpg');
Storage::disk('s3')->put('images/temp.jpg', $contents);
Storage::disk('local')->delete('temp.jpg');

// ✅ CORRECT: Direct S3 upload
Storage::disk('s3')->put('images', $file, 'public');
```

---

## Document Upload Security

Three hardening patterns for uploaded-document use cases (KYC, legal files, identity docs):

### 1. Visibility Config Defense-in-Depth

```php
// config/filesystems.php
's3' => [
    'driver'     => 's3',
    'key'        => env('AWS_ACCESS_KEY_ID'),
    'secret'     => env('AWS_SECRET_ACCESS_KEY'),
    'region'     => env('AWS_DEFAULT_REGION'),
    'bucket'     => env('AWS_BUCKET'),
    'visibility' => 'private',   // writes land with private ACL — CloudFront/CDN misconfiguration can't expose them
],
```

Signed URL TTL is theatre if the bucket policy regresses to public-read. This config-level setting is defense-in-depth even against IAM or origin misconfigurations.

### 2. MIME-Derived File Extension

Never use `$file->getClientOriginalExtension()` in a persisted S3 key — it is attacker-controlled and can carry null-byte or polyglot extensions:

```php
private const MIME_TO_EXT = [
    'image/jpeg'      => 'jpg',
    'image/png'       => 'png',
    'application/pdf' => 'pdf',
];

private function extensionFromMime(UploadedFile $file): string
{
    return self::MIME_TO_EXT[$file->getMimeType()] ?? throw new \InvalidArgumentException(
        "Unsupported MIME type: {$file->getMimeType()}"
    );
}
```

MIME validation already runs via `mimes:` + `mimetypes:` dual rule in the FormRequest, so the validated MIME is trustworthy. The extension is derived from that validated value — never from user input.

### 3. Signed URL Accessor with Production Re-Throw

```php
public function getSignedUrlAttribute(): string
{
    try {
        return Storage::disk('s3')->temporaryUrl($this->s3_key, now()->addMinutes(15));
    } catch (\RuntimeException $e) {
        // Local/public adapters throw RuntimeException — they don't support temporaryUrl()
        if (app()->environment('production')) {
            // Misconfigured S3-compatible disk (r2, do_spaces) would silently return a public URL
            throw $e;
        }
        return Storage::disk('s3')->url($this->s3_key); // dev/test fallback
    }
}
```

Branching on `=== 's3'` driver name silently falls through for any S3-compatible driver with a different name. The `RuntimeException` is Laravel's blessed signal that the adapter does not support `temporaryUrl()`.

**Test note**: `Storage::fake('s3')` exercises the `Storage::url()` fallback path — tests can assert URL presence but NOT TTL semantics. Add a comment in the test file to prevent future confusion.

## Official Documentation

- [Laravel Filesystem Documentation](https://laravel.com/docs/8.x/filesystem)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS SDK for PHP](https://docs.aws.amazon.com/sdk-for-php/)
- [Flysystem Documentation](https://flysystem.thephpleague.com/)
- [AWS S3 Security Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
