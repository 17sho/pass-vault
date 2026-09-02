import SwiftUI

enum MoreMenuLocalCopy {
    static func text(_ zh: String, _ en: String, language: AppLanguage) -> String {
        language == .simplifiedChinese ? zh : en
    }

    static func title(_ destination: MoreMenuDestination, language: AppLanguage) -> String {
        switch destination {
        case .globalSearch: text("全站搜索", "Global Search", language: language)
        case .customRecords: text("自定义资料", "Custom Records", language: language)
        case .tags: text("标签管理", "Manage Tags", language: language)
        case .recoveryCenter: text("恢复中心", "Recovery Center", language: language)
        case .settings: text("设置", "Settings", language: language)
        case .localShareManagement: text("分享管理", "Share Management", language: language)
        case .securityCenter: text("安全中心", "Security Center", language: language)
        case .privacy: text("隐私模式", "Privacy Mode", language: language)
        case .theme: text("主题", "Theme", language: language)
        case .groupOrder: text("分组排序", "Group Order", language: language)
        case .pinOrder: text("置顶排序", "Pinned Order", language: language)
        case .bulkGroup: text("批量设置分组", "Set Groups in Bulk", language: language)
        case .exportBackup: text("导出加密备份", "Export Encrypted Backup", language: language)
        case .importBackup: text("导入加密备份", "Import Encrypted Backup", language: language)
        case .changePassword: text("修改密码", "Change Password", language: language)
        case .lock: text("退出并锁定", "Exit and Lock", language: language)
        case .onlineShareManagement: text("在线分享管理", "Online Share Management", language: language)
        case .remoteSessions: text("远程会话", "Remote Sessions", language: language)
        case .changeCloudUsername: text("修改云端用户名", "Change Cloud Username", language: language)
        }
    }

    static func icon(_ destination: MoreMenuDestination) -> String {
        switch destination {
        case .globalSearch: "magnifyingglass"
        case .customRecords: "rectangle.and.pencil.and.ellipsis"
        case .tags: "tag"
        case .recoveryCenter: "arrow.uturn.backward.circle"
        case .settings: "gearshape"
        case .localShareManagement: "lock.doc"
        case .securityCenter: "lock.shield"
        case .privacy: "eye.slash"
        case .theme: "circle.lefthalf.filled"
        case .groupOrder: "square.stack.3d.up"
        case .pinOrder: "pin"
        case .bulkGroup: "checklist"
        case .exportBackup: "square.and.arrow.up"
        case .importBackup: "square.and.arrow.down"
        case .changePassword: "key"
        case .lock: "lock"
        default: "network.slash"
        }
    }
}

struct MoreMenuLocalDestinationView: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    let destination: MoreMenuDestination
    @Binding var selectedItem: VaultItem?
    let onOpenItem: (VaultItem) -> Void

    @ViewBuilder var body: some View {
        Group {
            switch destination {
            case .globalSearch: GlobalVaultSearchView(selectedItem: $selectedItem, onOpenItem: onOpenItem)
            case .tags: TagManagementView()
            case .settings, .securityCenter: LocalSecurityCenterView()
            case .privacy: LocalMenuPlaceholderView(title: MoreMenuLocalCopy.title(.privacy, language: languageStore.language))
            case .theme: LocalThemeView()
            case .groupOrder: GroupOrderReferenceView()
            case .pinOrder: PinOrderReferenceView()
            case .bulkGroup: BulkGroupManagementView()
            default:
                LocalMenuPlaceholderView(title: MoreMenuLocalCopy.title(destination, language: languageStore.language))
            }
        }
        .overlay(alignment: .topLeading) {
            Color.clear.frame(width: 1, height: 1)
                .accessibilityIdentifier("more-destination-\(destination.rawValue)")
        }
    }
}

private struct LocalModalShell<Content: View>: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvModalDismiss) private var dismiss
    let title: String
    @ViewBuilder let content: Content

    init(title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: title, cancelTitle: MoreMenuLocalCopy.text("关闭", "Close", language: languageStore.language)) { dismiss() }
            content
        }
        .foregroundStyle(PVTheme.ink)
        .tint(PVTheme.accent)
        .background(PVTheme.background)
        .overlay(alignment: .topLeading) {
            Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("more-destination-\(title)")
        }
    }
}

