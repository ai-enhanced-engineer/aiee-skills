# react-native-camera-video Reference

## Setup and Installation

react-native-vision-camera v4.x (current stable: 4.7.3) is built on AVFoundation (iOS) and Camera2 (Android). It requires iOS 12+ and Android SDK 21+.

**Installation**:

```bash
npm install react-native-vision-camera react-native-worklets-core
cd ios && pod install
```

**Expo Managed Workflow** (requires dev build, not compatible with Expo Go):

```json
{
  "expo": {
    "plugins": [
      ["react-native-vision-camera", {
        "cameraPermissionText": "Allow camera access",
        "enableCodeScanner": true
      }]
    ]
  }
}
```

Then run `npx expo prebuild` or build via EAS.

---

## Camera Permissions Flow

### iOS — Info.plist

```xml
<key>NSCameraUsageDescription</key>
<string>$(PRODUCT_NAME) needs access to your Camera.</string>
<key>NSMicrophoneUsageDescription</key>
<string>$(PRODUCT_NAME) needs access to your Microphone.</string>
<key>NSPhotoLibraryAddUsageDescription</key>
<string>Save photos and videos to your library</string>
```

### Android — AndroidManifest.xml

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
<uses-feature android:name="android.hardware.camera.autofocus" />
```

### Permission API

```typescript
import { Camera } from 'react-native-vision-camera';

// Check: returns 'granted' | 'not-determined' | 'denied' | 'restricted'
const cameraStatus = Camera.getCameraPermissionStatus();
const micStatus = Camera.getMicrophonePermissionStatus();

// Request
const newCameraStatus = await Camera.requestCameraPermission();
const newMicStatus = await Camera.requestMicrophonePermission();
```

---

## Video Recording API

### Methods

| Method | Description | Return |
|--------|-------------|--------|
| `startRecording(options)` | Begin recording with codec, bitrate, callbacks | `void` |
| `pauseRecording()` | Pause current recording (keeps file open) | `Promise<void>` |
| `resumeRecording()` | Resume paused recording | `Promise<void>` |
| `stopRecording()` | Finalize video file, triggers `onRecordingFinished` | `Promise<void>` |

### Recording Options

| Option | Values | Description |
|--------|--------|-------------|
| `videoCodec` | `'h264'`, `'h265'` | Codec selection (auto-fallback if unsupported) |
| `videoBitRate` | `'low'`, `'normal'`, `'high'`, or number (bps) | Quality/size trade-off |
| `flash` | `'on'`, `'off'` | Torch during recording |
| `fileType` | `'mp4'`, `'mov'` | Container format |

### Bitrate Calculation

```
baseBitRate → adjust for FPS (÷30 × fps) → HDR factor (×1.2) → HEVC factor (×0.8) → custom factor
```

**Known issue**: After `pauseRecording()`, `stopRecording()` may take ~4 seconds longer than normal.

---

## Frame Processors

Frame processors are workletized JavaScript functions that run on every camera frame via JSI on a parallel thread. They require `react-native-worklets-core` 1.0.0+.

### Performance Budget

| FPS | Budget per Frame | Typical Use |
|-----|-----------------|-------------|
| 30 | 33ms | Standard video, most ML models |
| 60 | 16ms | Smooth overlay, simple processing |
| 120+ | <8ms | Slow-motion (limited processing) |

At 4K resolution, each raw frame is ~12MB. Prefer `yuv` pixel format over `rgb` for efficiency. Use `runAsync()` for processing that exceeds the frame budget.

### ML Integration

- **Google ML Kit** (`react-native-vision-camera-mlkit`): text recognition, face detection, barcode scanning, pose detection, object detection, selfie segmentation
- **TensorFlow Lite**: custom model inference (~69ms per call on 4K frames)
- **ONNX Runtime**: cross-platform ML models via community plugins

---

## Photo Capture Configuration

| Prop / Option | Values | Description |
|---------------|--------|-------------|
| `flash` | `'on'`, `'off'`, `'auto'` | Flash mode |
| `enableAutoRedEyeReduction` | boolean | Red-eye correction |
| `enableAutoStabilization` | boolean | Stabilization during capture |
| `qualityPrioritization` | `'speed'`, `'balanced'`, `'quality'` | Capture speed vs quality |
| `photoQualityBalance` | `'speed'`, `'balanced'`, `'quality'` | Camera prop for ongoing balance |
| `photoHdr` | boolean | HDR photo capture (device-dependent) |
| `enableHighQualityPhotos` | boolean | Maximum sensor resolution |

---

## Device Selection

| Device Type | Description |
|-------------|-------------|
| `wide-angle-camera` | Standard main camera |
| `ultra-wide-angle-camera` | Wider field of view |
| `telephoto-camera` | Optical zoom lens |

Use `useCameraDevice('back')` for simple selection. Use `useCameraDevices()` to enumerate all devices and filter by `physicalDevices` array for multi-lens configurations.

Selecting a simpler device (fewer physical cameras) allows faster initialization. For quick launches, prefer single-lens wide-angle.

### Zoom

- `minZoom`: ultra-wide field of view
- `neutralZoom`: default wide-angle
- `maxZoom`: telephoto (if available)
- `enableZoomGesture={true}` enables built-in pinch-to-zoom

---

## HEVC vs H.264

| Factor | H.264 | HEVC (H.265) |
|--------|-------|--------------|
| File size | Baseline | ~50% smaller |
| 1080p bitrate | 4.5-6 Mbps | 2.25-3 Mbps |
| 4K bitrate | 25-35 Mbps | 12-16 Mbps |
| Encoding speed | Faster | 2-4x slower |
| Battery impact | Lower | Higher (encoding) |
| Device support | 99%+ | 92% smartphones, 45% desktop browsers |

Recording in HEVC produces smaller files and saves bandwidth. VisionCamera auto-falls back to H.264 on unsupported devices. Server-side transcoding to H.264 can restore playback compatibility where needed.

---

## High-Quality Capture Patterns

### Resolution Trade-offs

| Resolution | File Size (1 min, raw) | Best For |
|------------|----------------------|----------|
| 4K (2160p) | 300-500 MB | Professional/archival |
| 1080p | 75-150 MB | Social sharing, upload |
| 720p | 30-60 MB | Storage-constrained |

### Features

- **Stabilization**: `videoStabilizationMode` — `'off'`, `'standard'`, `'cinematic'`, `'auto'`
- **HDR**: `videoHdr={true}` — 10-bit color, ~20% bitrate increase. Check `device.supportsVideoHDR`.
- **Slow-motion**: Select a format with `maxFps >= 120`, then set `fps={120}` or `fps={240}`
- **Low-light**: Use `exposure` prop, prefer wide-angle lens, enable `lowLightBoost` if supported

---

## Capture-Compress-Upload Integration

The capture-to-upload pipeline follows this flow:

```
Camera Capture → Local File → Compression → Chunked Upload → Server Processing
     .mp4/mov    temp dir    react-native-   tus/resumable    transcode to
                              compressor      protocol         HLS/DASH
