# react-native-camera-video Examples

## Basic Camera Preview with Permissions

```typescript
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Linking, TouchableOpacity } from 'react-native';
import { Camera, useCameraDevice, CameraPermissionStatus } from 'react-native-vision-camera';

function CameraPreview(): React.JSX.Element {
  const [cameraPermission, setCameraPermission] = useState<CameraPermissionStatus>('not-determined');
  const [micPermission, setMicPermission] = useState<CameraPermissionStatus>('not-determined');
  const device = useCameraDevice('back');

  useEffect(() => {
    const checkPermissions = async () => {
      const camStatus = Camera.getCameraPermissionStatus();
      const micStatus = Camera.getMicrophonePermissionStatus();

      if (camStatus === 'not-determined') {
        const newStatus = await Camera.requestCameraPermission();
        setCameraPermission(newStatus);
      } else {
        setCameraPermission(camStatus);
      }

      if (micStatus === 'not-determined') {
        const newStatus = await Camera.requestMicrophonePermission();
        setMicPermission(newStatus);
      } else {
        setMicPermission(micStatus);
      }
    };

    checkPermissions();
  }, []);

  if (cameraPermission === 'denied') {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>Camera access is required.</Text>
        <TouchableOpacity onPress={() => Linking.openSettings()}>
          <Text style={styles.link}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (device == null) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>No camera device found.</Text>
      </View>
    );
  }

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={true}
      audio={micPermission === 'granted'}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  message: { fontSize: 16, marginBottom: 12 },
  link: { fontSize: 16, color: '#007AFF' },
});
```

---

## Video Recording with Start/Stop

```typescript
import React, { useRef, useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Camera, useCameraDevice, VideoFile } from 'react-native-vision-camera';

function VideoRecorder(): React.JSX.Element {
  const cameraRef = useRef<Camera>(null);
  const [isRecording, setIsRecording] = useState(false);
  const device = useCameraDevice('back');

  const startRecording = useCallback(() => {
    if (cameraRef.current == null) return;

    setIsRecording(true);
    cameraRef.current.startRecording({
      videoCodec: 'h265',
      fileType: 'mp4',
      videoBitRate: 'high',
      onRecordingFinished: (video: VideoFile) => {
        setIsRecording(false);
        console.log('Recording saved:', video.path);
        console.log('Duration:', video.duration, 'seconds');
      },
      onRecordingError: (error) => {
        setIsRecording(false);
        console.error('Recording failed:', error);
      },
    });
  }, []);

  const stopRecording = useCallback(async () => {
    await cameraRef.current?.stopRecording();
  }, []);

  if (device == null) return <View />;

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
      />
      <View style={styles.controls}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={isRecording ? stopRecording : startRecording}
        >
          <Text style={styles.buttonText}>
            {isRecording ? 'Stop' : 'Record'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: {
    position: 'absolute', bottom: 60,
    left: 0, right: 0, alignItems: 'center',
  },
  recordButton: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#FF3B30', justifyContent: 'center', alignItems: 'center',
  },
  recordButtonActive: { backgroundColor: '#555' },
  buttonText: { color: '#FFF', fontWeight: '600' },
});
```

---

## Photo Capture with Flash Configuration

```typescript
import React, { useRef, useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, Image, StyleSheet } from 'react-native';
import { Camera, useCameraDevice, PhotoFile } from 'react-native-vision-camera';

type FlashMode = 'on' | 'off' | 'auto';

function PhotoCapture(): React.JSX.Element {
  const cameraRef = useRef<Camera>(null);
  const [flash, setFlash] = useState<FlashMode>('auto');
  const [lastPhoto, setLastPhoto] = useState<string | null>(null);
  const device = useCameraDevice('back');

  const takePhoto = useCallback(async () => {
    if (cameraRef.current == null) return;

    const photo: PhotoFile = await cameraRef.current.takePhoto({
      flash,
      enableAutoRedEyeReduction: true,
      enableAutoStabilization: true,
      qualityPrioritization: 'balanced',
    });

    setLastPhoto(`file://${photo.path}`);
  }, [flash]);

  const cycleFlash = useCallback(() => {
    setFlash((prev) => {
      const modes: FlashMode[] = ['auto', 'on', 'off'];
      const idx = modes.indexOf(prev);
      return modes[(idx + 1) % modes.length];
    });
  }, []);

  if (device == null) return <View />;

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        photo={true}
        photoQualityBalance="balanced"
      />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={cycleFlash} style={styles.flashButton}>
          <Text style={styles.flashText}>Flash: {flash.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.bottomBar}>
        <TouchableOpacity onPress={takePhoto} style={styles.captureButton}>
          <View style={styles.captureInner} />
        </TouchableOpacity>
      </View>
      {lastPhoto && (
        <Image source={{ uri: lastPhoto }} style={styles.thumbnail} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { position: 'absolute', top: 60, left: 20 },
  flashButton: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8 },
  flashText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  bottomBar: {
    position: 'absolute', bottom: 60,
    left: 0, right: 0, alignItems: 'center',
  },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#FFF',
    justifyContent: 'center', alignItems: 'center',
  },
  captureInner: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFF',
  },
  thumbnail: {
    position: 'absolute', bottom: 60, left: 20,
    width: 60, height: 80, borderRadius: 8, borderWidth: 2, borderColor: '#FFF',
  },
});
```

---

## Frame Processor for Barcode Scanning

```typescript
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useFrameProcessor,
} from 'react-native-vision-camera';
import { useBarcodeScanner } from 'react-native-vision-camera-mlkit';
import { useRunOnJS } from 'react-native-worklets-core';