private struct GlobalVaultSearchView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @Binding var selectedItem: VaultItem?
    let onOpenItem: (VaultItem) -> Void
    @State private var query = ""

    private var results: [VaultItem] {
        VaultListPolicy.items(in: model.vault, query: query, filter: .all)
    }
    private var privacy: VaultPrivacyPresentation { VaultPrivacyPresentation(level: preferences.privacyLevel) }

    var body: some View {
            LocalModalShell(title: MoreMenuLocalCopy.title(.globalSearch, language: languageStore.language)) {
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(PVTheme.muted)
                    TextField(MoreMenuLocalCopy.text("搜索账号、网站、笔记和附件", "Search accounts, websites, notes, and attachments", language: languageStore.language), text: $query)
                        .textInputAutocapitalization(.never)
                    if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill") } }
                }
                .padding(12).background(PVTheme.surfaceSoft)
                if query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    localEmpty(MoreMenuLocalCopy.text("输入关键词开始搜索", "Enter a keyword to search", language: languageStore.language), icon: "magnifyingglass")
                } else if results.isEmpty {
                    localEmpty(MoreMenuLocalCopy.text("没有匹配的资料", "No matching records", language: languageStore.language), icon: "magnifyingglass")
                } else {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(results) { item in
                                Button {
                                    let opened = model.markOpened(item)
                                    selectedItem = opened
                                    onOpenItem(opened)
                                } label: {
                                    HStack(spacing: 12) {
                                        Image(systemName: MoreMenuLocalCopy.icon(.globalSearch)).frame(width: 36, height: 36).background(PVTheme.selected).clipShape(RoundedRectangle(cornerRadius: 9))
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(privacy.hidesTitle ? MoreMenuLocalCopy.text("资料", "Record", language: languageStore.language) : (item.title.isEmpty ? MoreMenuLocalCopy.text("未命名", "Untitled", language: languageStore.language) : item.title)).font(.body.weight(.semibold))
                                            Text(privacy.hidesSearchMetadata ? "••••••" : L10n.kind(item.kind, language: languageStore.language)).font(.caption).foregroundStyle(PVTheme.muted)
                                        }
                                        Spacer()
                                    }.padding(12).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12))
                                }.buttonStyle(.plain)
                                    .accessibilityElement(children: .ignore)
                                    .accessibilityLabel(privacy.level == .off ? (item.title.isEmpty ? MoreMenuLocalCopy.text("未命名", "Untitled", language: languageStore.language) : item.title) : MoreMenuLocalCopy.text("资料", "Record", language: languageStore.language))
                                    .accessibilityValue(privacy.level == .off ? L10n.kind(item.kind, language: languageStore.language) : "")
                            }
                        }.padding(12)
                    }.background(PVTheme.background)
                }
            }
        }
    }
}

