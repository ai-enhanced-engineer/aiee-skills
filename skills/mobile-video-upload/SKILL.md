---
name: mobile-video-upload
description: Mobile video upload patterns for React Native and native iOS/Android including chunked resumable uploads, pre-upload compression, background upload, and metadata preservation. Use for uploading high-quality video from phones to backend services.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/mobile-video-upload
updated: 2026-04-18
---

# Mobile Video Upload Skill

Use this skill when implementing video upload from mobile devices (React Native, iOS, or Android) to backend services, especially for large files requiring resumability, compression, or background processing.

## Upload Protocol Comparison

| Factor | tus | GCS Resumable | S3 Multipart |
|--------|-----|---------------|--------------|
| **Reliability** | Built-in resume, checkpoint-based | Built-in resume, 7-day sessions | Manual tracking, parallel parts |
| **Complexity** | Medium (needs tusd server) | Low (direct to cloud) | Medium (initiate/upload/complete) |
| **Ecosystem** | Open standard, multi-cloud | GCP only | AWS only |
| **RN Support** | tus-js-client 4.x + native clients | Via signed URLs | Via signed URLs / Amplify |

**Rule of thumb**: tus for multi-cloud or self-hosted; native cloud APIs for single-cloud with direct upload.

## Compression Decision Matrix

| Condition | Action |
|-----------|--------|
| Mobile network (3G/4G/5G) | Compress on-device |
| Metered WiFi or free-tier user | Compress on-device |
| Unmetered WiFi + user selects "Original" | Send raw |
| Time-critical (live event) | Light or no compression |
| Archival / professional content | Send raw, server-side transcode |

## Key Libraries (March 2026)

| Library | Version | Status |
|---------|---------|--------|
| `react-native-compressor` | 1.10.x | Active — primary compression choice |
| `react-native-background-upload` | 6.x | Active — bare workflow only |
| `tus-js-client` | 4.x | Active — needs custom `urlStorage` for RN |
| `expo-video-metadata` | 2.x | Active — Expo SDK 50+ |
| `expo-background-task` | SDK 50+ | Active — replaces deprecated expo-background-fetch |
| `@react-native-community/netinfo` | 11.x | Active |
| `ffmpeg-kit-react-native` | N/A | **RETIRED Jan 2025** — binaries removed from registries |

> **FFmpegKit is retired** (Jan 2025). Binaries removed from registries. Use `react-native-compressor` for standard compression or build FFmpegKit from source if advanced codec support is required.

## See Also

- **[reference.md](./reference.md)** — Protocol deep dives, compression patterns, background upload, security, anti-patterns
- **[examples.md](./examples.md)** — Production code: tus upload, GCS resumable, compression, background upload, offline queue, complete upload manager
