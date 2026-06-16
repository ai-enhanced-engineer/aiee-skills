# Mobile Video Upload — Examples

All examples target React Native 0.73+ with TypeScript. Legacy (RN 0.64) considerations noted where relevant.

---

## tus Upload with Cross-Session Resume Workaround

React Native lacks Web Storage API, so `tus-js-client` cannot resume uploads across app sessions by default. This custom `urlStorage` adapter backed by AsyncStorage restores that capability.

```typescript
import * as tus from 'tus-js-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface StoredUpload {
  urlStorageKey: string;
  uploadUrl: string;
  size: number;
  metadata: Record<string, string>;
}

const TUS_STORAGE_KEY = 'tus-uploads';

const urlStorage: tus.UrlStorage = {
  findAllUploads: async (): Promise<StoredUpload[]> => {
    const data = await AsyncStorage.getItem(TUS_STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  findUploadsByFingerprint: async (fingerprint: string): Promise<StoredUpload[]> => {
    const uploads = await urlStorage.findAllUploads();
    return uploads.filter((u) => u.urlStorageKey === fingerprint);
  },

  removeUpload: async (urlStorageKey: string): Promise<void> => {
    const uploads = await urlStorage.findAllUploads();
    const filtered = uploads.filter((u) => u.urlStorageKey !== urlStorageKey);
    await AsyncStorage.setItem(TUS_STORAGE_KEY, JSON.stringify(filtered));
  },

  addUpload: async (fingerprint: string, upload: StoredUpload): Promise<void> => {
    const uploads = await urlStorage.findAllUploads();
    uploads.push({ ...upload, urlStorageKey: fingerprint });
    await AsyncStorage.setItem(TUS_STORAGE_KEY, JSON.stringify(uploads));
  },
};

interface TusUploadOptions {
  videoUri: string;
  endpoint: string;
  metadata?: Record<string, string>;
  onProgress?: (percentage: number) => void;
  onSuccess?: (uploadUrl: string) => void;
  onError?: (error: Error) => void;
  chunkSize?: number;
}

function startTusUpload({
  videoUri,
  endpoint,
  metadata = {},
  onProgress,
  onSuccess,
  onError,
  chunkSize = 512 * 1024, // 512KB default for mobile
}: TusUploadOptions): tus.Upload {
  const upload = new tus.Upload(
    { uri: videoUri, type: 'video/mp4', name: 'upload.mp4' } as any,
    {
      endpoint,
      chunkSize,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      urlStorage, // Enables cross-session resume
      metadata: {
        filename: 'upload.mp4',
        filetype: 'video/mp4',
        ...metadata,
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        onProgress?.(Math.round((bytesUploaded / bytesTotal) * 100));
      },
      onSuccess: () => {
        onSuccess?.(upload.url ?? '');
      },
      onError: (error) => {
        onError?.(error);
      },
    },
  );

  // Check for previous upload to resume
  upload.findPreviousUploads().then((previousUploads) => {
    if (previousUploads.length > 0) {
      upload.resumeFromPreviousUpload(previousUploads[0]);
    }
    upload.start();
  });

  return upload;
}
```

> **Legacy note (RN 0.64)**: `tus-js-client` 3.x works but performance is lower without TurboModules. Consider `react-native-tus-client` (native TUSKit/tus-android) for bare workflows.

---

## GCS Resumable Upload from Mobile