private struct TagManagementView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvPresentChoiceOverlay) private var presentOverlay
    @State private var selectedTag: TagDefinition?
    @State private var pendingDeleteTag: TagDefinition?
    @State private var confirmingDelete = false

    private var tags: [TagDefinition] { model.vault.tagRegistry.tags }

    var body: some View {
        LocalModalShell(title: MoreMenuLocalCopy.title(.tags, language: languageStore.language)) {
            VStack(spacing: 0) {
                HStack {
                    Text(MoreMenuLocalCopy.text("标签会保存在加密资料库中", "Tags are stored in the encrypted vault", language: languageStore.language)).font(.footnote).foregroundStyle(PVTheme.muted)
                    Spacer()
                    Button { openEditor(nil) } label: { Label(MoreMenuLocalCopy.text("新建", "New", language: languageStore.language), systemImage: "plus") }.buttonStyle(PVButtonStyle(role: .primary))
                }.padding(12).background(PVTheme.surfaceSoft)
                ScrollView { LazyVStack(spacing: 8) {
                    if tags.isEmpty { localEmpty(MoreMenuLocalCopy.text("还没有标签", "No tags yet", language: languageStore.language), icon: "tag") }
                    ForEach(Array(tags.enumerated()), id: \.element.id) { index, tag in
                        PVSwipeDeleteRow(
                            deleteTitle: MoreMenuLocalCopy.text("删除", "Delete", language: languageStore.language),
                            accessibilityID: "swipe-delete-tag-\(tag.id)",
                            onDelete: { pendingDeleteTag = tag; confirmingDelete = true }
                        ) {
                            HStack(spacing: 10) {
                                Button { openEditor(tag) } label: {
                                    PVTagIdentityRow(tag: tag) {
                                        Text("\(usageCount(tag.name))").foregroundStyle(PVTheme.muted)
                                    }
                                }.buttonStyle(.plain)
                                orderButtons(upDisabled: index == 0, downDisabled: index == tags.count - 1) { move(tag.name, -1) } down: { move(tag.name, 1) }
                            }.padding(12).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12))
                        }
                    }
                }.padding(16) }.background(PVTheme.background)
            }
        }
        .pvWebModal(isPresented: $confirmingDelete, maxWidth: 420, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(
                title: MoreMenuLocalCopy.text("删除标签？", "Delete Tag?", language: languageStore.language),
                message: tagDeleteConfirmationMessage,
                confirmTitle: MoreMenuLocalCopy.text("删除标签", "Delete Tag", language: languageStore.language),
                cancelTitle: MoreMenuLocalCopy.text("取消", "Cancel", language: languageStore.language),
                destructive: true,
                confirm: deleteTag,
                cancel: { confirmingDelete = false; pendingDeleteTag = nil }
            )
        }
    }


    private var tagDeleteConfirmationMessage: String {
        guard let tag = pendingDeleteTag ?? selectedTag else {
            return MoreMenuLocalCopy.text("此标签会从标签列表中删除。资料本身不会删除。", "This tag will be removed. Your items will not be deleted.", language: languageStore.language)
        }
        let count = usageCount(tag.name)
        return MoreMenuLocalCopy.text("标签“\(tag.name)”会从 \(count) 项资料中移除，资料本身不会删除。", "The tag “\(tag.name)” will be removed from \(count) item(s). The items themselves will not be deleted.", language: languageStore.language)
    }

    private func usageCount(_ name: String) -> Int { model.vault.items.filter { !$0.isDeleted && $0.tags.contains(where: { $0.localizedCaseInsensitiveCompare(name) == .orderedSame }) }.count }
    private func openEditor(_ tag: TagDefinition?) {
        precondition(presentOverlay != nil, "TagManagementView requires the root overlay host")
        pendingDeleteTag = nil; selectedTag = tag
        guard let presentOverlay else { return }
        presentOverlay(AnyView(TagManagementEditorSurface(tag: tag, close: { presentOverlay(nil) })))
    }
    private func deleteTag() {
        guard let tag = pendingDeleteTag ?? selectedTag else { return }
        let succeeded = model.updateOrganization { vault in vault.items = vault.tagRegistry.delete(name: tag.name, items: vault.items) }
        if succeeded { confirmingDelete = false; pendingDeleteTag = nil; if selectedTag?.id == tag.id { presentOverlay?(nil); selectedTag = nil } }
    }
    private func move(_ name: String, _ offset: Int) { _ = model.updateOrganization { _ = $0.tagRegistry.move(name: name, by: offset) } }
}

