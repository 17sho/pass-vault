import SwiftUI
import UIKit

/// Recognizes deliberate horizontal swipes in the phone list pane while allowing
/// vertical scrolling and native row interactions to continue normally.
struct PVNativeCategorySwipeRecognizer: UIViewRepresentable {
    let isEnabled: Bool
    let onSwipe: (UISwipeGestureRecognizer.Direction) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onSwipe: onSwipe) }

    func makeUIView(context: Context) -> AttachmentView {
        let view = AttachmentView()
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        view.onSuperviewChange = { superview in context.coordinator.attach(to: superview) }
        return view
    }

    func updateUIView(_ uiView: AttachmentView, context: Context) {
        context.coordinator.onSwipe = onSwipe
        context.coordinator.recognizers.forEach { $0.isEnabled = isEnabled }
        if isEnabled { context.coordinator.attach(to: uiView.superview) }
    }

    static func dismantleUIView(_ uiView: AttachmentView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class AttachmentView: UIView {
        var onSuperviewChange: ((UIView?) -> Void)?
        override func didMoveToSuperview() {
            super.didMoveToSuperview()
            onSuperviewChange?(superview)
        }
    }

    @MainActor
    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onSwipe: (UISwipeGestureRecognizer.Direction) -> Void
        weak var hostView: UIView?
        var recognizers: [UISwipeGestureRecognizer] = []

        init(onSwipe: @escaping (UISwipeGestureRecognizer.Direction) -> Void) {
            self.onSwipe = onSwipe
        }

        func attach(to view: UIView?) {
            guard let view else { return }
            if hostView === view, !recognizers.isEmpty { return }
            detach()
            let directions: [UISwipeGestureRecognizer.Direction] = [.left, .right]
            recognizers = directions.map { direction in
                let recognizer = UISwipeGestureRecognizer(target: self, action: #selector(handle(_:)))
                recognizer.direction = direction
                recognizer.numberOfTouchesRequired = 1
                recognizer.cancelsTouchesInView = false
                recognizer.delegate = self
                view.addGestureRecognizer(recognizer)
                return recognizer
            }
            hostView = view
        }

        func detach() {
            recognizers.forEach { hostView?.removeGestureRecognizer($0) }
            recognizers.removeAll()
            hostView = nil
        }

        @objc private func handle(_ sender: UISwipeGestureRecognizer) {
            guard sender.state == .ended else { return }
            onSwipe(sender.direction)
        }

        func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
            var view: UIView? = touch.view
            while let current = view {
                if current is UIControl || current is UITextField || current is UITextView { return false }
                view = current.superview
            }
            return true
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            true
        }
    }
}
