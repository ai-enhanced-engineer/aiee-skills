# Mobile Video Upload — Reference

## Resumable Upload Protocols

### tus Protocol (v1.0.0)

Open standard for resumable file uploads over HTTP. Adopted by Cloudflare, Supabase, Vimeo, Transloadit.

**How it works**: POST creates an upload resource, PATCH sends chunks, HEAD checks progress. Chunk size is configurable (commonly 5MB desktop, 500KB mobile).

**React Native options**:

| Library | Approach | Pros | Cons |
|---------|----------|------|------|
| `tus-js-client` 4.x | Pure JS | Cross-platform, active maintenance | No Web Storage API — no cross-session resume without workaround |
| `react-native-tus-client` 2.x | Native (TUSKit / tus-android) | True background upload, session resume | Bare workflow only, low activity |

**Critical: tus-js-client in React Native** lacks Web Storage API. The `fingerprint`, `resume`, and `removeFingerprintOnSuccess` options are silently ignored. You must provide a custom `urlStorage` backed by AsyncStorage (see examples.md).

### GCS Resumable Upload API

- Initiation: POST returns `Location` header with session URI
- Chunk size: multiples of 256KB (except final chunk)
- Session validity: 7 days
- No intermediate server required — mobile uploads directly via signed URL
- Pause on cellular, resume on WiFi

### S3 Multipart Upload

- Part size: minimum 5MB (except last part)
- Maximum: 10,000 parts, 5TB total
- Supports parallel chunk uploads
- React Native approaches: `react-native-upload-aws-s3`, AWS Amplify Storage, pre-signed URLs

**Protocol selection rule**: Use tus for multi-cloud or self-hosted backends. Use GCS/S3 native APIs for single-cloud deployments with direct-to-cloud upload.

---

## Pre-Upload Compression

### react-native-compressor 1.10.x (Active, +50KB APK)

Primary compression library for React Native. WhatsApp-style auto compression analyzes video and applies optimal settings. Supports video, image, and audio compression.

Compression methods:
- `auto` — recommended, analyzes video properties and applies optimal settings
- `manual` — explicit control over `maxSize` and `bitrate`
- Progress tracking via `progressDivider` callback

### FFmpegKit — RETIRED (January 6, 2025)

Binaries removed from Maven Central, CocoaPods, and npm as of April 2025. Do not depend on this library. Alternatives:
1. `react-native-compressor` for standard compression
2. Build FFmpegKit locally from source
3. Community forks (e.g., `@beedeez/ffmpeg-kit-react-native`) — stability unverified

### iOS: AVAssetExportSession

Native compression via AVFoundation. Key presets:
- `AVAssetExportPresetHEVCHighestQuality` — best quality, HEVC codec
- `AVAssetExportPresetHighestQuality` — H.264, widest compatibility
- `AVAssetExportPresetMediumQuality` — good balance for mobile

Set `shouldOptimizeForNetworkUse = true` for streaming-friendly output. Explicitly copy `asset.metadata` to preserve EXIF. Known issue: rotation metadata may be stripped — verify output orientation before upload.

iOS 17+ presets automatically preserve Dolby Vision Profile 8.4 (HDR).

### Android: MediaCodec

Use `MediaFormat.MIMETYPE_VIDEO_HEVC` with VBR bitrate mode. Constant Quality (CQ) mode is not supported on Exynos hardware — use CBR or VBR with explicit bitrate instead. Android 12+ automatically transcodes HEVC to H.264 for apps that declare no HEVC support.

### HEVC vs H.264

| Factor | H.264 | HEVC (H.265) |
|--------|-------|--------------|
| Compression | Baseline | 50% smaller at same quality |
| 1080p bandwidth | 4.5-6 Mbps | 2.25-3 Mbps |
| 4K bandwidth | 25-35 Mbps | 12-16 Mbps |
| Encoding speed | Faster | 2-4x slower |
| Battery impact | Lower | Higher (encoding) |
| Device support | 99%+ | 92% smartphones, 45% desktop browsers |

**Recommendation**: Use HEVC for upload to save bandwidth. Ensure server can transcode to H.264 for playback compatibility.

---

## Background Upload

### iOS

**NSURLSession background sessions**: Handled by `nsurlsessiond` daemon (separate process). Survives app termination. System decides execution timing. Maximum ~200 pending requests.

**BGTaskScheduler (iOS 13+)**:
- `BGAppRefreshTask`: 30 seconds execution
- `BGProcessingTask`: Minutes of execution when charging
- `BGContinuedProcessingTask` (iOS 26 / WWDC 2025): Extended processing with mandatory progress reporting

