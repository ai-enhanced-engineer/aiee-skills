---
name: laravel-s3-storage
description: Laravel Flysystem S3 integration for file uploads. Storage facade usage, disk configuration, public/private file handling, signed URLs. Use for file upload features, video storage, image processing, or S3 integration.
kb-sources:
  - wiki/software-engineering/laravel-s3
updated: 2026-05-09
---

# Laravel S3 Storage Patterns

Laravel's Flysystem S3 integration with support for public/private files and signed URLs.

## When to Use

- Implementing file upload features
- Storing user-generated content (images, videos, documents)
- Managing public vs private file access
- Generating temporary download links
- Streaming large files
- Configuring S3 bucket security
- Direct browser uploads to S3

## Storage Facade Quick Reference

| Method | Purpose | Example |
|--------|---------|---------|
| `put()` | Upload file | `Storage::disk('s3')->put('images', $file, 'public')` |
| `get()` | Download file | `Storage::disk('s3')->get('file.jpg')` |
| `url()` | Get public URL | `Storage::disk('s3')->url($path)` |
| `temporaryUrl()` | Signed URL (private) | `Storage::disk('s3')->temporaryUrl($path, now()->addMinutes(5))` |
| `delete()` | Delete file | `Storage::disk('s3')->delete($path)` |
| `exists()` | Check existence | `Storage::disk('s3')->exists($path)` |
| `putFileAs()` | Custom filename | `Storage::disk('s3')->putFileAs('images', $file, 'custom.jpg')` |

## Public vs Private Files

Public files are written with the `'public'` ACL parameter and served via `url()`. Private files omit the visibility parameter (defaults to bucket policy) and are accessed via `temporaryUrl()` with a TTL — short TTLs (5 min) work well for authenticated downloads of short-lived links. See `reference.md → Public vs Private Files` for both upload + access flows.

## File Validation Pattern

Pair `$request->validate(['image' => 'required|image|mimes:jpeg,jpg,png|max:2048'])` with the `Storage::disk('s3')->put()` call so MIME and size validation gate the upload. See `reference.md → File Validation` for the complete request/upload flow.

## Document Upload Security Patterns

For uploaded-document use cases (KYC, legal docs), three security hardening patterns apply:

- **`'visibility' => 'private'` on the disk config** — defense-in-depth; even a misconfigured bucket ACL or CDN origin won't produce public URLs because Laravel writes with private ACL.
- **MIME-derived extension** — build a server-side `MIME_TO_EXT` map keyed on the validated MIME type; never use `getClientOriginalExtension()` (attacker-controlled string).
- **Signed URL accessor with production re-throw** — `try { temporaryUrl() } catch (RuntimeException $e) { ... }` pattern; re-throw in production to prevent silent fallback to a public URL on misconfigured S3-compatible disks (`r2`, `do_spaces`).

See **reference.md → "Document Upload Security"** for code skeletons.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| 403 Forbidden | Check bucket policy and user permissions (incorrect IAM permissions) |
| CORS error | Configure S3 bucket CORS (missing/incorrect CORS config) |
| File not visible | Set `'public'` as third parameter in `put()` (wrong visibility setting) |
| Memory exhausted | Use `fopen()` streaming instead of `file_get_contents()` (loading large file into memory) |
| Slow uploads | Use multipart upload for files >100MB (single-threaded upload) |
| `getClientOriginalExtension()` in S3 key construction | Attacker-controlled extension in persisted key — derive from validated MIME via server-side map |
| `=== 's3'` driver-name branch for signed-URL fallback | Any S3-compatible driver with a different name (`r2`, `do_spaces`) silently falls through to public URL — use `try/catch RuntimeException` |
| Omitting `'visibility' => 'private'` on S3 disk config | Signed URL TTL is theatre if bucket policy regresses to public-read — set at config level for defense-in-depth |

See **reference.md** for configuration, CORS setup, streaming patterns, security hardening, and IAM policies.
See **examples.md** for complete upload actions, bucket policies, anti-patterns, and real-world implementations.