```typescript
interface GCSUploadSession {
  sessionUri: string;
  totalSize: number;
  bytesUploaded: number;
}

async function initiateGCSResumableUpload(
  signedInitUrl: string,
  fileSize: number,
  contentType: string,
): Promise<string> {
  const response = await fetch(signedInitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      'Content-Length': '0',
      'x-goog-resumable': 'start',
    },
  });

  const sessionUri = response.headers.get('Location');
  if (!sessionUri) throw new Error('No session URI returned from GCS');

  // Persist session for cross-app-session resume (valid 7 days)
  await AsyncStorage.setItem(
    `gcs-session:${signedInitUrl}`,
    JSON.stringify({ sessionUri, totalSize: fileSize, bytesUploaded: 0 }),
  );

  return sessionUri;
}

async function uploadChunkToGCS(
  sessionUri: string,
  chunk: ArrayBuffer,
  offset: number,
  totalSize: number,
): Promise<number> {
  const end = offset + chunk.byteLength - 1;
  const contentRange =
    chunk.byteLength < totalSize
      ? `bytes ${offset}-${end}/${totalSize}`
      : `bytes ${offset}-${end}/${totalSize}`;

  const response = await fetch(sessionUri, {
    method: 'PUT',
    headers: {
      'Content-Length': String(chunk.byteLength),
      'Content-Range': contentRange,
    },
    body: chunk,
  });

  if (response.status === 200 || response.status === 201) {
    return totalSize; // Upload complete
  }

  if (response.status === 308) {
    // Incomplete — parse Range header for next offset
    const range = response.headers.get('Range');
    return range ? parseInt(range.split('-')[1], 10) + 1 : offset + chunk.byteLength;
  }

  throw new Error(`GCS upload failed: ${response.status}`);
}
```

---

## Pre-Upload Compression with react-native-compressor

```typescript
import { Video } from 'react-native-compressor';

interface CompressionPreset {
  label: string;
  description: string;
  compression: { maxSize: number; bitrate: number } | null;
  estimatedRatio: number;
}

const QUALITY_PRESETS: Record<string, CompressionPreset> = {
  original: {
    label: 'Original',
    description: 'Full quality, largest file',
    compression: null,
    estimatedRatio: 1.0,
  },
  high: {
    label: 'High',
    description: '1080p, great quality',
    compression: { maxSize: 1920, bitrate: 4_000_000 },
    estimatedRatio: 0.5,
  },
  medium: {
    label: 'Medium',
    description: '720p, good for sharing',
    compression: { maxSize: 1280, bitrate: 2_000_000 },
    estimatedRatio: 0.25,
  },
  dataSaver: {
    label: 'Data Saver',
    description: '480p, fastest upload',
    compression: { maxSize: 854, bitrate: 1_000_000 },
    estimatedRatio: 0.1,
  },
};

async function compressVideo(
  videoUri: string,
  quality: keyof typeof QUALITY_PRESETS,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const preset = QUALITY_PRESETS[quality];

  if (!preset.compression) {
    return videoUri; // Original — skip compression
  }

  // react-native-compressor 1.10.x
  // FFmpegKit is RETIRED (Jan 2025) — do not use
  const compressedPath = await Video.compress(
    videoUri,
    {
      compressionMethod: 'manual',
      maxSize: preset.compression.maxSize,
      bitrate: preset.compression.bitrate,
      progressDivider: 10, // Report every 10%
    },
    (progress) => {
      onProgress?.(progress);
    },
  );

  return compressedPath;
}

// Auto compression (WhatsApp-style — lets library choose optimal settings)
async function compressVideoAuto(
  videoUri: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return Video.compress(
    videoUri,
    { compressionMethod: 'auto', progressDivider: 10 },
    (progress) => onProgress?.(progress),
  );
}
```

---

## Background Upload Setup (iOS + Android)

### react-native-background-upload (bare workflow)

```typescript
import Upload from 'react-native-background-upload';

interface BackgroundUploadOptions {
  url: string;
  videoPath: string;
  token: string;
  onProgress?: (progress: number) => void;
  onComplete?: (responseBody: string) => void;
  onError?: (error: string) => void;
}

async function startBackgroundUpload({
  url,
  videoPath,
  token,
  onProgress,
  onComplete,
  onError,
}: BackgroundUploadOptions): Promise<string> {
  const uploadId = await Upload.startUpload({
    url,
    path: videoPath,
    method: 'PUT',
    type: 'raw', // Binary upload — more reliable than multipart for background on iOS
    headers: {
      'Content-Type': 'video/mp4',
      Authorization: `Bearer ${token}`,
    },
    notification: {
      enabled: true,
      onProgressTitle: 'Uploading video...',
      autoClear: true,
    },
  });

  Upload.addListener('progress', uploadId, (data) => {
    onProgress?.(data.progress);
  });

  Upload.addListener('completed', uploadId, (data) => {
    onComplete?.(data.responseBody);
  });

  Upload.addListener('error', uploadId, (data) => {
    onError?.(data.error);
  });

  return uploadId;
}
```

