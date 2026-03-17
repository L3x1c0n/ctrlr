import CoreMotion
import SwiftUI
import UIKit

// MARK: - MotionManager
//
// Shared singleton that drives gyroscope-based tilt for poster cards.
// Uses data.gravity (not data.attitude) so the gravity vector encodes tilt
// directly in device-space x/y components.
//
// Orientation correction: gravity is reported in device-space coords, not
// screen-space. When the device is in landscape the .x/.y axes swap relative
// to the screen, so we remap them based on the current interface orientation.
// The reference is reset whenever orientation changes so the new axes get a
// fresh neutral baseline.
//
// Concurrency model:
//   • @MainActor for @Published tilt and the public API (start / stop)
//   • process() is nonisolated and runs on the CMMotionManager callback queue
//   • Properties shared between main actor and background queue are marked
//     nonisolated(unsafe) — the values are simple numerics and the benign
//     read/write race has no safety consequence beyond one stale frame.

@MainActor
final class MotionManager: ObservableObject {
    static let shared = MotionManager()

    @Published var tilt: CGSize = .zero

    private let motion = CMMotionManager()
    private let queue  = OperationQueue()

    // nonisolated(unsafe): read/written from both main actor and motion queue.
    private nonisolated(unsafe) var refX: Double? = nil
    private nonisolated(unsafe) var refY: Double? = nil
    private nonisolated(unsafe) var smoothX: Double = 0
    private nonisolated(unsafe) var smoothY: Double = 0
    private nonisolated(unsafe) var warmupRemaining: Int = 0
    private nonisolated(unsafe) var cachedOrientation: UIInterfaceOrientation = .portrait

    private let alpha:        Double = 0.08
    private let warmupFrames: Int   = 30

    private init() {
        queue.name = "com.attakrit.CTRLr.motion"
        queue.maxConcurrentOperationCount = 1

        NotificationCenter.default.addObserver(
            forName: UIDevice.orientationDidChangeNotification,
            object: nil,
            queue: nil
        ) { [weak self] _ in
            // Hop to MainActor to safely access actor-isolated state and UIKit API.
            Task { @MainActor [weak self] in
                guard let self else { return }
                let newOrientation = UIApplication.shared.connectedScenes
                    .compactMap { $0 as? UIWindowScene }
                    .first?.effectiveGeometry.interfaceOrientation ?? .portrait
                guard newOrientation != self.cachedOrientation,
                      newOrientation != .unknown else { return }
                self.cachedOrientation  = newOrientation
                self.refX              = nil
                self.refY              = nil
                self.smoothX           = 0
                self.smoothY           = 0
                self.warmupRemaining   = self.warmupFrames
                self.tilt              = .zero
            }
        }
    }

    func start() {
        cachedOrientation = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first?.effectiveGeometry.interfaceOrientation ?? .portrait

        guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
        refX           = nil
        refY           = nil
        smoothX        = 0
        smoothY        = 0
        warmupRemaining = warmupFrames
        // 30 Hz — halves CPU wakeups vs 60 Hz; imperceptible for slow ambient drift.
        motion.deviceMotionUpdateInterval = 1.0 / 30.0
        motion.startDeviceMotionUpdates(to: queue) { [weak self] data, _ in
            guard let self, let data else { return }
            let result = self.process(data)
            Task { @MainActor in
                // Skip publish when change is below perceptual threshold —
                // prevents re-rendering all cards for sensor noise at rest.
                let threshold: CGFloat = 0.004
                guard abs(result.width  - self.tilt.width)  > threshold ||
                      abs(result.height - self.tilt.height) > threshold else { return }
                self.tilt = result
            }
        }
    }

    func stop() {
        motion.stopDeviceMotionUpdates()
        Task { @MainActor in tilt = .zero }
    }

    // MARK: - Processing (runs on motion queue, nonisolated)

    private nonisolated func process(_ data: CMDeviceMotion) -> CGSize {
        // Remap device-space gravity to screen-space based on interface orientation.
        let gx: Double
        let gy: Double
        switch cachedOrientation {
        case .landscapeLeft:
            gx = -data.gravity.y
            gy =  data.gravity.x
        case .landscapeRight:
            gx =  data.gravity.y
            gy = -data.gravity.x
        case .portraitUpsideDown:
            gx = -data.gravity.x
            gy = -data.gravity.y
        default: // portrait
            gx =  data.gravity.x
            gy =  data.gravity.y
        }

        // Discard first N frames so UIKit has time to report the correct orientation
        // and the device is at rest before locking in a reference position.
        if warmupRemaining > 0 {
            warmupRemaining -= 1
            return .zero
        }

        if refX == nil { refX = gx; refY = gy }

        let dx =  (gx - (refX ?? gx))
        let dy = -(gy - (refY ?? gy))   // negate: top tilting away = positive y

        smoothX += alpha * (dx - smoothX)
        smoothY += alpha * (dy - smoothY)

        let x = CGFloat(max(-1, min(1, smoothX)))
        let y = CGFloat(max(-1, min(1, smoothY)))

        return CGSize(width: x, height: y)
    }
}