private struct TagManagementEditorSurface: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let tag: TagDefinition?
    let close: () -> Void
    @State private var editedName: String
    @State private var editedColor: String
    @State private var error = ""

    init(tag: TagDefinition?, close: @escaping () -> Void) {
        self.tag = tag; self.close = close
        _editedName = State(initialValue: tag?.name ?? "")
        _editedColor = State(initialValue: tag?.colorHex ?? "176B57")
    }
    private var cleanName: String { editedName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var zh: Bool { languageStore.language == .simplifiedChinese }

    var body: some View {
        PVWebModal(maxWidth: 480, sizing: .fit, dismissOnBackdrop: true, onDismiss: close) {
            VStack(spacing: 0) {
                PVModalHeader(title: tag == nil ? (zh ? "新建标签" : "New Tag") : (zh ? "编辑或合并标签" : "Edit or Merge Tag"), cancelTitle: zh ? "取消" : "Cancel", onCancel: close)
                VStack(alignment: .leading, spacing: 14) {
                    TextField(zh ? "标签名称" : "Tag name", text: $editedName).textFieldStyle(.roundedBorder)
                    Text(zh ? "颜色" : "Color").font(.subheadline.weight(.semibold))
                    VaultTagColorPalette(selection: $editedColor)
                    if !error.isEmpty { Text(error).font(.footnote).foregroundStyle(PVTheme.danger) }
                    if tag != nil { Text(zh ? "改成已有标签名称会自动合并。" : "Using an existing name merges the tags.").font(.footnote).foregroundStyle(PVTheme.muted) }
                }.padding(16)
                PVModalFooter {
                    Button(zh ? "取消" : "Cancel", action: close).buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                    Button(zh ? "保存" : "Save", action: save).buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(cleanName.isEmpty)
                }
            }
        }
    }
    private func save() {
        guard let normalized = TagPolicy.normalizedName(cleanName) else { error = zh ? "请输入有效的标签名称" : "Enter a valid tag name"; return }
        if tag == nil, model.vault.tagRegistry.tags.contains(where: { $0.name.localizedCaseInsensitiveCompare(normalized) == .orderedSame }) { error = zh ? "标签名称已存在" : "Tag name already exists"; return }
        let succeeded = model.updateOrganization { vault in
            if let tag { vault.items = vault.tagRegistry.rename(oldName: tag.name, to: normalized, colorHex: editedColor, items: vault.items) }
            else { vault.tagRegistry.create(name: normalized, colorHex: editedColor) }
        }
        if succeeded { close() } else { error = zh ? "保存失败，请重试" : "Save failed. Try again." }
    }
}

private struct LocalSecurityCenterView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @EnvironmentObject private var languageStore: AppLanguageStore

    var body: some View {
        LocalModalShell(title: MoreMenuLocalCopy.title(.securityCenter, language: languageStore.language)) {
            VStack(alignment: .leading, spacing: 16) {
                    Text(MoreMenuLocalCopy.text("本机保护", "On-device protection", language: languageStore.language)).font(.headline)
                    choiceCard(MoreMenuLocalCopy.text("自动锁定时间", "Auto-lock", language: languageStore.language)) {
                        PVChoiceField(title: MoreMenuLocalCopy.text("自动锁定时间", "Auto-lock", language: languageStore.language), icon: "timer", selection: $preferences.autoLockChoice, options: AutoLockChoice.allCases.map { PVChoiceOption($0, autoLockLabel($0)) }, onSelect: { model.recordActivity() })
                    }
                    choiceCard(MoreMenuLocalCopy.text("剪贴板自动清除", "Clear clipboard", language: languageStore.language)) {
                        PVChoiceField(title: MoreMenuLocalCopy.text("剪贴板自动清除", "Clear clipboard", language: languageStore.language), icon: "doc.on.clipboard", selection: $preferences.clipboardClearChoice, options: ClipboardClearChoice.allCases.map { PVChoiceOption($0, clipboardLabel($0)) })
                    }
                    Toggle(MoreMenuLocalCopy.text("面容 ID / 设备所有者快速解锁", "Face ID / device-owner quick unlock", language: languageStore.language), isOn: Binding(get: { model.quickUnlockEnabled }, set: { model.setQuickUnlock(enabled: $0) })).tint(PVTheme.accent).padding(14).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12))
                    Text(MoreMenuLocalCopy.text("登录设备与远程注销需要联网，因此未显示在本地安全中心。", "Signed-in devices and remote sign-out require networking and are not shown in the local security center.", language: languageStore.language)).font(.footnote).foregroundStyle(PVTheme.muted)
                }.padding(16).background(PVTheme.background)
        }
    }

    private func choiceCard<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View { HStack { Text(title).font(.subheadline.weight(.semibold)); Spacer(); content() }.padding(14).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12)) }
    private func autoLockLabel(_ value: AutoLockChoice) -> String { switch value { case .oneMinute: minute(1); case .fiveMinutes: minute(5); case .fifteenMinutes: minute(15); case .thirtyMinutes: minute(30); case .never: MoreMenuLocalCopy.text("永不", "Never", language: languageStore.language) } }
    private func clipboardLabel(_ value: ClipboardClearChoice) -> String { switch value { case .never: MoreMenuLocalCopy.text("永不", "Never", language: languageStore.language); case .fifteenSeconds: second(15); case .thirtySeconds: second(30); case .oneMinute: minute(1); case .twoMinutes: minute(2) } }
    private func minute(_ value: Int) -> String { MoreMenuLocalCopy.text("\(value) 分钟", "\(value) min", language: languageStore.language) }
    private func second(_ value: Int) -> String { MoreMenuLocalCopy.text("\(value) 秒", "\(value) sec", language: languageStore.language) }
}

