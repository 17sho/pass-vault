import SwiftUI

private let vaultTagPalette = ["176B57", "2563EB", "7C3AED", "DC2626", "D97706", "DB2777", "4B5563"]

struct VaultGroupSelectionField: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvChoiceEmbedded) private var embedded
    @Environment(\.pvPresentChoiceOverlay) private var presentOverlay
    @Binding var selection: String
    let kind: VaultItemKind

    private var zh: Bool { languageStore.language == .simplifiedChinese }
    private var groups: [GroupDefinition] { model.vault.groupRegistry.groups(for: kind) }
    private var selectedTitle: String { groups.first(where: { $0.id.uuidString == selection })?.name ?? (zh ? "默认" : "Default") }

    var body: some View {
        Button(action: showSelector) {
            HStack(spacing: 8) { Image(systemName: "square.stack.3d.up"); Text(selectedTitle).lineLimit(1); Spacer(minLength: 4); Image(systemName: "chevron.down").font(.caption.bold()) }
                .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain).padding(.horizontal, embedded ? 0 : 12)
        .background(embedded ? Color.clear : PVTheme.surface)
        .overlay { if !embedded { RoundedRectangle(cornerRadius: 9).stroke(PVTheme.inputLine) } }
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }

    private func showSelector() {
        precondition(presentOverlay != nil, "VaultGroupSelectionField requires the root overlay host")
        guard let presentOverlay else { return }
        presentOverlay(AnyView(VaultGroupSelectorSurface(kind: kind, initialSelection: selection, close: { presentOverlay(nil) }, commit: { selection = $0 })))
    }
}

private struct VaultGroupSelectorSurface: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let kind: VaultItemKind
    let initialSelection: String
    let close: () -> Void
    let commit: (String) -> Void
    @State private var currentSelection: String
    @State private var newName = ""
    @State private var error = ""

    init(kind: VaultItemKind, initialSelection: String, close: @escaping () -> Void, commit: @escaping (String) -> Void) {
        self.kind = kind; self.initialSelection = initialSelection; self.close = close; self.commit = commit
        _currentSelection = State(initialValue: initialSelection)
    }
    private var zh: Bool { languageStore.language == .simplifiedChinese }
    private var groups: [GroupDefinition] { model.vault.groupRegistry.groups(for: kind) }

    var body: some View {
        PVWebModal(maxWidth: 520, sizing: .workspace, dismissOnBackdrop: true, onDismiss: close) {
            VStack(spacing: 0) {
                PVModalHeader(title: zh ? "选择分组" : "Select Group", cancelTitle: zh ? "取消" : "Cancel", onCancel: close)
                ScrollView { LazyVStack(spacing: 8) {
                    choice(id: "", name: zh ? "默认" : "Default")
                    ForEach(groups) { choice(id: $0.id.uuidString, name: $0.name) }
                }.padding(16) }.frame(maxHeight: .infinity).background(PVTheme.background)
                PVModalFooter { VStack(alignment: .leading, spacing: 10) {
                    PVField(title: zh ? "新建分组" : "New Group") { TextField(zh ? "分组名称" : "Group name", text: $newName) }
                    if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(PVTheme.danger) }
                    Button(zh ? "新建并选择" : "Create & Select", systemImage: "plus", action: create)
                        .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }.frame(maxWidth: .infinity) }
            }
        }
    }
    private func choice(id: String, name: String) -> some View {
        Button { currentSelection = id; commit(id); close() } label: {
            HStack { Image(systemName: currentSelection == id ? "checkmark.circle.fill" : "circle").foregroundStyle(currentSelection == id ? PVTheme.accent : PVTheme.muted); Text(name); Spacer() }.frame(minHeight: 44)
        }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
    }
    private func create() {
        let clean = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        if let existing = groups.first(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) { commit(existing.id.uuidString); close(); return }
        guard model.updateOrganization({ $0.groupRegistry.create(name: clean, kind: kind) }), let created = model.vault.groupRegistry.groups(for: kind).first(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) else { error = zh ? "保存失败，请重试" : "Save failed. Try again."; return }
        commit(created.id.uuidString); close()
    }
}

