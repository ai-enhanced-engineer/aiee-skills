---
name: react-native-camera-video
description: Camera and video capture for React Native using react-native-vision-camera v4+. Frame processors, video recording, codec selection, and integration with upload pipelines. Use for high-quality video capture from mobile devices.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/rn-camera-video
updated: 2026-04-18
---

# React Native Camera & Video Capture

## Library Comparison

| Feature | react-native-vision-camera v4 | expo-camera |
|---------|-------------------------------|-------------|
| Frame processors | Full (JSI/Worklets) | None |
| ML integration | ML Kit, TFLite, ONNX | Not supported |
| Video codec control | H.264, H.265/HEVC | Limited |
| Multi-camera | Yes | No |
| Expo Go | No (dev build required) | Yes |
| Best for | Production camera apps, ML, pro video | Simple photo capture, prototypes |

## Video Recording Quick Reference

- **Codecs**: `h264` (universal), `h265` (50% smaller, 92% smartphone support)
- **Resolution**: 4K (archival), 1080p (social/upload), 720p (storage-constrained)
- **FPS**: 30 (standard), 60 (smooth), 120/240 (slow-motion)
- **Bitrate**: `'low'` / `'normal'` / `'high'` or explicit value in bps
- **Stabilization**: `'off'` / `'standard'` / `'cinematic'` / `'auto'`

## Frame Processors

Worklet-based functions running on a parallel camera thread via JSI. Budget ~33ms per frame at 30 FPS. Use `runAsync()` for heavy ML inference. Requires `react-native-worklets-core`.

## Deprecation Note

`expo-av` is deprecated as of SDK 52. Use `expo-video` with `useVideoPlayer` for playback.

## Further Reading

- `reference.md` — Setup, permissions, APIs, codec details, platform specifics, anti-patterns
- `examples.md` — Production TypeScript examples for capture, recording, frame processing, and upload flows