private struct LocalPrivacyModeView: View {
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @EnvironmentObject private var languageStore: AppLanguageStore

    var body: some View {
        LocalModalShell(title: MoreMenuLocalCopy.title(.privacy, language: languageStore.language)) {
            VStack(alignment: .leading, spacing: 14) {
                Text(MoreMenuLocalCopy.text("保护级别", "Protection level", language: languageStore.language)).font(.headline)
                PVChoiceField(title: MoreMenuLocalCopy.text("保护级别", "Protection level", language: languageStore.language), icon: "eye.slash", selection: $preferences.privacyLevel, options: [
                    PVChoiceOption(.off, MoreMenuLocalCopy.text("关闭", "Off", language: languageStore.language)),
                    PVChoiceOption(.titles, MoreMenuLocalCopy.text("标题可见", "Titles visible", language: languageStore.language)),
                    PVChoiceOption(.list, MoreMenuLocalCopy.text("列表隐私", "Private list", language: languageStore.language)),
                    PVChoiceOption(.full, MoreMenuLocalCopy.text("完整隐私", "Full privacy", language: languageStore.language))
                ], onSelect: { if preferences.privacyPersist { preferences.persistPrivacyLevel(preferences.privacyLevel) } })
                Label(MoreMenuLocalCopy.text("切到后台时始终遮挡", "Always shielded in background", language: languageStore.language), systemImage: "lock.shield")
                    .foregroundStyle(PVTheme.muted)
                Toggle(MoreMenuLocalCopy.text("重新打开时保持开启", "Keep enabled when reopened", language: languageStore.language), isOn: Binding(
                    get: { preferences.privacyPersist },
                    set: { enabled in
                        preferences.privacyPersist = enabled
                        if enabled { preferences.persistPrivacyLevel(preferences.privacyLevel) }
                    }
                )).tint(PVTheme.accent)
                Text(MoreMenuLocalCopy.text("设置只保存在本机，不会改动加密资料。", "Settings remain on this device and do not modify encrypted records.", language: languageStore.language)).font(.footnote).foregroundStyle(PVTheme.muted)
            }.padding(16).background(PVTheme.background)
        }
    }
}

private struct LocalThemeView: View {
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @EnvironmentObject private var languageStore: AppLanguageStore
    var body: some View {
        LocalModalShell(title: MoreMenuLocalCopy.title(.theme, language: languageStore.language)) {
            PVChoiceField(title: MoreMenuLocalCopy.title(.theme, language: languageStore.language), icon: "circle.lefthalf.filled", selection: $preferences.theme, options: [
                PVChoiceOption(.system, MoreMenuLocalCopy.text("跟随系统", "System", language: languageStore.language)),
                PVChoiceOption(.light, MoreMenuLocalCopy.text("白天模式", "Light", language: languageStore.language)),
                PVChoiceOption(.dark, MoreMenuLocalCopy.text("夜晚模式", "Dark", language: languageStore.language))
            ], selectionAnimation: .easeInOut(duration: 0.24)).padding(16)
        }
    }
}