function BarcodeScanner(): React.JSX.Element {
  const device = useCameraDevice('back');
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  const { scanBarcodes } = useBarcodeScanner({
    barcodeTypes: ['qr', 'ean-13', 'code-128'],
  });

  const handleDetected = useRunOnJS((value: string) => {
    setScannedCode(value);
  }, []);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      const barcodes = scanBarcodes(frame);
      if (barcodes.length > 0 && barcodes[0].rawValue) {
        handleDetected(barcodes[0].rawValue);
      }
    },
    [scanBarcodes, handleDetected],
  );

  if (device == null) return <View />;

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />
      {scannedCode && (
        <View style={styles.overlay}>
          <Text style={styles.codeText}>{scannedCode}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: {
    position: 'absolute', bottom: 100,
    left: 20, right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16, borderRadius: 12, alignItems: 'center',
  },
  codeText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
```

---

## Camera Device Selection (Multi-Lens)

```typescript
import React, { useState, useMemo } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
  CameraDevice,
} from 'react-native-vision-camera';

type LensType = 'wide' | 'ultrawide' | 'telephoto';

function MultiLensCamera(): React.JSX.Element {
  const [activeLens, setActiveLens] = useState<LensType>('wide');
  const devices = useCameraDevices();

  const deviceMap = useMemo(() => {
    const map: Partial<Record<LensType, CameraDevice>> = {};

    const wideDevice = devices.find(
      (d) =>
        d.position === 'back' &&
        d.physicalDevices.includes('wide-angle-camera') &&
        d.physicalDevices.length === 1,
    );
    if (wideDevice) map.wide = wideDevice;

    const ultraWideDevice = devices.find(
      (d) =>
        d.position === 'back' &&
        d.physicalDevices.includes('ultra-wide-angle-camera'),
    );
    if (ultraWideDevice) map.ultrawide = ultraWideDevice;

    const teleDevice = devices.find(
      (d) =>
        d.position === 'back' &&
        d.physicalDevices.includes('telephoto-camera'),
    );
    if (teleDevice) map.telephoto = teleDevice;

    return map;
  }, [devices]);

  const fallbackDevice = useCameraDevice('back');
  const activeDevice = deviceMap[activeLens] ?? fallbackDevice;

  if (activeDevice == null) return <View />;

  const lensOptions: { key: LensType; label: string }[] = [
    { key: 'ultrawide', label: '0.5x' },
    { key: 'wide', label: '1x' },
    { key: 'telephoto', label: '2x' },
  ];

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={activeDevice}
        isActive={true}
        photo={true}
        video={true}
      />
      <View style={styles.lensBar}>
        {lensOptions.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setActiveLens(key)}
            style={[
              styles.lensButton,
              activeLens === key && styles.lensButtonActive,
            ]}
            disabled={!deviceMap[key]}
          >
            <Text
              style={[
                styles.lensText,
                activeLens === key && styles.lensTextActive,
                !deviceMap[key] && styles.lensTextDisabled,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  lensBar: {
    position: 'absolute', bottom: 120,
    left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  lensButton: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  lensButtonActive: { backgroundColor: 'rgba(255,204,0,0.9)' },
  lensText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  lensTextActive: { color: '#000' },
  lensTextDisabled: { opacity: 0.3 },
});
```

---

## HEVC Video Recording Configuration

```typescript
import React, { useRef, useCallback } from 'react';
import { Camera, useCameraDevice, VideoFile } from 'react-native-vision-camera';

function useHEVCRecording() {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');

  const calculateBitrate = useCallback(
    (resolution: '4k' | '1080p' | '720p', fps: number, hdr: boolean): number => {
      const baseBitrates: Record<string, number> = {
        '4k': 20_000_000,
        '1080p': 10_000_000,
        '720p': 5_000_000,
      };

      let bitrate = baseBitrates[resolution];
      bitrate = (bitrate / 30) * fps;
      if (hdr) bitrate *= 1.2;
      bitrate *= 0.8; // HEVC efficiency factor
      return Math.round(bitrate);
    },
    [],
  );

  const startHEVCRecording = useCallback(
    (options: {
      resolution: '4k' | '1080p' | '720p';
      fps: number;
      hdr: boolean;
      onFinished: (video: VideoFile) => void;
      onError: (error: unknown) => void;
    }) => {
      const bitrate = calculateBitrate(options.resolution, options.fps, options.hdr);

      cameraRef.current?.startRecording({
        videoCodec: 'h265',
        videoBitRate: bitrate,
        fileType: 'mp4',
        onRecordingFinished: options.onFinished,
        onRecordingError: options.onError,
      });
    },
    [calculateBitrate],
  );

  const stopRecording = useCallback(async () => {
    await cameraRef.current?.stopRecording();
  }, []);

  return { cameraRef, device, startHEVCRecording, stopRecording };
}

// Usage in a component:
// const { cameraRef, device, startHEVCRecording, stopRecording } = useHEVCRecording();
//
// startHEVCRecording({
//   resolution: '1080p',
//   fps: 30,
//   hdr: false,
//   onFinished: (video) => console.log('Saved:', video.path),
//   onError: (err) => console.error(err),
// });
```

---

## Recording Indicator UI Component

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';

interface RecordingIndicatorProps {
  isRecording: boolean;
  isPaused: boolean;
}

function RecordingIndicator({
  isRecording,
  isPaused,
}: RecordingIndicatorProps): React.JSX.Element | null {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording && !isPaused) {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, isPaused, pulseAnim]);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else if (!isRecording) {
      setElapsed(0);
    }

    if (timerRef.current && (isPaused || !isRecording)) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRecording, isPaused]);

  if (!isRecording) return null;

  const minutes = Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (elapsed % 60).toString().padStart(2, '0');

  return (
    <View style={styles.indicator}>
      <Animated.View style={[styles.dot, { opacity: pulseAnim }]} />
      <Text style={styles.time}>
        {minutes}:{seconds}
      </Text>
      {isPaused && <Text style={styles.pausedLabel}>PAUSED</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 8,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30' },
  time: { color: '#FFF', fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pausedLabel: { color: '#FFCC00', fontSize: 12, fontWeight: '700' },
});
```

---

## Capture, Compress, and Upload Complete Flow

```typescript
import { useRef, useCallback, useState } from 'react';
import { Camera, useCameraDevice, VideoFile } from 'react-native-vision-camera';
import { Video as VideoCompressor } from 'react-native-compressor';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';

interface UploadProgress {
  stage: 'recording' | 'compressing' | 'uploading' | 'complete' | 'error';
  progress: number; // 0-1
  message: string;
}

function useCaptureAndUpload(uploadEndpoint: string) {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const [status, setStatus] = useState<UploadProgress>({
    stage: 'recording',
    progress: 0,
    message: '',
  });

  const extractMetadata = async (path: string) => {
    const stat = await RNFS.stat(path);
    return {
      originalSize: stat.size,
      capturedAt: new Date().toISOString(),
    };
  };

  const compressVideo = async (sourcePath: string): Promise<string> => {
    setStatus({ stage: 'compressing', progress: 0, message: 'Compressing video...' });

    const compressed = await VideoCompressor.compress(sourcePath, {
      compressionMethod: 'auto',
      maxSize: 1920,
    }, (progress) => {
      setStatus({
        stage: 'compressing',
        progress,
        message: `Compressing: ${Math.round(progress * 100)}%`,
      });
    });

    return compressed;
  };

  const uploadVideo = async (filePath: string, metadata: Record<string, unknown>) => {
    setStatus({ stage: 'uploading', progress: 0, message: 'Uploading...' });

    const netInfo = await NetInfo.fetch();
    const chunkSize = netInfo.type === 'wifi' ? 5 * 1024 * 1024 : 500 * 1024;

    // Stream upload in chunks — never load entire video into memory
    const fileInfo = await RNFS.stat(filePath);
    const totalSize = fileInfo.size;
    let uploaded = 0;

    while (uploaded < totalSize) {
      // Read only one chunk at a time from disk (base64 encoded)
      const chunk = await RNFS.read(filePath, chunkSize, uploaded, 'base64');
      const chunkBytes = Buffer.from(chunk, 'base64');

      await fetch(uploadEndpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': String(uploaded),
          'Content-Length': String(chunkBytes.length),
          'X-Video-Metadata': JSON.stringify(metadata),
        },
        body: chunkBytes,
      });

      uploaded += chunkBytes.length;
      const progress = uploaded / totalSize;
      setStatus({
        stage: 'uploading',
        progress,
        message: `Uploading: ${Math.round(progress * 100)}%`,
      });
    }
  };

  const cleanup = async (...paths: string[]) => {
    for (const path of paths) {
      try {
        const exists = await RNFS.exists(path);
        if (exists) await RNFS.unlink(path);
      } catch {
        // Ignore cleanup errors
      }
    }
  };

  const startCaptureFlow = useCallback(() => {
    setStatus({ stage: 'recording', progress: 0, message: 'Recording...' });

    cameraRef.current?.startRecording({
      videoCodec: 'h265',
      fileType: 'mp4',
      videoBitRate: 'high',
      onRecordingFinished: async (video: VideoFile) => {
        let compressedPath = '';
        try {
          const metadata = await extractMetadata(video.path);

          compressedPath = await compressVideo(video.path);

          const compressedStat = await RNFS.stat(compressedPath);
          const fullMetadata = {
            ...metadata,
            compressedSize: compressedStat.size,
            codec: 'h265',
            duration: video.duration,
          };

          await uploadVideo(compressedPath, fullMetadata);

          setStatus({ stage: 'complete', progress: 1, message: 'Upload complete' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Upload failed';
          setStatus({ stage: 'error', progress: 0, message });
        } finally {
          await cleanup(video.path, compressedPath);
        }
      },
      onRecordingError: (error) => {
        setStatus({ stage: 'error', progress: 0, message: error.message });
      },
    });
  }, [uploadEndpoint]);

  const stopCapture = useCallback(async () => {
    await cameraRef.current?.stopRecording();
  }, []);

  return { cameraRef, device, status, startCaptureFlow, stopCapture };
}
```

---

## Orientation Handling During Recording

```typescript
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import {
  Camera,
  useCameraDevice,
  Orientation,
} from 'react-native-vision-camera';

function OrientationAwareRecorder(): React.JSX.Element {
  const cameraRef = useRef<Camera>(null);
  const device = useCameraDevice('back');
  const { width, height } = useWindowDimensions();
  const [orientation, setOrientation] = useState<Orientation>('portrait');

  useEffect(() => {
    // Determine orientation from window dimensions
    // VisionCamera handles rotation metadata automatically,
    // but UI layout may need manual adjustment
    if (width > height) {
      setOrientation('landscape-left');
    } else {
      setOrientation('portrait');
    }
  }, [width, height]);

  const startOrientationAwareRecording = useCallback(() => {
    cameraRef.current?.startRecording({
      videoCodec: 'h265',
      fileType: 'mp4',
      onRecordingFinished: (video) => {
        // VisionCamera embeds orientation metadata in the video file.
        // On some Android devices, rotation metadata may be incorrect.
        // Verify orientation before upload if targeting Android:
        console.log('Video saved:', video.path);
        console.log('Duration:', video.duration);
      },
      onRecordingError: (error) => {
        console.error('Recording error:', error);
      },
    });
  }, []);

  if (device == null) return <View />;

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
        orientation={orientation}
      />
      {/* Rotate controls based on orientation so buttons remain accessible */}
      <View
        style={[
          styles.controls,
          orientation.startsWith('landscape') && styles.controlsLandscape,
        ]}
      >
        {/* Recording controls go here */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  controls: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  controlsLandscape: {
    bottom: 'auto',
    right: 30,
    top: 0,
    left: 'auto',
    flexDirection: 'column',
    justifyContent: 'center',
    height: '100%',
  },
});
```
