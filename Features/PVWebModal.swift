import SwiftUI

enum PVModalSizing: Equatable, Sendable {
    case fit
    case capped
    case workspace
}

/// Mirrors the web dialog algorithm: ask content for its unconstrained
/// vertical size, cap the card to the safe viewport, then center it.
struct PVIntrinsicModalLayout: Layout {
    let width: CGFloat
    let heightCap: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let subview = subviews.first else { return .zero }
        let natural = subview.dimensions(in: ProposedViewSize(width: width, height: nil))
        return CGSize(width: width, height: min(natural.height, heightCap))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let subview = subviews.first else { return }
        subview.place(
            at: CGPoint(x: bounds.minX, y: bounds.minY),
            anchor: .topLeading,
            proposal: ProposedViewSize(width: bounds.width, height: bounds.height)
        )
    }
}

private struct PVModalDismissKey: EnvironmentKey {
    nonisolated(unsafe) static let defaultValue: () -> Void = {}
}

private struct PVModalBackKey: EnvironmentKey {
    nonisolated(unsafe) static let defaultValue: (() -> Void)? = nil
}

private struct PVChoiceEmbeddedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var pvModalDismiss: () -> Void {
        get { self[PVModalDismissKey.self] }
        set { self[PVModalDismissKey.self] = newValue }
    }

    var pvModalBack: (() -> Void)? {
        get { self[PVModalBackKey.self] }
        set { self[PVModalBackKey.self] = newValue }
    }

    var pvChoiceEmbedded: Bool {
        get { self[PVChoiceEmbeddedKey.self] }
        set { self[PVChoiceEmbeddedKey.self] = newValue }
    }
}

/// Product-owned modal surface that keeps the current page visible behind a dimmed backdrop.
struct PVWebModal<Content: View>: View {
    let maxWidth: CGFloat
    let requestedVerticalInset: CGFloat?
    let sizing: PVModalSizing
    let dismissOnBackdrop: Bool
    let onDismiss: () -> Void
    @ViewBuilder let content: Content

    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    init(
        maxWidth: CGFloat = 720,
        verticalInset: CGFloat? = nil,
        sizing: PVModalSizing = .workspace,
        dismissOnBackdrop: Bool = true,
        onDismiss: @escaping () -> Void,
        @ViewBuilder content: () -> Content
    ) {
        self.maxWidth = maxWidth
        self.requestedVerticalInset = verticalInset
        self.sizing = sizing
        self.dismissOnBackdrop = dismissOnBackdrop
        self.onDismiss = onDismiss
        self.content = content()
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                Color.black.opacity(appeared ? 0.34 : 0)
                    .ignoresSafeArea()
                    .contentShape(Rectangle())
                    .onTapGesture { if dismissOnBackdrop { onDismiss() } }
                    .accessibilityIdentifier("modal-backdrop")

                modalBody(
                    maxWidth: min(maxWidth, proxy.size.width - horizontalInset * 2),
                    maxHeight: max(1, proxy.size.height - resolvedVerticalInset * 2)
                )
                    .background(PVTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(PVTheme.line))
                    .shadow(color: .black.opacity(0.22), radius: 28, y: 12)
                    .accessibilityAddTraits(.isModal)
                    .overlay(alignment: .topLeading) {
                        Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("modal-card")
                    }
                    .opacity(appeared ? 1 : 0)
                    .scaleEffect(appeared || reduceMotion ? 1 : 0.98)
                    .padding(.vertical, resolvedVerticalInset)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .zIndex(10_000)
        .onAppear {
            withAnimation(.easeOut(duration: reduceMotion ? 0.08 : 0.18)) { appeared = true }
        }
    }

    private var horizontalInset: CGFloat { horizontalSizeClass == .compact ? 16 : 32 }
    private var resolvedVerticalInset: CGFloat { requestedVerticalInset ?? (horizontalSizeClass == .compact ? 12 : 28) }

    @ViewBuilder
    private func modalBody(maxWidth: CGFloat, maxHeight: CGFloat) -> some View {
        switch sizing {
        case .fit:
            PVIntrinsicModalLayout(width: maxWidth, heightCap: maxHeight) {
                content.frame(width: maxWidth)
            }
        case .capped:
            PVIntrinsicModalLayout(width: maxWidth, heightCap: min(maxHeight, horizontalSizeClass == .compact ? 680 : 720)) {
                content.frame(width: maxWidth)
            }
        case .workspace:
            content
                .frame(width: maxWidth, height: min(maxHeight, 680), alignment: .top)
                .clipped()
        }
    }
}

