import SwiftUI
import UIKit

// MARK: - TiltRecognizer
//
// Transparent UIViewRepresentable that installs a native UIPanGestureRecognizer
// whose delegate returns true for shouldRecognizeSimultaneouslyWith, letting it
// run alongside UIScrollView's own pan recognizer.
// Shared by all parallax poster card views.

struct TiltRecognizer: UIViewRepresentable {
    var onChanged: (_ initialLocation: CGPoint, _ liveLocation: CGPoint) -> Void
    var onEnded:   () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> UIView {
        let view = PassthroughView()
        let pan  = UIPanGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handle(_:))
        )
        pan.delegate               = context.coordinator
        pan.maximumNumberOfTouches = 1
        view.addGestureRecognizer(pan)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onChanged = onChanged
        context.coordinator.onEnded   = onEnded
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onChanged: ((_ initialLocation: CGPoint, _ liveLocation: CGPoint) -> Void)?
        var onEnded:   (() -> Void)?

        private var initialLocation: CGPoint?

        @objc func handle(_ pan: UIPanGestureRecognizer) {
            guard let view = pan.view else { return }
            let loc  = pan.location(in: view)
            let norm = CGPoint(
                x: loc.x / max(view.bounds.width,  1),
                y: loc.y / max(view.bounds.height, 1)
            )
            switch pan.state {
            case .began:
                initialLocation = norm
                onChanged?(norm, norm)
            case .changed:
                onChanged?(initialLocation ?? norm, norm)
            case .ended, .cancelled, .failed:
                initialLocation = nil
                onEnded?()
            default:
                break
            }
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
        ) -> Bool { true }
    }
}

// MARK: - PassthroughView

final class PassthroughView: UIView {
    override func didMoveToSuperview() {
        super.didMoveToSuperview()
        // Walk up to the nearest UIScrollView and tell its pan recognizer not to
        // cancel our gesture when scroll starts — prevents the "bobble" snap-back.
        var ancestor = superview
        while let v = ancestor {
            if let sv = v as? UIScrollView {
                sv.panGestureRecognizer.cancelsTouchesInView = false
                break
            }
            ancestor = v.superview
        }
    }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        let hit = super.hitTest(point, with: event)
        return hit == self ? self : hit
    }
}