Key constraints: Background URLSession scheduling is undocumented and changes between iOS versions. Uploads may be delayed on battery. Show foreground notification for user transparency.

### Android

**WorkManager** (recommended): Supports checkpoint-based progress, foreground service promotion via `setForegroundAsync()`, and network constraints.

**Foreground Service** (for >10 minute uploads): Android 14+ requires `foregroundServiceType="dataSync"` in manifest. Android 16 may exhaust job quota for long-running workers.

### React Native Libraries

| Library | Version | iOS | Android | Expo | Status |
|---------|---------|-----|---------|------|--------|
| `react-native-background-upload` | 6.x | NSURLSession | OkHttp | Bare only | Active |
| `expo-background-task` | SDK 50+ | BGTaskScheduler | WorkManager | Yes | Active |
| `expo-background-fetch` | — | — | — | — | DEPRECATED |

Known issue: `expo-file-system` `uploadAsync` with `sessionType: BACKGROUND` has issues in SDK 50 with multipart on iOS. Binary upload type works more reliably.

---

## Progress Tracking and Retry Logic

**Production standard (2026)**: 500KB chunks for mobile networks, checkpoint after each chunk to AsyncStorage, resume from last successful chunk on failure.

**Exponential backoff with jitter**: Base delay `2^attempt * 1000ms`, add random jitter up to 1000ms, cap at 30 seconds. Retry on network errors, 5xx responses, and 429 (rate limited). Do not retry 4xx client errors.

---

## Network-Aware Upload

Use `@react-native-community/netinfo` 11.x to detect network type and respond:
- **WiFi (unmetered)**: Upload immediately, use larger chunks (5MB)
- **WiFi (metered)**: Upload with compression, respect data caps
- **Cellular**: Check user preference before uploading, compress aggressively
- **Offline**: Queue for later, process when connected

---

## Metadata Forwarding

Video metadata (GPS, timestamp, camera info, orientation) must be extracted before compression — most compression tools strip EXIF by default.

**Extraction libraries**:

| Library | Metadata Coverage | Expo Compatible |
|---------|------------------|-----------------|
| `expo-video-metadata` 2.x | Duration, dimensions, FPS, codec, orientation | SDK 50+ |
| `react-native-nitro-media-metadata` | Comprehensive incl. bitrate | Bare workflow |
| `react-native-media-meta` | Basic + thumbnails | Via FFmpeg |

**Upload patterns**:
- **Multipart form** (small metadata): Append metadata JSON alongside video file in FormData
- **Two-phase** (resumable uploads): POST metadata to `/uploads/init`, receive `uploadId` and `uploadUrl`, then upload video via tus/resumable referencing the `uploadId`

---

## Security

**Pre-signed URL flow**: Mobile requests upload URL from backend. Backend generates time-limited signed URL (5-60 min for downloads, 1 hour for uploads). Mobile uploads directly to cloud storage. Backend is notified on completion.

| Practice | Implementation |
|----------|---------------|
| Short expiration | 5-15 min downloads, 1 hour uploads |
| Content-Type enforcement | Specify in signed URL parameters |
| File size limits | Client + server validation |
| Rate limiting | Token bucket per user |
| HTTPS only | Reject HTTP uploads |
| Post-upload scanning | ClamAV, Microsoft Defender for Storage, Cloudinary Metascan |

---

## Quality Presets

| Preset | Resolution | Bitrate | Est. Size (1 min) | Use Case |
|--------|-----------|---------|-------------------|----------|
| Original | Source | Source | ~150-500 MB | Archival, professional |
| High | 1080p max | 4 Mbps | ~30 MB | Default sharing |
| Medium | 720p max | 2 Mbps | ~15 MB | General sharing |
| Data Saver | 480p max | 1 Mbps | ~7.5 MB | Low bandwidth |

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|-------------|---------|
| Single-request large upload | Chunked/resumable upload (tus, GCS, S3 multipart) |
| No progress persistence | Save checkpoint to AsyncStorage after each chunk |
| Immediate retry on failure | Exponential backoff with jitter, cap at 30s |
| Ignoring network type | Check NetInfo, respect user WiFi/cellular preference |
| Stripping metadata during compression | Extract metadata before compression, forward separately |
| Long-lived pre-signed URLs (>1 hour) | 5-60 minute expiration windows |
| No malware scanning | ClamAV or cloud-native scanning post-upload |
| Fixed chunk size for all networks | 500KB mobile, 5MB WiFi |
| Blocking UI during compression | Progress callback, background processing |
| No offline queue | Queue uploads, process when connected |