### expo-background-task (Expo SDK 50+)

```typescript
import * as BackgroundTask from 'expo-background-task';
import AsyncStorage from '@react-native-async-storage/async-storage';

const VIDEO_UPLOAD_TASK = 'VIDEO_UPLOAD_TASK';

BackgroundTask.defineTask(VIDEO_UPLOAD_TASK, async () => {
  const queueRaw = await AsyncStorage.getItem('uploadQueue');
  if (!queueRaw) return BackgroundTask.TaskFinishedStatus.SUCCESS;

  const queue: UploadQueueItem[] = JSON.parse(queueRaw);
  const pending = queue.filter((item) => item.status === 'pending');

  for (const item of pending) {
    try {
      await uploadWithCheckpoint(item.videoPath, item.uploadUrl);
      item.status = 'completed';
    } catch {
      item.retries++;
      if (item.retries >= 3) item.status = 'failed';
    }
  }

  await AsyncStorage.setItem('uploadQueue', JSON.stringify(queue));
  return BackgroundTask.TaskFinishedStatus.SUCCESS;
});

// Register on app startup
async function registerBackgroundUploadTask(): Promise<void> {
  await BackgroundTask.scheduleTaskAsync(VIDEO_UPLOAD_TASK, {
    minimumInterval: 15 * 60, // 15 minutes minimum
  });
}
```

---

## Progress Tracking UI Component

```typescript
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';

type UploadStage = 'compressing' | 'uploading' | 'processing' | 'complete' | 'error';

interface UploadProgress {
  stage: UploadStage;
  progress: number; // 0-1
  error?: string;
}

function UploadProgressBar({ progress }: { progress: UploadProgress }) {
  const stageLabels: Record<UploadStage, string> = {
    compressing: 'Compressing video...',
    uploading: 'Uploading...',
    processing: 'Processing on server...',
    complete: 'Upload complete',
    error: progress.error ?? 'Upload failed',
  };

  const overallProgress = (() => {
    switch (progress.stage) {
      case 'compressing':
        return progress.progress * 0.3; // Compression = 0-30%
      case 'uploading':
        return 0.3 + progress.progress * 0.6; // Upload = 30-90%
      case 'processing':
        return 0.9 + progress.progress * 0.1; // Processing = 90-100%
      case 'complete':
        return 1;
      case 'error':
        return 0;
    }
  })();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{stageLabels[progress.stage]}</Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(overallProgress * 100)}%`,
              backgroundColor: progress.stage === 'error' ? '#e53e3e' : '#3182ce',
            },
          ]}
        />
      </View>
      <Text style={styles.percentage}>{Math.round(overallProgress * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { fontSize: 14, marginBottom: 8 },
  track: { height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  percentage: { fontSize: 12, marginTop: 4, textAlign: 'right' },
});
```

---

## Retry Logic with Exponential Backoff

```typescript
interface RetryOptions {
  maxRetries?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
}

async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 5, maxDelayMs = 30_000, onRetry } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!isRetryableError(lastError)) {
        throw lastError;
      }

      if (attempt < maxRetries - 1) {
        const baseDelay = Math.pow(2, attempt) * 1_000;
        const jitter = Math.random() * 1_000;
        const delay = Math.min(baseDelay + jitter, maxDelayMs);

        onRetry?.(attempt + 1, delay, lastError);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

function isRetryableError(error: Error & { status?: number; isNetworkError?: boolean }): boolean {
  if (error.isNetworkError) return true;
  if (error.status && error.status >= 500 && error.status < 600) return true;
  if (error.status === 429) return true; // Rate limited
  return false;
}
```

---

## Metadata Extraction and Forwarding

```typescript
import { getVideoMetadata } from 'expo-video-metadata';

interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  frameRate: number;
  codec: string;
  hasAudio: boolean;
  orientation: number;
  aspectRatio: number;
  isPortrait: boolean;
  creationDate?: string;
  location?: { latitude: number; longitude: number };
}

