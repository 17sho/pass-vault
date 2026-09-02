import SwiftUI

/// Product-owned horizontal swipe action used instead of platform List swipe actions.
struct PVSwipeDeleteRow<Content: View>: View {
    let deleteTitle: String
    let accessibilityID: String
    let resetRequest: Int
    let expansionKey: String
    @Binding private var expandedKey: String?
    let onDelete: () -> Void
    @ViewBuilder let content: Content

    @State private var restingOffset: CGFloat = 0
    @State private var liveOffset: CGFloat = 0
    @State private var horizontalDrag = false
    private let actionWidth: CGFloat = 88

    init(deleteTitle: String, accessibilityID: String, resetRequest: Int = 0, expansionKey: String? = nil, expandedKey: Binding<String?> = .constant(nil), onDelete: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.deleteTitle = deleteTitle
        self.accessibilityID = accessibilityID
        self.resetRequest = resetRequest
        self.expansionKey = expansionKey ?? accessibilityID
        self._expandedKey = expandedKey
        self.onDelete = onDelete
        self.content = content()
    }

    var body: some View {
        ZStack(alignment: .trailing) {
            Button(role: .destructive) {
                withAnimation(.easeOut(duration: 0.16)) {
                    restingOffset = 0
                    liveOffset = 0
                }
                expandedKey = nil
                onDelete()
            } label: {
                Label(deleteTitle, systemImage: "trash")
                    .labelStyle(.titleAndIcon)
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                    .frame(width: actionWidth)
                    .frame(maxHeight: .infinity)
                    .frame(minHeight: 66)
                    .background(PVTheme.danger)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier(accessibilityID)
            .opacity(actionRevealProgress)
            .allowsHitTesting(restingOffset != 0)
            .zIndex(1)

            content
                .offset(x: liveOffset)
                .contentShape(Rectangle())
                .overlay {
                    if restingOffset != 0 {
                        Color.black.opacity(0.001)
                            .contentShape(Rectangle())
                            .onTapGesture {
                                withAnimation(.easeOut(duration: 0.16)) {
                                    restingOffset = 0
                                    liveOffset = 0
                                }
                                expandedKey = nil
                            }
                    }
                }
                .highPriorityGesture(
                    DragGesture(minimumDistance: 8)
                        .onChanged { value in
                            guard horizontalDrag || abs(value.translation.width) > abs(value.translation.height) else { return }
                            horizontalDrag = true
                            liveOffset = clamp(restingOffset + value.translation.width)
                        }
                        .onEnded { value in
                            guard horizontalDrag || abs(value.translation.width) > abs(value.translation.height) else {
                                horizontalDrag = false
                                return
                            }
                            let velocityRemainder = value.predictedEndTranslation.width - value.translation.width
                            let projected = liveOffset + velocityRemainder * 0.24
                            let shouldExpand = projected < -actionWidth * 0.42
                            let target = shouldExpand ? -actionWidth : 0
                            expandedKey = shouldExpand ? expansionKey : nil
                            withAnimation(.interactiveSpring(response: 0.24, dampingFraction: 0.88)) {
                                restingOffset = target
                                liveOffset = target
                            }
                            horizontalDrag = false
                        }
                )
        }
        .clipShape(RoundedRectangle(cornerRadius: PVTheme.cornerRadius))
        .onChange(of: resetRequest) { _, _ in
            withAnimation(.easeOut(duration: 0.16)) {
                restingOffset = 0
                liveOffset = 0
            }
            horizontalDrag = false
            expandedKey = nil
        }
        .onChange(of: expandedKey) { _, next in
            guard next != expansionKey, restingOffset != 0 else { return }
            withAnimation(.easeOut(duration: 0.16)) {
                restingOffset = 0
                liveOffset = 0
            }
            horizontalDrag = false
        }
    }

    private func clamp(_ offset: CGFloat) -> CGFloat {
        min(0, max(-actionWidth, offset))
    }

    private var actionRevealProgress: CGFloat {
        min(1, max(0, -liveOffset / actionWidth))
    }
}

struct PVAnchoredItemMenu: View {
    let favoriteTitle: String
    let pinTitle: String
    let editTitle: String
    let deleteTitle: String
    let favorite: () -> Void
    let pin: () -> Void
    let edit: () -> Void
    let delete: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            menuButton(favoriteTitle, icon: "star", action: favorite)
            menuButton(pinTitle, icon: "pin", action: pin)
            menuButton(editTitle, icon: "pencil", action: edit)
            menuButton(deleteTitle, icon: "trash", destructive: true, action: delete)
        }
        .frame(width: 178)
        .padding(.vertical, 5)
        .background(PVTheme.surface)
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(PVTheme.line))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .shadow(color: .black.opacity(0.18), radius: 16, y: 7)
        .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .topTrailing)))
        .accessibilityIdentifier("anchored-item-menu")
    }

    private func menuButton(_ title: String, icon: String, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .padding(.horizontal, 14)
                .foregroundStyle(destructive ? PVTheme.danger : PVTheme.ink)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct PVTagIdentityRow<Trailing: View>: View {
    let tag: TagDefinition
    let selected: Bool?
    @ViewBuilder let trailing: Trailing

    init(tag: TagDefinition, selected: Bool? = nil, @ViewBuilder trailing: () -> Trailing) {
        self.tag = tag
        self.selected = selected
        self.trailing = trailing()
    }

    var body: some View {
        HStack(spacing: 10) {
            if let selected {
                Image(systemName: selected ? "checkmark.square.fill" : "square")
                    .foregroundStyle(selected ? PVTheme.accent : PVTheme.muted)
            }
            Circle().fill(Color(hex: tag.colorHex)).frame(width: 14, height: 14)
            Text(tag.name)
            Spacer()
            trailing
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
        .contentShape(Rectangle())
    }
}