private struct PVWebModalModifier<ModalContent: View>: ViewModifier {
    @Binding var isPresented: Bool
    let maxWidth: CGFloat
    let verticalInset: CGFloat?
    let sizing: PVModalSizing
    let dismissOnBackdrop: Bool
    let onDismiss: () -> Void
    let modalContent: () -> ModalContent
    @Environment(\.pvPresentChoiceOverlay) private var presentInHost

    @ViewBuilder
    func body(content: Content) -> some View {
        content
            .onAppear { if isPresented { present() } }
            .onChange(of: isPresented) { wasPresented, presented in
                if presented { present() }
                else {
                    presentInHost?(nil)
                    if wasPresented { presentationEnded() }
                }
            }
    }

    private func present() {
        precondition(presentInHost != nil, "PVWebModal requires the root overlay host")
        if let presentInHost { showInHost(presentInHost) }
    }

    private func showInHost(_ present: @escaping (AnyView?) -> Void) {
        let dismiss = {
            isPresented = false
        }
        present(AnyView(PVWebModal(maxWidth: maxWidth, verticalInset: verticalInset, sizing: sizing, dismissOnBackdrop: dismissOnBackdrop, onDismiss: dismiss) {
            modalContent().environment(\.pvModalDismiss, dismiss)
        }))
    }

    private func presentationEnded() {
        onDismiss()
    }
}

private struct PVWebModalItemModifier<Item, ModalContent: View>: ViewModifier {
    @Binding var item: Item?
    let maxWidth: CGFloat
    let verticalInset: CGFloat?
    let sizing: PVModalSizing
    let dismissOnBackdrop: Bool
    let onDismiss: () -> Void
    let modalContent: (Item) -> ModalContent
    @Environment(\.pvPresentChoiceOverlay) private var presentInHost

    private var isPresented: Binding<Bool> {
        Binding(
            get: { item != nil },
            set: { if !$0 { item = nil } }
        )
    }

    @ViewBuilder
    func body(content: Content) -> some View {
        content
            .onAppear { if let item { present(item) } }
            .onChange(of: item != nil) { wasPresented, presented in
                if presented, let item { present(item) }
                else {
                    presentInHost?(nil)
                    if wasPresented { onDismiss() }
                }
            }
    }

    private func present(_ item: Item) {
        precondition(presentInHost != nil, "PVWebModal requires the root overlay host")
        if let presentInHost { showInHost(item, present: presentInHost) }
    }

    private func showInHost(_ presentedItem: Item, present: @escaping (AnyView?) -> Void) {
        let dismiss = {
            item = nil
        }
        present(AnyView(PVWebModal(maxWidth: maxWidth, verticalInset: verticalInset, sizing: sizing, dismissOnBackdrop: dismissOnBackdrop, onDismiss: dismiss) {
            modalContent(presentedItem).environment(\.pvModalDismiss, dismiss)
        }))
    }
}

struct PVConfirmModal: View {
    let title: String
    var message: String? = nil
    let confirmTitle: String
    let cancelTitle: String
    var destructive = false
    var showsHeaderCancel = false
    let confirm: () -> Void
    let cancel: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: title, cancelTitle: cancelTitle, showsCancel: showsHeaderCancel, onCancel: cancel)
            if let message {
                Text(message)
                    .font(.body)
                    .foregroundStyle(PVTheme.muted)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(20)
                    .accessibilityIdentifier("confirm-modal-message")
            }
            PVModalFooter {
                Button(cancelTitle, action: cancel)
                    .accessibilityIdentifier("confirm-modal-cancel")
                    .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                Button(confirmTitle, action: confirm)
                    .accessibilityIdentifier("confirm-modal-confirm")
                    .buttonStyle(PVButtonStyle(role: destructive ? .destructive : .primary, fillsWidth: true))
            }
        }
    }
}

struct PVChoiceOption<Value: Hashable>: Identifiable {
    let value: Value
    let title: String
    let subtitle: String?
    var id: Value { value }

    init(_ value: Value, _ title: String, subtitle: String? = nil) {
        self.value = value; self.title = title; self.subtitle = subtitle
    }
}

private struct PVChoicePresentation<Value: Hashable>: Identifiable {
    let id = UUID()
    let title: String
    let selection: Value
    let options: [PVChoiceOption<Value>]
}