struct VaultTagSelectionField: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvChoiceEmbedded) private var embedded
    @Environment(\.pvPresentChoiceOverlay) private var presentOverlay
    @Binding var selection: Set<String>
    private var zh: Bool { languageStore.language == .simplifiedChinese }
    private var summary: String { selection.isEmpty ? (zh ? "未选择标签" : "No tags selected") : selection.sorted().joined(separator: "、") }

    var body: some View {
        Button(action: showSelector) {
            HStack(spacing: 8) { Image(systemName: "tag"); Text(summary).lineLimit(1); Spacer(minLength: 4); Image(systemName: "chevron.down").font(.caption.bold()) }
                .frame(maxWidth: .infinity, minHeight: 44).contentShape(Rectangle())
        }
        .buttonStyle(.plain).padding(.horizontal, embedded ? 0 : 12)
        .background(embedded ? Color.clear : PVTheme.surface)
        .overlay { if !embedded { RoundedRectangle(cornerRadius: 9).stroke(PVTheme.inputLine) } }
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }
    private func showSelector() {
        precondition(presentOverlay != nil, "VaultTagSelectionField requires the root overlay host")
        guard let presentOverlay else { return }
        presentOverlay(AnyView(VaultTagSelectorSurface(initialSelection: selection, close: { presentOverlay(nil) }, commit: { selection = $0 })))
    }
}

private struct VaultTagSelectorSurface: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let initialSelection: Set<String>
    let close: () -> Void
    let commit: (Set<String>) -> Void
    @State private var staged: Set<String>
    @State private var newName = ""
    @State private var newColor = vaultTagPalette[0]
    @State private var error = ""

    init(initialSelection: Set<String>, close: @escaping () -> Void, commit: @escaping (Set<String>) -> Void) {
        self.initialSelection = initialSelection; self.close = close; self.commit = commit
        _staged = State(initialValue: initialSelection)
    }
    private var zh: Bool { languageStore.language == .simplifiedChinese }
    private var tags: [TagDefinition] { model.vault.tagRegistry.tags }

    var body: some View {
        PVWebModal(maxWidth: 520, sizing: .workspace, dismissOnBackdrop: true, onDismiss: close) {
            VStack(spacing: 0) {
                PVModalHeader(title: zh ? "选择标签" : "Select Tags", cancelTitle: zh ? "取消" : "Cancel", onCancel: close)
                ScrollView { LazyVStack(spacing: 8) {
                    ForEach(tags) { tag in Button { toggle(tag.name) } label: {
                        HStack { Circle().fill(Color(hex: tag.colorHex)).frame(width: 12, height: 12); Text(tag.name); Spacer(); Image(systemName: staged.contains(tag.name) ? "checkmark.circle.fill" : "circle") }.frame(minHeight: 44)
                    }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)) }
                }.padding(16) }.frame(maxHeight: .infinity).background(PVTheme.background)
                PVModalFooter { VStack(alignment: .leading, spacing: 10) {
                    PVField(title: zh ? "新建标签" : "New Tag") { TextField(zh ? "标签名称" : "Tag name", text: $newName) }
                    VaultTagColorPalette(selection: $newColor)
                    if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(PVTheme.danger) }
                    Button(zh ? "新建并选中" : "Create & Select", systemImage: "plus", action: create)
                        .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)).disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    HStack(spacing: 10) {
                        Button(zh ? "清除" : "Clear") { staged.removeAll() }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                        Button(zh ? "应用" : "Apply") { commit(staged); close() }.buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
                    }
                }.frame(maxWidth: .infinity) }
            }
        }
    }
    private func toggle(_ name: String) { if !staged.insert(name).inserted { staged.remove(name) } }
    private func create() {
        guard let clean = TagPolicy.normalizedName(newName) else { error = zh ? "请输入有效的标签名称" : "Enter a valid tag name"; return }
        if let existing = tags.first(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) { staged.insert(existing.name); newName = ""; error = ""; return }
        guard model.updateOrganization({ $0.tagRegistry.create(name: clean, colorHex: newColor) }), let created = model.vault.tagRegistry.tags.first(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame }) else { error = zh ? "保存失败，请重试" : "Save failed. Try again."; return }
        staged.insert(created.name); newName = ""; error = ""
    }
}

struct VaultTagColorPalette: View {
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 2) { ForEach(vaultTagPalette, id: \.self) { color in
            Button { selection = color } label: {
                Circle().fill(Color(hex: color)).frame(width: 30, height: 30)
                    .overlay(Circle().stroke(selection == color ? PVTheme.ink : Color.clear, lineWidth: 2))
                    .frame(width: 44, height: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).accessibilityLabel("#\(color)").accessibilityAddTraits(selection == color ? .isSelected : [])
        } }
    }
}