private struct GroupOrderReferenceView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var kind: VaultItemKind = .account
    @State private var editorPresented = false
    @State private var selectedGroup: GroupDefinition?
    @State private var editedName = ""
    @State private var confirmingDelete = false
    private var groups: [GroupDefinition] { model.vault.groupRegistry.groups(for: kind) }

    var body: some View {
        LocalModalShell(title: MoreMenuLocalCopy.title(.groupOrder, language: languageStore.language)) {
            VStack(spacing: 0) {
                HStack { PVChoiceField(title: MoreMenuLocalCopy.text("资料类型", "Record type", language: languageStore.language), icon: "square.grid.2x2", selection: $kind, options: VaultItemKind.allCases.map { PVChoiceOption($0, L10n.kind($0, language: languageStore.language)) }); Spacer(); Button { openEditor(nil) } label: { Label(MoreMenuLocalCopy.text("新建", "New", language: languageStore.language), systemImage: "plus") }.buttonStyle(PVButtonStyle(role: .primary)) }.padding(10).background(PVTheme.surfaceSoft)
                ScrollView { LazyVStack(spacing: 8) {
                    fixedRow(MoreMenuLocalCopy.text("全部", "All", language: languageStore.language)); fixedRow(MoreMenuLocalCopy.text("默认", "Default", language: languageStore.language))
                    ForEach(Array(groups.enumerated()), id: \.element.id) { index, group in
                        HStack { Button { openEditor(group) } label: { HStack { Text(group.name); Spacer() }.contentShape(Rectangle()) }.buttonStyle(.plain); orderButtons(upDisabled: index == 0, downDisabled: index == groups.count - 1) { move(group, -1) } down: { move(group, 1) } }.padding(12).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    if groups.isEmpty { localEmpty(MoreMenuLocalCopy.text("当前分类没有自定义分组", "No custom groups in this category", language: languageStore.language), icon: "square.stack.3d.up") }
                }.padding(16) }.background(PVTheme.background)
            }
        }
        .pvWebModal(isPresented: $editorPresented, maxWidth: 460, sizing: .fit, dismissOnBackdrop: false) {
            VStack(spacing: 0) {
                PVModalHeader(title: selectedGroup == nil ? MoreMenuLocalCopy.text("新建分组", "New Group", language: languageStore.language) : MoreMenuLocalCopy.text("编辑分组", "Edit Group", language: languageStore.language), cancelTitle: MoreMenuLocalCopy.text("取消", "Cancel", language: languageStore.language)) { editorPresented = false }
                VStack(spacing: 12) { TextField(MoreMenuLocalCopy.text("分组名称", "Group name", language: languageStore.language), text: $editedName).textFieldStyle(.roundedBorder); if selectedGroup != nil { Button(MoreMenuLocalCopy.text("删除分组", "Delete Group", language: languageStore.language), role: .destructive) { confirmingDelete = true }.buttonStyle(PVButtonStyle(role: .destructive, fillsWidth: true)) } }.padding(16)
                PVModalFooter { Button(MoreMenuLocalCopy.text("取消", "Cancel", language: languageStore.language)) { editorPresented = false }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)); Button(MoreMenuLocalCopy.text("保存", "Save", language: languageStore.language)) { saveGroup() }.buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(cleanName.isEmpty) }
            }.pvWebModal(isPresented: $confirmingDelete, maxWidth: 420, sizing: .fit, dismissOnBackdrop: false) { PVConfirmModal(title: MoreMenuLocalCopy.text("删除分组？", "Delete Group?", language: languageStore.language), message: groupDeleteConfirmationMessage, confirmTitle: MoreMenuLocalCopy.text("删除分组", "Delete Group", language: languageStore.language), cancelTitle: MoreMenuLocalCopy.text("取消", "Cancel", language: languageStore.language), destructive: true, confirm: deleteGroup, cancel: { confirmingDelete = false }) }
        }
    }
    private var groupDeleteConfirmationMessage: String {
        guard let selectedGroup else { return MoreMenuLocalCopy.text("删除后，分组中的资料会返回默认分组。", "Items in this group will return to the default group.", language: languageStore.language) }
        let count = model.vault.items.filter { !$0.isDeleted && $0.kind == kind && $0.group == selectedGroup.id.uuidString }.count
        return MoreMenuLocalCopy.text("分组“\(selectedGroup.name)”包含 \(count) 项资料。删除分组后，这些资料会返回默认分组，资料本身不会删除。", "The group “\(selectedGroup.name)” contains \(count) item(s). They will return to the default group and will not be deleted.", language: languageStore.language)
    }
    private var cleanName: String { editedName.trimmingCharacters(in: .whitespacesAndNewlines) }
    private func fixedRow(_ text: String) -> some View { HStack { Image(systemName: "lock.fill").foregroundStyle(PVTheme.muted); Text(text); Spacer() }.padding(14).background(PVTheme.surfaceSoft).clipShape(RoundedRectangle(cornerRadius: 12)) }
    private func openEditor(_ group: GroupDefinition?) { selectedGroup = group; editedName = group?.name ?? ""; editorPresented = true }
    private func saveGroup() {
        if groups.contains(where: { $0.id != selectedGroup?.id && $0.name.localizedCaseInsensitiveCompare(cleanName) == .orderedSame }) { return }
        let succeeded = model.updateOrganization { if let selectedGroup { _ = $0.groupRegistry.rename(groupID: selectedGroup.id, kind: kind, to: cleanName) } else { $0.groupRegistry.create(name: cleanName, kind: kind) } }
        if succeeded { editorPresented = false }
    }
    private func deleteGroup() { guard let selectedGroup else { return }; let succeeded = model.updateOrganization { $0.items = $0.groupRegistry.delete(groupID: selectedGroup.id, kind: kind, items: $0.items) }; if succeeded { confirmingDelete = false; editorPresented = false } }
    private func move(_ group: GroupDefinition, _ offset: Int) { _ = model.updateOrganization { _ = $0.groupRegistry.move(groupID: group.id, kind: kind, by: offset) } }
}