```

Key integration points:
1. Extract metadata before compression (compression strips EXIF)
2. Use `react-native-compressor` with `auto` mode for compression
3. Chunk sizes: 500KB on mobile data, 5MB on WiFi
4. Clean up temp files after successful upload or on app launch

---

## Platform Specifics

### iOS (AVFoundation)

- ProRes support on iPhone 13 Pro+ (requires specific configuration)
- Cinematic mode not exposed through VisionCamera (Apple private APIs)
- Permission prompt shown once per install
- Multi-camera supported on iPhone XS+

### Android (Camera2)

- Multi-camera support is device-dependent
- HEVC encoding: CQ mode not supported on Exynos hardware (use CBR/VBR)
- Recorded video may have incorrect rotation metadata on some devices — verify before upload
- Permission can be revoked by user at any time

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|-------------|---------|
| Using expo-camera for ML/AR tasks | Use react-native-vision-camera with frame processors |
| Fixed 30 FPS frame processing regardless of workload | Use `runAsync()` for heavy processing; conditionally skip frames when behind budget |
| Processing frames on JS main thread | Use worklets via `useFrameProcessor` |
| Large allocations inside frame processor | Pre-allocate buffers outside processor, reuse objects |
| Ignoring device capability checks | Check `device.supportsVideoHDR`, `device.hasTorch` before use |
| Always recording H.264 for upload | Use HEVC for 50% smaller files, transcode server-side if needed |
| Leaving temp video files on device | Clean up after upload or on app launch via `RNFS.unlink` |
| Blocking UI thread during recording | Use callbacks and state management for recording lifecycle |
| Rendering camera inside Portal or Modal on Android | Render camera at root level, overlay UI controls on top |
| Not handling permission denial gracefully | Show instructions directing user to Settings to enable permissions |
