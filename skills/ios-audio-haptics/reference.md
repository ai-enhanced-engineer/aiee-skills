# iOS Audio & Haptics -- Reference

## Audio Session Configuration

### Categories and Modes
- **`.playback`**: Audio continues when screen locks or app backgrounds (with `UIBackgroundModes`). Use for breathing sessions.
- **`.ambient`**: Mixes with other audio, silenced by ringer switch. Use for optional background sounds.
- **`.playAndRecord`**: For apps that also capture microphone input.

### Mixing Options
- **`.duckOthers`**: Reduces other apps' audio volume. Implies `mixWithOthers`. Best for breathing apps that should lower music volume.
- **`.mixWithOthers`**: Plays alongside other audio at full volume. Use when your audio is non-essential.
- **`.interruptSpokenAudioAndMixWithOthers`**: Pauses podcasts/audiobooks but mixes with music.

### Session Activation
Call `setActive(true)` when beginning playback and `setActive(false, options: .notifyOthersOnDeactivation)` when done. The deactivation notification lets other apps resume their audio.

## Interruption Handling

Audio sessions can be interrupted by phone calls, Siri, alarms, and other apps activating their sessions. Without handling, your audio simply stops and never resumes.

### Interruption Flow
1. **`.began`**: System interrupts your audio. Pause playback and update UI to reflect paused state.
2. **`.ended`**: Interruption is over. Check `InterruptionOptions` for `.shouldResume` before restarting -- not all interruptions grant resume permission.

### Edge Cases
- If the user declines a call, you get `.ended` with `.shouldResume`.
- If the user accepts a call, you get `.ended` without `.shouldResume` after the call ends.
- Siri activation always interrupts; resume is granted after Siri dismisses.
- Route changes (unplugging headphones) are separate from interruptions -- observe `routeChangeNotification` if needed.

## Core Haptics Engine Lifecycle

### Preparation
1. Check `CHHapticEngine.capabilitiesForHardware().supportsHaptics` -- returns false on older devices and Simulator.
2. Create the engine with `CHHapticEngine()` and call `start()`.
3. Set `stoppedHandler` to auto-restart. The engine can stop due to audio session interruptions, app backgrounding, or system resource pressure.

### Engine States
- **Running**: Ready to play patterns.
- **Stopped**: Needs `start()` before playing. Calling `makePlayer`/`start` on a stopped engine throws.
- **Transient failure**: Engine stopped due to system pressure. Auto-restart in `stoppedHandler` handles this.

### Memory and Battery
- The engine consumes resources while running. Start it when the breathing session begins, not at app launch.
- Stop the engine when the session ends to release Taptic Engine resources.

## Haptic Pattern Design

### Intensity Curves for Breathing
- **Inhale**: Ramp intensity from 0.1 to 0.8 over the inhale duration. Rising sensation cues "breathe in."
- **Exhale**: Ramp intensity from 0.8 to 0.1. Falling sensation cues "breathe out."
- **Hold**: Silence. No haptics during hold phase -- this provides cognitive rest and makes the next phase's onset more noticeable.
- **Rest**: Optional single subtle tap (`.hapticTransient`) to mark the start of the rest period.

### Sharpness Guidelines
- **Low sharpness (0.1-0.2)**: Soft, broad vibration. Calming. Use for breathing cues.
- **Medium sharpness (0.4-0.6)**: Distinct but not jarring. Use for phase transitions.
- **High sharpness (0.8-1.0)**: Sharp, precise tap. Use sparingly for alerts only.

### Pattern Construction
Use `CHHapticParameterCurve` for smooth transitions rather than discrete `CHHapticEvent` sequences. Curves feel more organic and map naturally to breathing rhythms. Combine a `.hapticContinuous` event with an intensity curve for the smoothest result.

## Background Audio Requirements

### Info.plist Configuration
The `UIBackgroundModes` array must include `audio` for background playback. Without this:
- Audio stops when the app moves to background.
- Audio stops when the screen locks.
- The system may suspend your app within seconds of backgrounding.

### Additional Requirements
- The audio session must be active and configured with `.playback` category.
- Audio must actually be playing -- the system will suspend your app if it claims background audio but goes silent for too long.
- For breathing apps: if there are silent gaps between guidance phrases, keep a very low-volume ambient track playing to maintain the background session.