private struct PinOrderReferenceView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @State private var kind: VaultItemKind = .account
    private var rows: [VaultItem] { model.vault.pinnedOrder.ordered(model.vault.items, for: kind) }
    var body: some View {
        LocalModalShell(title: MoreMenuLocalCopy.title(.pinOrder, language: languageStore.language)) {
            VStack(spacing: 0) {
                PVChoiceField(title: MoreMenuLocalCopy.text("资料类型", "Record type", language: languageStore.language), icon: "square.grid.2x2", selection: $kind, options: VaultItemKind.allCases.map { PVChoiceOption($0, L10n.kind($0, language: languageStore.language)) }).padding(10)
                ScrollView { LazyVStack(spacing: 8) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in HStack { Image(systemName: "pin.fill").foregroundStyle(PVTheme.accent); Text(item.title.isEmpty ? MoreMenuLocalCopy.text("未命名", "Untitled", language: languageStore.language) : item.title); Spacer(); orderButtons(upDisabled: index == 0, downDisabled: index == rows.count - 1) { move(item, -1) } down: { move(item, 1) } }.padding(12).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12)) }
                    if rows.isEmpty { localEmpty(MoreMenuLocalCopy.text("这里只显示已经置顶的资料", "Only pinned records appear here", language: languageStore.language), icon: "pin") }
                }.padding(16) }.background(PVTheme.background)
            }
        }
    }
    private func move(_ item: VaultItem, _ offset: Int) { _ = model.updateOrganization { _ = $0.pinnedOrder.move(itemID: item.id, kind: kind, by: offset, availableItems: $0.items) } }
}

