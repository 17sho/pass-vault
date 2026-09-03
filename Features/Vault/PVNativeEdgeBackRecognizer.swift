import SwiftUI
import UIKit

/// Installs a native iOS leading-edge pan recognizer on the active window without
/// covering SwiftUI controls. The caller owns the interactive transition offset.
struct PVNativeEdgeBackRecognizer: UIViewRepresentable {
    let isEnabled: Bool
    let onProgress: (CGFloat) -> Void
    let onFinish: (Bool) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onProgress: onProgress, onFinish: onFinish)
    }

    func makeUIView(context: Context) -> AttachmentView {
        let view = AttachmentView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        view.onWindowChange = { window in context.coordinator.attach(to: window) }
        return view
    }

    func updateUIView(_ uiView: AttachmentView, context: Context) {
        context.coordinator.onProgress = onProgress
        context.coordinator.onFinish = onFinish
        context.coordinator.recognizer?.isEnabled = isEnabled
        if isEnabled { context.coordinator.attach(to: uiView.window) }
    }

    static func dismantleUIView(_ uiView: AttachmentView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class AttachmentView: UIView {
        var onWindowChange: ((UIWindow?) -> Void)?
        override func didMoveToWindow() {
            super.didMoveToWindow()
            onWindowChange?(window)
        }
    }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onProgress: (CGFloat) -> Void
        var onFinish: (Bool) -> Void
        weak var hostWindow: UIWindow?
        var recognizer: UIScreenEdgePanGestureRecognizer?

        init(onProgress: @escaping (CGFloat) -> Void, onFinish: @escaping (Bool) -> Void) {
            self.onProgress = onProgress
            self.onFinish = onFinish
        }

        func attach(to window: UIWindow?) {
            guard let window else { return }
            if hostWindow === window, recognizer != nil { return }
            detach()
            let recognizer = UIScreenEdgePanGestureRecognizer(target: self, action: #selector(handle(_:)))
            recognizer.edges = .left
            recognizer.maximumNumberOfTouches = 1
            recognizer.cancelsTouchesInView = true
            recognizer.delegate = self
            window.addGestureRecognizer(recognizer)
            hostWindow = window
            self.recognizer = recognizer
        }

        func detach() {
            if let recognizer { hostWindow?.removeGestureRecognizer(recognizer) }
            recognizer = nil
            hostWindow = nil
        }

        @objc private func handle(_ sender: UIScreenEdgePanGestureRecognizer) {
            guard let view = sender.view else { return }
            let width = max(view.bounds.width, 1)
            let translation = max(0, sender.translation(in: view).x)
            let progress = min(1, translation / width)
            switch sender.state {
            case .began, .changed:
                onProgress(progress)
            case .ended:
                let velocity = sender.velocity(in: view).x
                onFinish(progress >= 0.32 || velocity >= 650)
            case .cancelled, .failed:
                onFinish(false)
            default:
                break
            }
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
