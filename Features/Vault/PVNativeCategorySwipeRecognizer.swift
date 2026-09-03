import SwiftUI
import UIKit

/// Installs a window-level pan recognizer, but accepts touches only inside the
/// represented SwiftUI list pane. This avoids fragile attachment to an internal
/// UIHostingView while preserving vertical scrolling and short row-delete drags.
struct PVNativeCategorySwipeRecognizer: UIViewRepresentable {
    let isEnabled: Bool
    let onSwipe: (UISwipeGestureRecognizer.Direction) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onSwipe: onSwipe) }

    func makeUIView(context: Context) -> AttachmentView {
        let view = AttachmentView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        view.onWindowChange = { window in context.coordinator.attach(to: window, sourceView: view) }
        view.onLayout = { context.coordinator.sourceViewDidLayout() }
        return view
    }

    func updateUIView(_ uiView: AttachmentView, context: Context) {
        context.coordinator.onSwipe = onSwipe
        context.coordinator.isEnabled = isEnabled
        context.coordinator.recognizer?.isEnabled = isEnabled
        context.coordinator.attach(to: uiView.window, sourceView: uiView)
        context.coordinator.sourceViewDidLayout()
    }

    static func dismantleUIView(_ uiView: AttachmentView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class AttachmentView: UIView {
        var onWindowChange: ((UIWindow?) -> Void)?
        var onLayout: (() -> Void)?

        override func didMoveToWindow() {
            super.didMoveToWindow()
            onWindowChange?(window)
        }

        override func layoutSubviews() {
            super.layoutSubviews()
            onLayout?()
        }
    }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onSwipe: (UISwipeGestureRecognizer.Direction) -> Void
        var isEnabled = false
        weak var hostWindow: UIWindow?
        weak var sourceView: UIView?
        var activeFrame: CGRect = .zero
        var recognizer: UIPanGestureRecognizer?
        private var horizontalIntent = false

        init(onSwipe: @escaping (UISwipeGestureRecognizer.Direction) -> Void) {
            self.onSwipe = onSwipe
        }

        func attach(to window: UIWindow?, sourceView: UIView) {
            self.sourceView = sourceView
            guard let window else { return }
            if hostWindow === window, recognizer != nil { return }
            detach()
            self.sourceView = sourceView
            let recognizer = UIPanGestureRecognizer(target: self, action: #selector(handle(_:)))
            recognizer.minimumNumberOfTouches = 1
            recognizer.maximumNumberOfTouches = 1
            recognizer.cancelsTouchesInView = false
            recognizer.delegate = self
            window.addGestureRecognizer(recognizer)
            hostWindow = window
            self.recognizer = recognizer
            sourceViewDidLayout()
        }

        func sourceViewDidLayout() {
            guard let sourceView, let hostWindow else { return }
            if let container = sourceView.superview {
                activeFrame = container.convert(container.bounds, to: hostWindow)
            } else {
                activeFrame = sourceView.convert(sourceView.bounds, to: hostWindow)
            }
        }

        func detach() {
            if let recognizer { hostWindow?.removeGestureRecognizer(recognizer) }
            recognizer = nil
            hostWindow = nil
            sourceView = nil
            activeFrame = .zero
            horizontalIntent = false
        }

        @objc private func handle(_ sender: UIPanGestureRecognizer) {
            guard isEnabled, let view = sender.view else { return }
            let translation = sender.translation(in: view)
            switch sender.state {
            case .began:
                horizontalIntent = false
            case .changed:
                if !horizontalIntent,
                   abs(translation.x) >= 18,
                   abs(translation.x) > abs(translation.y) * 1.35 {
                    horizontalIntent = true
                }
            case .ended:
                defer { horizontalIntent = false }
                guard horizontalIntent else { return }
                let velocity = sender.velocity(in: view)
                let distanceThreshold = max(132, min(activeFrame.width * 0.30, 190))
                guard abs(translation.x) >= distanceThreshold,
                      abs(translation.x) > abs(translation.y) * 1.35,
                      abs(velocity.x) > abs(velocity.y) else { return }
                onSwipe(translation.x < 0 ? .left : .right)
            case .cancelled, .failed:
                horizontalIntent = false
            default:
                break
            }
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            guard isEnabled, let hostWindow else { return false }
            let point = touch.location(in: hostWindow)
            guard activeFrame.contains(point) else { return false }
            var view: UIView? = touch.view
            while let current = view {
                if current is UIControl || current is UITextField || current is UITextView { return false }
                view = current.superview
            }
            return true
        }

        func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
            guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
            let velocity = pan.velocity(in: pan.view)
            return abs(velocity.x) > abs(velocity.y) * 1.15
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
