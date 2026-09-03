import SwiftUI
import UIKit

/// Owns the row's physical touch surface so nested SwiftUI Button, ScrollView,
/// and swipe gestures cannot starve long-press recognition on real devices.
struct PVNativeLongPressRecognizer: UIViewRepresentable {
    let minimumDuration: TimeInterval
    let allowableMovement: CGFloat
    let onTap: () -> Void
    let onRecognized: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap, onRecognized: onRecognized)
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = true

        let longPress = UILongPressGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleLongPress(_:))
        )
        longPress.minimumPressDuration = minimumDuration
        longPress.allowableMovement = allowableMovement
        longPress.cancelsTouchesInView = true
        longPress.delegate = context.coordinator

        let tap = UITapGestureRecognizer(
            target: context.coordinator,
            action: #selector(Coordinator.handleTap(_:))
        )
        tap.cancelsTouchesInView = true
        tap.require(toFail: longPress)
        tap.delegate = context.coordinator

        view.addGestureRecognizer(longPress)
        view.addGestureRecognizer(tap)
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        context.coordinator.onTap = onTap
        context.coordinator.onRecognized = onRecognized
        if let recognizer = uiView.gestureRecognizers?.compactMap({ $0 as? UILongPressGestureRecognizer }).first {
            recognizer.minimumPressDuration = minimumDuration
            recognizer.allowableMovement = allowableMovement
        }
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var onTap: () -> Void
        var onRecognized: () -> Void

        init(onTap: @escaping () -> Void, onRecognized: @escaping () -> Void) {
            self.onTap = onTap
            self.onRecognized = onRecognized
        }

        @objc func handleTap(_ sender: UITapGestureRecognizer) {
            guard sender.state == .ended else { return }
            onTap()
        }

        @objc func handleLongPress(_ sender: UILongPressGestureRecognizer) {
            guard sender.state == .began else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            onRecognized()
        }

        func gestureRecognizer(
            _ gestureRecognizer: UIGestureRecognizer,
            shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer
        ) -> Bool {
            otherGestureRecognizer.view !== gestureRecognizer.view
        }
    }
}