async function extractMetadata(videoUri: string): Promise<VideoMetadata> {
  const raw = await getVideoMetadata(videoUri);

  return {
    duration: raw.duration,
    width: raw.width,
    height: raw.height,
    frameRate: raw.frameRate,
    codec: raw.codec,
    hasAudio: raw.hasAudio,
    orientation: raw.orientation,
    aspectRatio: raw.width / raw.height,
    isPortrait: raw.orientation === 90 || raw.orientation === 270,
    creationDate: raw.creationDate,
    location: raw.location,
  };
}

// Two-phase upload: metadata first, then video via resumable protocol
async function twoPhaseUpload(
  videoUri: string,
  apiBaseUrl: string,
): Promise<{ uploadId: string }> {
  // Phase 1: Send metadata to register upload
  const metadata = await extractMetadata(videoUri);
  const fileSize = await getFileSize(videoUri);

  const initResponse = await fetch(`${apiBaseUrl}/uploads/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: `video_${Date.now()}.mp4`,
      size: fileSize,
      metadata,
    }),
  });

  const { uploadId, uploadUrl } = await initResponse.json();

  // Phase 2: Upload video via tus referencing the uploadId
  return new Promise((resolve, reject) => {
    const upload = startTusUpload({
      videoUri,
      endpoint: uploadUrl,
      metadata: { uploadId },
      onSuccess: () => resolve({ uploadId }),
      onError: reject,
    });
  });
}
```

---

## Pre-Signed URL Upload Flow

```typescript
interface SignedUrlResponse {
  uploadUrl: string;
  objectKey: string;
  expiresAt: string;
}

async function uploadWithSignedUrl(
  videoPath: string,
  apiBaseUrl: string,
  token: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // 1. Request pre-signed URL from backend (1 hour expiration)
  const response = await fetch(`${apiBaseUrl}/uploads/signed-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      contentType: 'video/mp4',
      filename: `upload_${Date.now()}.mp4`,
    }),
  });

  const { uploadUrl, objectKey }: SignedUrlResponse = await response.json();

  // 2. Upload directly to cloud storage
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'video/mp4',
    },
    body: await readFileAsBlob(videoPath),
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status}`);
  }

  // 3. Notify backend of completion (triggers malware scan)
  await fetch(`${apiBaseUrl}/uploads/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ objectKey }),
  });

  return objectKey;
}
```

---

## Offline Queue Pattern

```typescript
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UploadQueueItem {
  id: string;
  videoPath: string;
  metadata: VideoMetadata;
  quality: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  retries: number;
  createdAt: number;
  uploadUrl?: string;
}

const QUEUE_KEY = 'offline-upload-queue';

class OfflineUploadQueue {
  private processing = false;

  constructor() {
    // Auto-process when connectivity returns
    NetInfo.addEventListener((state: NetInfoState) => {
      if (state.isConnected && !this.processing) {
        this.processQueue();
      }
    });
  }

  async enqueue(
    videoPath: string,
    metadata: VideoMetadata,
    quality: string,
  ): Promise<string> {
    const item: UploadQueueItem = {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      videoPath,
      metadata,
      quality,
      status: 'pending',
      retries: 0,
      createdAt: Date.now(),
    };

    const queue = await this.getQueue();
    queue.push(item);
    await this.saveQueue(queue);

    // Try immediately if online
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      this.processQueue();
    }

