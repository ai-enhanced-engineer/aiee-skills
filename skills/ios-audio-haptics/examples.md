# iOS Audio & Haptics -- Examples

## Audio Session Configuration

```swift
import AVFoundation

class AudioManager {
    private let engine = AVAudioEngine()
    private var ambientPlayer: AVAudioPlayerNode?
    private var guidancePlayer: AVAudioPlayerNode?

    func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        // .playback allows background audio; mixWithOthers for ambient layering
        try session.setCategory(
            .playback,
            mode: .default,
            options: [.duckOthers]  // duckOthers implies mixWithOthers
        )
        try session.setActive(true)
    }

    // Handle interruptions (phone calls, Siri)
    func setupInterruptionHandling() {
        NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let info = notification.userInfo,
                  let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue)
            else { return }

            switch type {
            case .began:
                self?.pauseAll()
            case .ended:
                let options = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                if AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume) {
                    self?.resumeAll()
                }
            @unknown default: break
            }
        }
    }
}
```

## Audio Mixing (Ambient + Voice Guidance)

```swift
extension AudioManager {
    func setupMixing() throws {
        ambientPlayer = AVAudioPlayerNode()
        guidancePlayer = AVAudioPlayerNode()

        engine.attach(ambientPlayer!)
        engine.attach(guidancePlayer!)

        // Ambient at lower volume
        let ambientMixer = AVAudioMixerNode()
        engine.attach(ambientMixer)
        ambientMixer.outputVolume = 0.3

        // Guidance at full volume
        let guidanceMixer = AVAudioMixerNode()
        engine.attach(guidanceMixer)
        guidanceMixer.outputVolume = 1.0

        let format = engine.mainMixerNode.outputFormat(forBus: 0)
        engine.connect(ambientPlayer!, to: ambientMixer, format: format)
        engine.connect(guidancePlayer!, to: guidanceMixer, format: format)
        engine.connect(ambientMixer, to: engine.mainMixerNode, format: format)
        engine.connect(guidanceMixer, to: engine.mainMixerNode, format: format)

        try engine.start()
    }

    func playAmbient(file: String) throws {
        guard let url = Bundle.main.url(forResource: file, withExtension: "m4a"),
              let audioFile = try? AVAudioFile(forReading: url)
        else { return }

        ambientPlayer?.scheduleFile(audioFile, at: nil) {
            // Loop ambient audio
            try? self.playAmbient(file: file)
        }
        ambientPlayer?.play()
    }
}
```

## Core Haptics (iOS) -- Rich Patterns

```swift
import CoreHaptics

class BreathingHapticEngine {
    private var engine: CHHapticEngine?

    func prepare() throws {
        guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        engine = try CHHapticEngine()
        try engine?.start()

        // Auto-restart if engine stops
        engine?.stoppedHandler = { [weak self] reason in
            try? self?.engine?.start()
        }
    }

    // Inhale: rising intensity over duration
    func playInhaleHaptic(duration: TimeInterval) throws {
        let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.4)
        let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.2)

        let events = [
            CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [intensity, sharpness],
                relativeTime: 0,
                duration: duration
            )
        ]

        // Ramp intensity up during inhale
        let curve = CHHapticParameterCurve(
            parameterID: .hapticIntensityControl,
            controlPoints: [
                .init(relativeTime: 0, value: 0.1),
                .init(relativeTime: duration, value: 0.8)
            ],
            relativeTime: 0
        )

        let pattern = try CHHapticPattern(events: events, parameterCurves: [curve])
        let player = try engine?.makePlayer(with: pattern)
        try player?.start(atTime: CHHapticTimeImmediate)
    }

    // Exhale: falling intensity
    func playExhaleHaptic(duration: TimeInterval) throws {
        let intensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.8)
        let sharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.1)

        let events = [
            CHHapticEvent(
                eventType: .hapticContinuous,
                parameters: [intensity, sharpness],
                relativeTime: 0,
                duration: duration
            )
        ]

        let curve = CHHapticParameterCurve(
            parameterID: .hapticIntensityControl,
            controlPoints: [
                .init(relativeTime: 0, value: 0.8),
                .init(relativeTime: duration, value: 0.1)
            ],
            relativeTime: 0
        )

        let pattern = try CHHapticPattern(events: events, parameterCurves: [curve])
        let player = try engine?.makePlayer(with: pattern)
        try player?.start(atTime: CHHapticTimeImmediate)
    }
}
```

## watchOS Haptics (Simpler API)

```swift
import WatchKit

// watchOS uses WKHapticType — less granular than Core Haptics
struct WatchHapticConductor {
    func cueBreathPhase(_ phase: BreathPhase) {
        switch phase {
        case .inhale:
            WKInterfaceDevice.current().play(.start)
        case .hold:
            // Subtle click at hold start
            WKInterfaceDevice.current().play(.click)
        case .exhale:
            WKInterfaceDevice.current().play(.directionDown)
        case .rest:
            WKInterfaceDevice.current().play(.stop)
        }
    }
}
```

## Background Audio (Info.plist)

```xml
<!-- Required in Info.plist for audio to continue in background -->
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```
