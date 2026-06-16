---
name: ios-audio-haptics
description: "AVFoundation audio and Core Haptics for guided breathing apps. Audio sessions, mixing, interruption handling, and haptic pattern design for iOS and watchOS. Use when implementing audio playback, multi-track mixing, audio interruption handling, or haptic feedback patterns."
kb-sources:
  - wiki/software-engineering/ios-audio-haptics
updated: 2026-05-22
---

# iOS Audio & Haptics

Audio playback (AVFoundation) and haptic feedback (Core Haptics / WKHapticType) patterns for guided breathing and wellness apps.

## When to Use

- Playing ambient sounds or voice guidance during breathing sessions
- Mixing multiple audio sources (ambient + voice)
- Handling audio interruptions (calls, Siri, other apps)
- Designing haptic patterns for breathing rhythm cues

## Core Concepts

### Audio Session Configuration
Configure `AVAudioSession` with `.playback` category for background audio. Use `.duckOthers` option (implies `mixWithOthers`) for ambient layering. Set up `AVAudioEngine` with separate player nodes for ambient and guidance tracks.

### Audio Mixing
Attach multiple `AVAudioPlayerNode` instances to `AVAudioEngine` via separate `AVAudioMixerNode` nodes. Control volume per channel (e.g., ambient at 0.3, guidance at 1.0). Loop ambient audio by re-scheduling in the completion handler.

### Core Haptics (iOS)
`CHHapticEngine` provides rich parametric haptics. Check `capabilitiesForHardware().supportsHaptics` before use. Use intensity curves that rise during inhale and fall during exhale. Set `stoppedHandler` to auto-restart the engine. Use low sharpness (0.1-0.2) for calming breath cues.

### watchOS Haptics
`WKHapticType` is simpler than Core Haptics. Map breath phases to built-in types: `.start` for inhale, `.click` for hold, `.directionDown` for exhale, `.stop` for rest. No continuous patterns available -- discrete events only.

### Background Audio
Add `audio` to `UIBackgroundModes` in Info.plist. Without this, audio stops when the app enters background. Required for any breathing session that continues with the screen off.

## Audio Format Recommendations

| Use Case | Format | Bitrate | Notes |
|----------|--------|---------|-------|
| Ambient sounds (loops) | AAC (.m4a) | 128kbps | Good compression, loops well |
| Voice guidance | AAC (.m4a) | 96kbps | Speech doesn't need high bitrate |
| Short UI sounds | CAF (.caf) | Uncompressed | Low latency playback |
| Streaming from AI TTS | PCM buffer | N/A | Feed directly to AVAudioPlayerNode |

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Not handling audio interruptions | Audio sessions can be interrupted by calls/Siri; observe `interruptionNotification` to handle gracefully |
| Using `AVAudioPlayer` for mixing | Use `AVAudioEngine` with player nodes |
| Playing haptics without checking capability | Check `CHHapticEngine.capabilitiesForHardware()` |
| Continuous haptics during hold phase | Silence during hold -- cognitive rest for user |
| Background audio without `UIBackgroundModes` | Add `audio` to background modes in Info.plist |

## Key References

- [AVFoundation Audio documentation](https://developer.apple.com/documentation/avfoundation/audio)
- [Core Haptics documentation](https://developer.apple.com/documentation/corehaptics)
- [WWDC19: Introducing Core Haptics](https://developer.apple.com/videos/play/wwdc2019/520/)

See `reference.md` for detailed explanations of audio session categories, interruption handling, haptic engine lifecycle, and pattern design principles.

See `examples.md` for complete Swift and Info.plist implementations.