private struct PVChoiceOverlayKey: EnvironmentKey {
    nonisolated(unsafe) static let defaultValue: ((AnyView?) -> Void)? = nil
}

extension EnvironmentValues {
    var pvPresentChoiceOverlay: ((AnyView?) -> Void)? {
        get { self[PVChoiceOverlayKey.self] }
        set { self[PVChoiceOverlayKey.self] = newValue }
    }
}

struct PVChoiceOverlayContainer<Content: View>: View {
    @ViewBuilder let content: () -> Content
    @State private var overlay: AnyView?

    var body: some View {
        ZStack {
            content()
            if let overlay {
                overlay
                    .zIndex(1000)
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
            }
        }
        .environment(\.pvPresentChoiceOverlay, { overlay = $0 })
        .animation(.easeOut(duration: 0.14), value: overlay != nil)
    }
}

struct PVChoiceField<Value: Hashable>: View {
    let title: String
    let icon: String
    @Binding var selection: Value
    let options: [PVChoiceOption<Value>]
    var selectionAnimation: Animation? = nil
    var onSelect: (() -> Void)?
    @Environment(\.pvChoiceEmbedded) private var embedded
    @Environment(\.pvPresentChoiceOverlay) private var presentOverlay

    private var currentTitle: String { options.first(where: { $0.value == selection })?.title ?? title }

    var body: some View {
        Button(action: showChoices) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                Text(currentTitle).lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down").font(.caption.bold())
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.horizontal, embedded ? 0 : 12)
        .background(embedded ? Color.clear : PVTheme.surface)
        .overlay {
            if !embedded { RoundedRectangle(cornerRadius: 9).stroke(PVTheme.inputLine) }
        }
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }

    private func showChoices() {
        precondition(presentOverlay != nil, "PVChoiceField requires the root overlay host")
        if let presentOverlay {
            presentOverlay(AnyView(choiceSurface(close: { presentOverlay(nil) })))
        }
    }

    private func choiceSurface(close: @escaping () -> Void) -> some View {
        PVWebModal(maxWidth: 520, sizing: .fit, dismissOnBackdrop: true, onDismiss: close) {
            VStack(spacing: 0) {
                PVModalHeader(title: title, cancelTitle: "取消", onCancel: close)
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(options) { option in
                            Button {
                                var transaction = Transaction()
                                transaction.disablesAnimations = true
                                withTransaction(transaction) { close() }
                                Task { @MainActor in
                                    await Task.yield()
                                    if let selectionAnimation {
                                        withAnimation(selectionAnimation) { selection = option.value }
                                    } else {
                                        selection = option.value
                                    }
                                    onSelect?()
                                }
                            } label: {
                                HStack(spacing: 10) {
                                    Image(systemName: selection == option.value ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selection == option.value ? PVTheme.accent : PVTheme.muted)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(option.title)
                                        if let subtitle = option.subtitle { Text(subtitle).font(.caption).foregroundStyle(PVTheme.muted) }
                                    }
                                    Spacer()
                                }.frame(minHeight: 44)
                            }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                        }
                    }.padding(16)
                }
            }
        }
    }
}

extension View {
    func pvWebModal<Item, ModalContent: View>(
        item: Binding<Item?>,
        maxWidth: CGFloat = 720,
        verticalInset: CGFloat? = nil,
        sizing: PVModalSizing = .workspace,
        dismissOnBackdrop: Bool = true,
        onDismiss: @escaping () -> Void = {},
        @ViewBuilder content: @escaping (Item) -> ModalContent
    ) -> some View {
        modifier(PVWebModalItemModifier(item: item, maxWidth: maxWidth, verticalInset: verticalInset, sizing: sizing, dismissOnBackdrop: dismissOnBackdrop, onDismiss: onDismiss, modalContent: content))
    }

    func pvWebModal<ModalContent: View>(
        isPresented: Binding<Bool>,
        maxWidth: CGFloat = 720,
        verticalInset: CGFloat? = nil,
        sizing: PVModalSizing = .workspace,
        dismissOnBackdrop: Bool = true,
        onDismiss: @escaping () -> Void = {},
        @ViewBuilder content: @escaping () -> ModalContent
    ) -> some View {
        modifier(PVWebModalModifier(
            isPresented: isPresented,
            maxWidth: maxWidth,
            verticalInset: verticalInset,
            sizing: sizing,
            dismissOnBackdrop: dismissOnBackdrop,
            onDismiss: onDismiss,
            modalContent: content
        ))
    }
}