private struct BulkGroupManagementView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvModalDismiss) private var dismiss
    @State private var kind: VaultItemKind = .account
    @State private var selectedIDs = Set<UUID>()
    @State private var targetGroup: String?
    private var rows: [VaultItem] { model.vault.items.filter { !$0.isDeleted && $0.kind == kind } }
    private var groups: [GroupDefinition] { model.vault.groupRegistry.groups(for: kind) }
    var body: some View {
        LocalModalShell(title: MoreMenuLocalCopy.title(.bulkGroup, language: languageStore.language)) {
            VStack(spacing: 0) {
                HStack { PVChoiceField(title: MoreMenuLocalCopy.text("资料类型", "Record type", language: languageStore.language), icon: "square.grid.2x2", selection: $kind, options: VaultItemKind.allCases.map { PVChoiceOption($0, L10n.kind($0, language: languageStore.language)) }, onSelect: { selectedIDs.removeAll(); targetGroup = nil }); Spacer(); Text("\(selectedIDs.count) / \(rows.count)").foregroundStyle(PVTheme.muted) }.padding(10).background(PVTheme.surfaceSoft)
                ScrollView { VStack(spacing: 12) {
                    HStack { Text(MoreMenuLocalCopy.text("设置分组", "Set group", language: languageStore.language)).font(.subheadline.weight(.semibold)); Spacer(); PVChoiceField(title: MoreMenuLocalCopy.text("设置分组", "Set group", language: languageStore.language), icon: "square.stack.3d.up", selection: $targetGroup, options: [PVChoiceOption(String?.none, MoreMenuLocalCopy.text("不更改", "No change", language: languageStore.language)), PVChoiceOption(Optional(""), MoreMenuLocalCopy.text("默认", "Default", language: languageStore.language))] + groups.map { PVChoiceOption(Optional($0.id.uuidString), $0.name) }) }.padding(12).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12))
                    LazyVStack(spacing: 8) { ForEach(rows) { item in Button { if selectedIDs.remove(item.id) == nil { selectedIDs.insert(item.id) } } label: { HStack { Image(systemName: selectedIDs.contains(item.id) ? "checkmark.circle.fill" : "circle").foregroundStyle(selectedIDs.contains(item.id) ? PVTheme.accent : PVTheme.muted); VStack(alignment: .leading) { Text(item.title.isEmpty ? MoreMenuLocalCopy.text("未命名", "Untitled", language: languageStore.language) : item.title); Text(groupName(item.group)).font(.caption).foregroundStyle(PVTheme.muted) }; Spacer() }.padding(12).background(PVTheme.surface).clipShape(RoundedRectangle(cornerRadius: 12)) }.buttonStyle(.plain) } }
                }.padding(12) }.background(PVTheme.background)
                PVModalFooter { Button(MoreMenuLocalCopy.text("确认设置分组", "Apply Group", language: languageStore.language)) { apply() }.buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(selectedIDs.isEmpty || targetGroup == nil) }
            }
        }
    }
    private var groupLabel: String { targetGroup.map(groupName) ?? MoreMenuLocalCopy.text("不更改", "No change", language: languageStore.language) }
    private func groupName(_ id: String) -> String { id.isEmpty ? MoreMenuLocalCopy.text("默认", "Default", language: languageStore.language) : (groups.first { $0.id.uuidString == id }?.name ?? MoreMenuLocalCopy.text("默认", "Default", language: languageStore.language)) }
    private func apply() { let succeeded = model.applyBulk(selectedIDs: selectedIDs, group: targetGroup); if succeeded { dismiss() } }
}

private struct LocalMenuPlaceholderView: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    let title: String
    var body: some View { LocalModalShell(title: title) { localEmpty(MoreMenuLocalCopy.text("此功能由现有本地设置流程提供。", "This capability is provided by the existing local settings flow.", language: languageStore.language), icon: "gearshape") } }
}

@MainActor @ViewBuilder private func orderButtons(upDisabled: Bool, downDisabled: Bool, up: @escaping () -> Void, down: @escaping () -> Void) -> some View {
    HStack(spacing: 4) {
        Button(action: up) { Image(systemName: "chevron.up").frame(width: 34, height: 34) }.buttonStyle(.plain).disabled(upDisabled).opacity(upDisabled ? 0.3 : 1)
        Button(action: down) { Image(systemName: "chevron.down").frame(width: 34, height: 34) }.buttonStyle(.plain).disabled(downDisabled).opacity(downDisabled ? 0.3 : 1)
    }.foregroundStyle(PVTheme.accent)
}

@MainActor @ViewBuilder private func localEmpty(_ text: String, icon: String) -> some View {
    VStack(spacing: 12) {
        Spacer(minLength: 24)
        Image(systemName: icon).font(.system(size: 30)).foregroundStyle(PVTheme.accent)
        Text(text).foregroundStyle(PVTheme.muted).multilineTextAlignment(.center)
        Spacer(minLength: 24)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(28)
}