    return item.id;
  }

  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const queue = await this.getQueue();
      const pending = queue.filter((item) => item.status === 'pending');

      for (const item of pending) {
        const netState = await NetInfo.fetch();
        if (!netState.isConnected) break; // Stop if we lose connectivity

        try {
          item.status = 'uploading';
          await this.saveQueue(queue);

          await this.uploadItem(item);
          item.status = 'completed';
        } catch {
          item.retries++;
          item.status = item.retries >= 3 ? 'failed' : 'pending';
        }

        await this.saveQueue(queue);
      }
    } finally {
      this.processing = false;
    }
  }

  async getQueue(): Promise<UploadQueueItem[]> {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  private async saveQueue(queue: UploadQueueItem[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  private async uploadItem(item: UploadQueueItem): Promise<void> {
    const compressed = await compressVideo(item.videoPath, item.quality as any);
    await uploadWithSignedUrl(compressed, 'https://api.example.com', 'token');
  }
}
```

---

## Complete Upload Manager

Orchestrates the full flow: network check, metadata extraction, compression, background upload, retry, and offline queuing.

```typescript
import { Video } from 'react-native-compressor';
import Upload from 'react-native-background-upload';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

type UploadStage = 'queued' | 'compressing' | 'uploading' | 'complete' | 'failed';

interface UploadState {
  stage: UploadStage;
  progress: number;
  error?: string;
}

interface UploadOptions {
  quality?: keyof typeof QUALITY_PRESETS;
  allowCellular?: boolean;
  onStateChange?: (state: UploadState) => void;
}

class VideoUploadManager {
  private apiBaseUrl: string;
  private offlineQueue: OfflineUploadQueue;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
    this.offlineQueue = new OfflineUploadQueue();
  }

  async upload(videoUri: string, options: UploadOptions = {}): Promise<string> {
    const {
      quality = 'high',
      allowCellular = false,
      onStateChange,
    } = options;

    const emit = (state: UploadState) => onStateChange?.(state);

    // 1. Network check
    const netState = await NetInfo.fetch();
    if (!netState.isConnected || (!allowCellular && netState.type === 'cellular')) {
      emit({ stage: 'queued', progress: 0 });
      const metadata = await extractMetadata(videoUri);
      const queueId = await this.offlineQueue.enqueue(videoUri, metadata, quality);
      return queueId;
    }

    try {
      // 2. Extract metadata BEFORE compression (compression may strip EXIF)
      const metadata = await extractMetadata(videoUri);

      // 3. Compress
      emit({ stage: 'compressing', progress: 0 });
      const compressedPath = await compressVideo(videoUri, quality, (progress) => {
        emit({ stage: 'compressing', progress });
      });

      // 4. Request upload URL from backend
      const initResponse = await fetch(`${this.apiBaseUrl}/uploads/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metadata,
          filename: `video_${Date.now()}.mp4`,
        }),
      });
      const { uploadUrl, uploadId } = await initResponse.json();

      // 5. Background upload with retry
      emit({ stage: 'uploading', progress: 0 });
      await withRetry(
        () =>
          new Promise<void>((resolve, reject) => {
            Upload.startUpload({
              url: uploadUrl,
              path: compressedPath,
              method: 'PUT',
              type: 'raw',
              headers: { 'Content-Type': 'video/mp4' },
              notification: {
                enabled: true,
                onProgressTitle: 'Uploading video',
                autoClear: true,
              },
            }).then((taskId) => {
              Upload.addListener('progress', taskId, (data) => {
                emit({ stage: 'uploading', progress: data.progress / 100 });
              });
              Upload.addListener('completed', taskId, () => resolve());
              Upload.addListener('error', taskId, (data) =>
                reject(new Error(data.error)),
              );
            });
          }),
        {
          maxRetries: 3,
          onRetry: (attempt, delay) => {
            console.log(`Upload retry ${attempt}, waiting ${delay}ms`);
          },
        },
      );

      // 6. Notify backend
      await fetch(`${this.apiBaseUrl}/uploads/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId }),
      });

      emit({ stage: 'complete', progress: 1 });
      return uploadId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      emit({ stage: 'failed', progress: 0, error: message });
      throw error;
    }
  }
}

// Usage
const manager = new VideoUploadManager('https://api.example.com');

await manager.upload(videoUri, {
  quality: 'high',
  allowCellular: false,
  onStateChange: (state) => {
    console.log(`${state.stage}: ${Math.round(state.progress * 100)}%`);
  },
});
```
