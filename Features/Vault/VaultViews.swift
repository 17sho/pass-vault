import SwiftUI
import UIKit
import UniformTypeIdentifiers

private struct VaultScrollOffsetPreferenceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

extension Notification.Name {
    static let passVaultRequestAttachmentImport = Notification.Name("PassVaultRequestAttachmentImport")
    static let passVaultAttachmentImportCompleted = Notification.Name("PassVaultAttachmentImportCompleted")
}

struct BackupDocument: FileDocument {
    static var readableContentTypes: [UTType] { [UTType(exportedAs: "me.23cm.passvault.backup", conformingTo: .data)] }
    static var importableContentTypes: [UTType] { readableContentTypes + [.json] }
    var data: Data
    init(data: Data = Data()) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct AttachmentDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.data] }
    var data: Data
    init(data: Data = Data()) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let data = configuration.file.regularFileContents else { throw CocoaError(.fileReadCorruptFile) }
        self.data = data
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

struct VaultHomeView: View {
    private enum ProductRoute {
        case newPicker
        case moreMenu
        case editor(VaultItem)
        case favorites
        case recoveryCenter
        case settings(SettingsInitialAction?)
        case destination(MoreMenuDestination)
        case attachmentComposer(AttachmentImportDraft?)
    }
    private enum PendingSystemAction { case importAttachment }
    private enum RouteDirection { case forward, backward }
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @EnvironmentObject private var fileImporter: FileImportCoordinator
    @State private var category: WebVaultCategory = .account
    @State private var selectedItem: VaultItem?
    @State private var showingDetail = false
    @State private var detailPreviewItem: VaultItem?
    @State private var productRoute: ProductRoute?
    @State private var productRouteHistory: [ProductRoute] = []
    @State private var pendingSystemAction: PendingSystemAction?
    @State private var routeDirection: RouteDirection = .forward
    @State private var bulkSelectionRequest = 0
    @State private var interactionResetRequest = 0
    @State private var attachmentImportCompletion = 0
    @State private var showingCustomRecords = false
    @State private var detailEdgeBackProgress: CGFloat = 0
    @State private var detailEdgeBackActive = false

    @State private var viewportWidth: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        GeometryReader { proxy in
            if UIDevice.current.userInterfaceIdiom == .pad && proxy.size.width >= 760 {
                tabletShell
            } else {
                phoneShell
            }
            Color.clear
                .onAppear { viewportWidth = proxy.size.width }
                .onChange(of: proxy.size.width) { _, width in viewportWidth = width }
        }
        .pvScreen()
        .overlay { rootProductModal }
        .animation(reduceMotion ? nil : .timingCurve(0.2, 0, 0, 1, duration: 0.22), value: productRoute != nil)
        .onReceive(NotificationCenter.default.publisher(for: .passVaultAttachmentImportCompleted)) { _ in
            category = .attachment
            showingCustomRecords = false
            interactionResetRequest += 1
            attachmentImportCompletion += 1
        }
        .onChange(of: category) { _, _ in
            selectedItem = nil
            showingDetail = false
            interactionResetRequest += 1
        }
        .onAppear {
            fileImporter.onAttachmentDraft = { draft in
                productRouteHistory.removeAll()
                productRoute = .attachmentComposer(draft)
            }
        }
        .onChange(of: Set(model.vault.items.filter { !$0.isDeleted }.map(\.id))) { _, activeIDs in
            guard let selectedItem, !activeIDs.contains(selectedItem.id) else { return }
            self.selectedItem = nil
            showingDetail = false
        }
        #if DEBUG
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-ui-testing") {
                selectedItem = nil
                showingDetail = false
                productRoute = nil
                productRouteHistory.removeAll()
            }
        }
        #endif
    }

    private var phoneShell: some View {
        VStack(spacing: 0) {
            VaultProductHeader(
                onAdd: { openProductRoute(.newPicker) },
                onFavorites: { openProductRoute(.favorites) },
                onMore: { openProductRoute(.moreMenu) }
            )
            if !showingCustomRecords { WebCategoryBar(selection: $category) }
            phoneContentPane
        }
        .background(PVTheme.surface)
    }

    private var phoneContentPane: some View {
        GeometryReader { pane in
            ZStack {
                Group {
                    if showingCustomRecords {
                        customRecordsHomePane(onOpenDetail: { openPhoneDetail() })
                    } else {
                        VaultListView(category: category, selectedItem: $selectedItem, selectionRequest: bulkSelectionRequest, interactionResetRequest: interactionResetRequest, attachmentImportCompletion: attachmentImportCompletion, onEditItem: { openProductRoute(.editor($0)) }, onCategorySwipe: switchCategoryBySwipe) {
                            openPhoneDetail()
                        }
                    }
                }
                .frame(width: pane.size.width, height: pane.size.height)
                .offset(x: showingDetail ? -pane.size.width + pane.size.width * detailEdgeBackProgress : 0)

                if showingDetail, let selectedItem {
                PhoneVaultDetailDestination(
                    item: selectedItem,
                    onEdit: { updated in productRoute = .editor(updated) },
                    previewItem: $detailPreviewItem,
                    onPreview: { detailPreviewItem = $0 },
                    onBack: closePhoneDetail
                )
                    .frame(width: pane.size.width, height: pane.size.height)
                    .offset(x: pane.size.width * detailEdgeBackProgress)
                    .shadow(color: .black.opacity(detailEdgeBackProgress > 0 ? 0.18 : 0), radius: 10, x: -4)
                    .transition(.move(edge: .trailing))
                }
            }
            .background {
                PVNativeEdgeBackRecognizer(
                    isEnabled: showingDetail,
                    onProgress: updateDetailEdgeBack,
                    onFinish: finishDetailEdgeBack
                )
            }
            .animation(detailEdgeBackActive ? nil : productRouteAnimation, value: showingDetail)
        }
        .clipped()
    }

    private var homePaneTransition: AnyTransition {
        reduceMotion ? .opacity : .asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading))
    }

    private func setCustomRecordsVisible(_ visible: Bool) {
        withAnimation(reduceMotion ? .easeOut(duration: 0.12) : .timingCurve(0.2, 0, 0, 1, duration: 0.24)) {
            showingCustomRecords = visible
        }
    }


    private func switchCategoryBySwipe(_ direction: UISwipeGestureRecognizer.Direction) {
        guard !showingDetail, productRoute == nil else { return }
        let categories = WebVaultCategory.allCases
        guard let index = categories.firstIndex(of: category) else { return }
        let targetIndex: Int
        if direction == .left {
            targetIndex = index + 1
        } else if direction == .right {
            targetIndex = index - 1
        } else {
            return
        }
        guard categories.indices.contains(targetIndex) else { return }
        interactionResetRequest += 1
        selectedItem = nil
        withAnimation(reduceMotion ? nil : .timingCurve(0.2, 0, 0, 1, duration: 0.20)) {
            category = categories[targetIndex]
        }
    }

    private func openPhoneDetail() {
        routeDirection = .forward
        detailEdgeBackProgress = 0
        detailEdgeBackActive = false
        withAnimation(productRouteAnimation) { showingDetail = true }
    }

    private func closePhoneDetail() {
        routeDirection = .backward
        detailEdgeBackProgress = 0
        detailEdgeBackActive = false
        withAnimation(productRouteAnimation) { showingDetail = false }
    }

    private func updateDetailEdgeBack(_ progress: CGFloat) {
        guard showingDetail else { return }
        detailEdgeBackActive = true
        detailEdgeBackProgress = progress
    }

    private func finishDetailEdgeBack(_ shouldReturn: Bool) {
        guard showingDetail else { return }
        if shouldReturn {
            routeDirection = .backward
            let duration = reduceMotion ? 0.0 : 0.18
            withAnimation(reduceMotion ? nil : .timingCurve(0.2, 0, 0, 1, duration: duration)) {
                detailEdgeBackProgress = 1
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + duration) {
                var transaction = Transaction()
                transaction.disablesAnimations = true
                withTransaction(transaction) {
                    showingDetail = false
                    detailEdgeBackProgress = 0
                    detailEdgeBackActive = false
                }
            }
        } else {
            withAnimation(reduceMotion ? nil : .timingCurve(0.2, 0, 0, 1, duration: 0.18)) {
                detailEdgeBackProgress = 0
            }
            detailEdgeBackActive = false
        }
    }

    private func customRecordsHomePane(onOpenDetail: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button {
                    selectedItem = nil
                    showingDetail = false
                    setCustomRecordsVisible(false)
                } label: {
                    Image(systemName: "chevron.left")
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(languageStore.language == .simplifiedChinese ? "返回" : "Back")
                Text(languageStore.language == .simplifiedChinese ? "自定义资料" : "Custom Records")
                    .font(.headline)
                Spacer()
            }
            .padding(.horizontal, 8)
            .background(PVTheme.surface)
            .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }

            VaultListView(
                kind: .custom,
                selectedItem: $selectedItem,
                interactionResetRequest: interactionResetRequest,
                showsSheetHeader: false,
                onEditItem: { openProductRoute(.editor($0)) },
                onOpenDetail: onOpenDetail
            )
        }
        .accessibilityIdentifier("home-custom-records")
    }

    private var tabletShell: some View {
        HStack(spacing: 0) {
            vaultColumn(onOpenDetail: {})
                .frame(width: 390)
            Rectangle().fill(PVTheme.line).frame(width: 1)
            if let selectedItem {
                DetailPreviewWorkspace(
                    item: selectedItem,
                    previewItem: $detailPreviewItem,
                    onEdit: { updated in productRoute = .editor(updated) }
                )
            } else {
                VaultEmptyDetail()
            }
        }
    }

    private func vaultColumn(onOpenDetail: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            VaultProductHeader(
                onAdd: { openProductRoute(.newPicker) },
                onFavorites: { openProductRoute(.favorites) },
                onMore: { openProductRoute(.moreMenu) }
            )
            if showingCustomRecords {
                customRecordsHomePane(onOpenDetail: onOpenDetail)
            } else {
                WebCategoryBar(selection: $category)
                VaultListView(category: category, selectedItem: $selectedItem, selectionRequest: bulkSelectionRequest, interactionResetRequest: interactionResetRequest, attachmentImportCompletion: attachmentImportCompletion, onEditItem: { openProductRoute(.editor($0)) }, onOpenDetail: onOpenDetail)
            }
        }
        .background(PVTheme.surface)
    }

    private var productModalWidth: CGFloat {
        switch productRoute {
        case .newPicker, .moreMenu: 560
        case .editor, .settings: 840
        default: 920
        }
    }

    private var productModalSizing: PVModalSizing {
        switch productRoute {
        case .newPicker, .moreMenu: .fit
        case .editor, .settings: .workspace
        case .recoveryCenter: MoreMenuModalSizing.sizing(.recoveryCenter)
        case .destination(let destination): MoreMenuModalSizing.sizing(destination)
        default: .capped
        }
    }

    @ViewBuilder
    private var rootProductModal: some View {
        if productRoute != nil {
            PVWebModal(
                maxWidth: productModalWidth,
                verticalInset: 28,
                sizing: productModalSizing,
                dismissOnBackdrop: false,
                onDismiss: closeProductRoutes
            ) {
                productModalContent
            }
            .transition(.opacity)
        }
    }

    private var productModalContent: some View {
        productRouteView
            .id(productRouteIdentity)
            .environment(\.pvModalDismiss, dismissCurrentProductRoute)
            .environment(\.pvModalBack, productRouteBackAction)
            .transition(productRouteTransition)
            .animation(productRouteAnimation, value: productRouteIdentity)
    }

    private func dismissCurrentProductRoute() {
        closeProductRoutes()
    }

    @ViewBuilder
    private var productRouteView: some View {
        switch productRoute {
        case .newPicker:
            NewItemPickerView(
                onSelect: { item in pushProductRoute(.editor(item)) },
                onImportAttachment: { pushProductRoute(.attachmentComposer(nil)) }
            )
        case .moreMenu:
            moreMenuContent
        case .editor(let item):
            VaultEditorView(item: item, isExistingItem: model.vault.items.contains { $0.id == item.id })
        case .favorites:
            VaultListView(filter: .favorites, selectedItem: $selectedItem, rowInteraction: .tapOnly, onOpenDetail: { openItemFromProductRoute() })
        case .recoveryCenter:
            RecoveryCenterView()
                .overlay(alignment: .topLeading) { Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("more-destination-recoveryCenter") }
        case .settings(let action):
            SettingsView(initialAction: action)
                .overlay(alignment: .topLeading) { Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("more-destination-settings") }
        case .destination(let destination):
            MoreMenuLocalDestinationView(destination: destination, selectedItem: $selectedItem) { _ in openItemFromProductRoute() }
        case .attachmentComposer(let draft):
            AttachmentImportComposer(draft: draft)
        case nil:
            EmptyView()
        }
    }

    private var productRouteBackAction: (() -> Void)? {
        productRouteHistory.isEmpty ? nil : { popProductRoute() }
    }

    private var productRouteTransition: AnyTransition {
        guard !reduceMotion else { return .opacity }
        return routeDirection == .forward
            ? AnyTransition.asymmetric(insertion: .move(edge: .trailing), removal: .move(edge: .leading))
            : AnyTransition.asymmetric(insertion: .move(edge: .leading), removal: .move(edge: .trailing))
    }

    private var productRouteAnimation: Animation? {
        reduceMotion ? nil : .timingCurve(0.2, 0, 0, 1, duration: 0.24)
    }

    private func pushProductRoute(_ route: ProductRoute) {
        interactionResetRequest += 1
        if let productRoute { productRouteHistory.append(productRoute) }
        routeDirection = .forward
        withAnimation(reduceMotion ? nil : .timingCurve(0.2, 0, 0, 1, duration: 0.24)) {
            productRoute = route
        }
    }

    private func popProductRoute() {
        guard let parent = productRouteHistory.popLast() else { return }
        routeDirection = .backward
        withAnimation(reduceMotion ? nil : .timingCurve(0.4, 0, 1, 1, duration: 0.20)) {
            productRoute = parent
        }
    }

    private func closeProductRoutes() {
        productRouteHistory.removeAll()
        productRoute = nil
    }

    private func openProductRoute(_ route: ProductRoute) {
        interactionResetRequest += 1
        productRouteHistory.removeAll()
        routeDirection = .forward
        productRoute = route
    }

    private var productRouteIdentity: String {
        switch productRoute {
        case .newPicker: "new"
        case .moreMenu: "more"
        case .editor(let item): "editor-\(item.id)"
        case .favorites: "favorites"
        case .recoveryCenter: "recovery"
        case .settings(let action): "settings-\(String(describing: action))"
        case .destination(let destination): "destination-\(destination.rawValue)"
        case .attachmentComposer(let draft): "attachment-composer-\(draft?.name ?? "source")"
        case nil: "none"
        }
    }

    private var moreMenuContent: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: t(.more), cancelTitle: t(.cancel)) { closeProductRoutes() }
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(MoreMenuDestination.localReferenceOrder, id: \.rawValue) { destination in
                        Button { openMoreDestination(destination) } label: {
                            Label(MoreMenuLocalCopy.title(destination, language: languageStore.language), systemImage: MoreMenuLocalCopy.icon(destination))
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                        .disabled(!VaultPrivacyNavigationPolicy.allows(destination, level: preferences.privacyLevel))
                        .accessibilityIdentifier("more-\(destination.rawValue)")
                    }
                }.padding(16)
            }
            .accessibilityIdentifier("more-menu-scroll")
            .accessibilityElement(children: .contain)
        }
    }

    private func requestSystemAction(_ action: PendingSystemAction) {
        pendingSystemAction = action
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            productRouteHistory.removeAll()
            productRoute = nil
        }
        Task { @MainActor in
            await Task.yield()
            completePendingSystemAction()
        }
    }

    private func completePendingSystemAction() {
        guard let action = pendingSystemAction else { return }
        pendingSystemAction = nil
        switch action {
        case .importAttachment:
            NotificationCenter.default.post(name: .passVaultRequestAttachmentImport, object: nil)
        }
    }

    private func openMoreDestination(_ destination: MoreMenuDestination) {
        guard VaultPrivacyNavigationPolicy.allows(destination, level: preferences.privacyLevel) else { return }
        switch destination {
        case .customRecords:
            showCustomRecordsOnHome()
        case .recoveryCenter: pushProductRoute(.recoveryCenter)
        case .settings: pushProductRoute(.settings(nil))
        case .exportBackup: pushProductRoute(.settings(.exportBackup))
        case .importBackup: pushProductRoute(.settings(.importBackup))
        case .changePassword: pushProductRoute(.settings(.changePassword))
        case .lock:
            productRoute = nil
            model.lock()
        case .bulkGroup:
            closeProductRoutes()
            bulkSelectionRequest += 1
        default: pushProductRoute(.destination(destination))
        }
    }

    private func openItemFromProductRoute() {
        closeProductRoutes()
        Task { @MainActor in
            await Task.yield()
            withAnimation(productRouteAnimation) { showingDetail = selectedItem != nil }
        }
    }

    private func showCustomRecordsOnHome() {
        closeProductRoutes()
        selectedItem = nil
        showingDetail = false
        Task { @MainActor in
            await Task.yield()
            setCustomRecordsVisible(true)
            interactionResetRequest += 1
        }
    }
}

private struct NewItemPickerView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvModalDismiss) private var dismiss
    @State private var showingCustomTemplates = false
    let onSelect: (VaultItem) -> Void
    let onImportAttachment: () -> Void

    private var primaryKinds: [VaultItemKind] { [.account, .website, .secureNote, .totp] }
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        if showingCustomTemplates {
            customTemplatePicker
        } else {
            newItemGrid
        }
    }

    private var newItemGrid: some View {
        VStack(spacing: 0) {
            pickerHeader(
                title: languageStore.language == .simplifiedChinese ? "新建什么资料？" : "What would you like to create?",
                subtitle: languageStore.language == .simplifiedChinese ? "创建后类型不可修改" : "The type cannot be changed after creation",
                closeIdentifier: "close-new-item-picker"
            )
            ScrollView {
                LazyVGrid(columns: gridColumns, spacing: 10) {
                    ForEach(primaryKinds) { kind in
                        primaryChoice(kind)
                    }
                    attachmentChoice
                    customRecordChoice
                }
                .padding(16)
            }
            .background(PVTheme.background)
        }
    }

    private var gridColumns: [GridItem] { [GridItem(.flexible()), GridItem(.flexible())] }

    private func primaryChoice(_ kind: VaultItemKind) -> some View {
        choice(
            title: L10n.kind(kind, language: languageStore.language),
            subtitle: kindSubtitle(kind),
            icon: WebVaultCategory.allCases.first { $0.kind == kind }?.icon ?? "doc",
            identifier: "new-kind-\(kind.rawValue)"
        ) { select(VaultItem(kind: kind)) }
    }

    private var attachmentChoice: some View {
        choice(
            title: L10n.kind(.attachment, language: languageStore.language),
            subtitle: languageStore.language == .simplifiedChinese ? "图片、视频与文件" : "Images, video, and files",
            icon: "paperclip",
            identifier: "new-kind-attachment",
            action: onImportAttachment
        )
    }

    private var customRecordChoice: some View {
        choice(
            title: languageStore.language == .simplifiedChinese ? "自定义资料" : "Custom record",
            subtitle: languageStore.language == .simplifiedChinese ? "模板或自由字段" : "Templates or free-form fields",
            icon: "rectangle.and.pencil.and.ellipsis",
            identifier: "new-kind-custom"
        ) { showingCustomTemplates = true }
    }

    private var customTemplatePicker: some View {
        VStack(spacing: 0) {
            pickerHeader(
                title: languageStore.language == .simplifiedChinese ? "选择自定义资料模板" : "Choose a custom-record template",
                subtitle: languageStore.language == .simplifiedChinese ? "模板只会预填字段，保存后仍是同一种资料" : "Templates only prefill fields; the saved record type stays the same",
                closeIdentifier: "close-custom-template-picker",
                leadingBack: { showingCustomTemplates = false }
            )
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                    ForEach(BuiltInCustomRecordTemplate.allCases) { template in
                        choice(
                            title: template.displayName(language: languageStore.language),
                            subtitle: templateSubtitle(template),
                            icon: template.icon,
                            identifier: "new-custom-template-\(template.id)"
                        ) { select(VaultItem(kind: .custom, customFields: template.makeFields())) }
                    }
                    ForEach(model.vault.customFieldTemplates) { template in
                        choice(
                            title: template.name,
                            subtitle: languageStore.language == .simplifiedChinese ? "个人模板" : "Personal template",
                            icon: "person.crop.square",
                            identifier: "new-personal-template-\(template.id.uuidString)"
                        ) { select(VaultItem(kind: .custom, customFields: template.makeCustomFields())) }
                    }
                }
                .padding(16)
            }
            .background(PVTheme.background)
        }

    }

    @ViewBuilder
    private func pickerHeader(title: String, subtitle: String, closeIdentifier: String, leadingBack: (() -> Void)? = nil) -> some View {
        HStack(spacing: 12) {
            if let leadingBack {
                Button(action: leadingBack) { Image(systemName: "chevron.left").frame(width: 44, height: 44) }
                    .accessibilityLabel(languageStore.language == .simplifiedChinese ? "返回" : "Back")
                    .accessibilityIdentifier("back-custom-template-picker")
                    .buttonStyle(PVIconButtonStyle())
            } else {
                Image("Logo").resizable().scaledToFit().frame(width: 30, height: 30)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.title3.bold())
                Text(subtitle).font(.caption).foregroundStyle(PVTheme.muted)
            }
            Spacer()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark").frame(width: 44, height: 44)
            }
            .accessibilityLabel(L10n.text(.cancel, language: languageStore.language))
            .accessibilityIdentifier(closeIdentifier)
            .buttonStyle(PVIconButtonStyle())
        }
        .padding(.horizontal, 16).padding(.vertical, 10).background(PVTheme.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }

    private func choice(title: String, subtitle: String, icon: String, identifier: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 7) {
                Image(systemName: icon).frame(width: 38, height: 38).background(PVTheme.selected).clipShape(RoundedRectangle(cornerRadius: 9))
                Text(title).font(.body.weight(.semibold)).foregroundStyle(PVTheme.ink)
                Text(subtitle).font(.caption).foregroundStyle(PVTheme.muted).lineLimit(2)
            }
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .padding(12)
            .background(PVTheme.surface)
            .overlay(RoundedRectangle(cornerRadius: PVTheme.cornerRadius).stroke(PVTheme.line))
            .clipShape(RoundedRectangle(cornerRadius: PVTheme.cornerRadius))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(identifier)
    }

    private func select(_ item: VaultItem) {
        showingCustomTemplates = false
        onSelect(item)
    }

    private func kindSubtitle(_ kind: VaultItemKind) -> String {
        let zh: String
        let en: String
        switch kind {
        case .account: (zh, en) = ("登录名与密码", "Login names and passwords")
        case .website: (zh, en) = ("网址与说明", "URLs and descriptions")
        case .secureNote: (zh, en) = ("自由文本", "Free-form text")
        case .totp: (zh, en) = ("动态验证码", "One-time codes")
        default: (zh, en) = ("", "")
        }
        return languageStore.language == .simplifiedChinese ? zh : en
    }

    private func templateSubtitle(_ template: BuiltInCustomRecordTemplate) -> String {
        if template == .blank { return languageStore.language == .simplifiedChinese ? "从空白字段开始" : "Start with blank fields" }
        let count = template.fields.count
        return languageStore.language == .simplifiedChinese ? "预填 \(count) 个字段" : "Prefills \(count) fields"
    }
}

private struct PhoneVaultDetailDestination: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    let item: VaultItem
    let onEdit: (VaultItem) -> Void
    @Binding var previewItem: VaultItem?
    let onPreview: (VaultItem) -> Void
    let onBack: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button(action: {
                    if previewItem == nil { onBack() } else { previewItem = nil }
                }) {
                    Label(languageStore.language == .simplifiedChinese ? "返回" : "Back", systemImage: "chevron.left")
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("item-detail-back")
                Spacer()
            }
            .padding(.horizontal, 12)
            .background(PVTheme.surface)
            .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
            DetailPreviewWorkspace(item: item, previewItem: $previewItem, onEdit: onEdit, onPreview: onPreview, showsPreviewBack: false)
        }
        .onChange(of: item.id) { _, _ in previewItem = nil }
    }
}

private struct DetailPreviewWorkspace: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    let item: VaultItem
    @Binding var previewItem: VaultItem?
    let onEdit: (VaultItem) -> Void
    var onPreview: ((VaultItem) -> Void)? = nil
    var showsPreviewBack = true

    var body: some View {
        VStack(spacing: 0) {
            if showsPreviewBack, previewItem != nil {
                HStack {
                    Button { previewItem = nil } label: {
                        Label(languageStore.language == .simplifiedChinese ? "返回" : "Back", systemImage: "chevron.left")
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("attachment-preview-back")
                    Spacer()
                }
                .padding(.horizontal, 12)
                .background(PVTheme.surface)
                .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
            }
            Group {
                if let previewItem,
                   let data = previewItem.attachmentData,
                   let kind = AttachmentPreviewPolicy.previewKind(name: previewItem.attachmentName ?? previewItem.title, data: data) {
                    AttachmentPreviewView(name: previewItem.attachmentName ?? previewItem.title, data: data, kind: kind)
                        .transition(.move(edge: .trailing))
                } else {
                    VaultDetailView(item: item, onEdit: onEdit, onPreview: onPreview ?? { previewItem = $0 })
                        .transition(.move(edge: .leading))
                }
            }
        }
        .animation(.timingCurve(0.2, 0, 0, 1, duration: 0.22), value: previewItem?.id)
    }
}

private struct VaultProductHeader: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    let onAdd: () -> Void
    let onFavorites: () -> Void
    let onMore: () -> Void
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        HStack(spacing: 9) {
            Image("Logo").resizable().scaledToFit().frame(width: 28, height: 28)
            Text(t(.myVault)).font(.headline).lineLimit(1).minimumScaleFactor(0.8)
            Spacer(minLength: 4)
            Button(action: onAdd) { Label(t(.newRecord), systemImage: "plus").labelStyle(.titleAndIcon) }
                .buttonStyle(PVButtonStyle(role: .primary))
                .accessibilityIdentifier("new-record")
            Button(action: onFavorites) { Image(systemName: "star").accessibilityLabel(t(.favorites)) }
                .buttonStyle(PVIconButtonStyle())
                .accessibilityIdentifier("open-favorites")
            Button(action: onMore) { Image(systemName: "ellipsis").accessibilityLabel(t(.more)) }
                .accessibilityIdentifier("vault-more-menu")
                .buttonStyle(PVIconButtonStyle())
        }
        .padding(.horizontal, 12).padding(.vertical, 9)
        .background(PVTheme.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
}

private struct WebCategoryBar: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Binding var selection: WebVaultCategory

    var body: some View {
        HStack(spacing: 4) {
            ForEach(WebVaultCategory.allCases) { category in
                Button { selection = category } label: {
                    VStack(spacing: 3) {
                        Image(systemName: category.icon).font(.system(size: 15, weight: .semibold))
                        Text(L10n.kind(category.kind, language: languageStore.language)).font(.caption2.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.75)
                    }
                    .frame(maxWidth: .infinity, minHeight: 50)
                    .foregroundStyle(selection == category ? PVTheme.accentPressed : PVTheme.muted)
                    .background(selection == category ? PVTheme.selected : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("category-\(category.rawValue)")
                .accessibilityAddTraits(selection == category ? .isSelected : [])
            }
        }
        .padding(6).background(PVTheme.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
}

struct VaultListView: View {
    enum Filter { case all, favorites, recent, trash }
    enum RowInteraction { case actions, tapOnly }
    private enum TagFilterMode { case all, any }
    private enum BulkChoice { case favorite, pinned, group, tags }
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.pvPresentChoiceOverlay) private var presentOverlay
    var category: WebVaultCategory?
    var kind: VaultItemKind?
    var filter: Filter
    var selectionRequest: Int
    var interactionResetRequest: Int
    var attachmentImportCompletion: Int
    var rowInteraction: RowInteraction
    var showsSheetHeader: Bool
    @Binding var selectedItem: VaultItem?
    var onEditItem: ((VaultItem) -> Void)?
    var onCategorySwipe: ((UISwipeGestureRecognizer.Direction) -> Void)?
    var onOpenDetail: (() -> Void)?
    @State private var query = ""
    @State private var selectedTags = Set<String>()
    @State private var tagFilterMode: TagFilterMode = .all
    @State private var selectedGroup: String?
    @State private var showingGroupPicker = false
    @State private var pendingActionItem: VaultItem?
    @State private var pendingActionAnchor: CGRect = .zero
    @State private var expandedSwipeKey: String?
    @State private var editingGroup: GroupDefinition?
    @State private var groupName = ""
    @State private var confirmingGroupDelete = false
    @State private var bulkChoice: BulkChoice?
    @State private var attachmentCategory: AttachmentCategory?
    @State private var selectionMode = false
    @State private var selectedIDs = Set<UUID>()
    @State private var bulkNewTag = ""
    @State private var selectedBulkTags = Set<String>()
    @State private var confirmingBulkTrash = false
    @State private var confirmingBulkPermanentDelete = false
    @State private var confirmingEmptyTrash = false
    @State private var pendingRetentionDays: Int?
    @State private var pendingTrashItem: VaultItem?
    @State private var pendingPermanentDeleteItem: VaultItem?
    @State private var previousRetentionDays = 30
    @State private var retentionSelection = 30

    @Environment(\.pvModalDismiss) private var dismiss
    @Environment(\.pvModalBack) private var productBackAction
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    init(category: WebVaultCategory, selectedItem: Binding<VaultItem?>, selectionRequest: Int = 0, interactionResetRequest: Int = 0, attachmentImportCompletion: Int = 0, onEditItem: ((VaultItem) -> Void)? = nil, onCategorySwipe: ((UISwipeGestureRecognizer.Direction) -> Void)? = nil, onOpenDetail: @escaping () -> Void = {}) {
        self.category = category; self.kind = nil; self.filter = .all; self.selectionRequest = selectionRequest; self.interactionResetRequest = interactionResetRequest; self.attachmentImportCompletion = attachmentImportCompletion; self.rowInteraction = .actions; self.showsSheetHeader = false; self._selectedItem = selectedItem; self.onEditItem = onEditItem; self.onCategorySwipe = onCategorySwipe; self.onOpenDetail = onOpenDetail
    }
    init(kind: VaultItemKind, selectedItem: Binding<VaultItem?>, rowInteraction: RowInteraction = .actions, interactionResetRequest: Int = 0, showsSheetHeader: Bool = true, onEditItem: ((VaultItem) -> Void)? = nil, onOpenDetail: (() -> Void)? = nil) {
        self.category = nil; self.kind = kind; self.filter = .all; self.selectionRequest = 0; self.interactionResetRequest = interactionResetRequest; self.attachmentImportCompletion = 0; self.rowInteraction = rowInteraction; self.showsSheetHeader = showsSheetHeader; self._selectedItem = selectedItem; self.onEditItem = onEditItem; self.onCategorySwipe = nil; self.onOpenDetail = onOpenDetail
    }
    init(filter: Filter, selectedItem: Binding<VaultItem?>, rowInteraction: RowInteraction = .actions, onEditItem: ((VaultItem) -> Void)? = nil, onOpenDetail: (() -> Void)? = nil) {
        self.category = nil; self.kind = nil; self.filter = filter; self.selectionRequest = 0; self.interactionResetRequest = 0; self.attachmentImportCompletion = 0; self.rowInteraction = rowInteraction; self.showsSheetHeader = true; self._selectedItem = selectedItem; self.onEditItem = onEditItem; self.onCategorySwipe = nil; self.onOpenDetail = onOpenDetail
    }

    private var baseItems: [VaultItem] {
        let privacy = VaultPrivacyPresentation(level: preferences.privacyLevel)
        let items = VaultListPolicy.items(
            in: model.vault,
            query: privacy.restrictsSensitiveNavigation ? "" : query,
            filter: listPolicyFilter,
            category: category,
            kind: kind,
            selectedTag: nil,
            selectedGroup: privacy.restrictsSensitiveNavigation ? nil : selectedGroup,
            attachmentCategory: privacy.restrictsSensitiveNavigation || relevantKind != .attachment ? nil : attachmentCategory
        )
        guard !privacy.restrictsSensitiveNavigation, !selectedTags.isEmpty else { return items }
        return items.filter { item in
            tagFilterMode == .all
                ? selectedTags.allSatisfy(item.tags.contains)
                : !selectedTags.isDisjoint(with: item.tags)
        }
    }
    private var listPolicyFilter: VaultListFilter {
        switch filter { case .all: .all; case .favorites: .favorites; case .recent: .recent; case .trash: .trash }
    }
    private var availableTags: [TagDefinition] { model.vault.tagRegistry.tags }
    private var relevantKind: VaultItemKind? { category?.kind ?? kind }
    private var availableGroups: [GroupDefinition] {
        if let relevantKind { return model.vault.groupRegistry.groups(for: relevantKind) }
        return []
    }

    var body: some View {
        VStack(spacing: 0) {
            if category == nil && showsSheetHeader { sheetHeader }
            if filter == .trash { trashRetentionToolbar }
            if !VaultPrivacyPresentation(level: preferences.privacyLevel).restrictsSensitiveNavigation {
                if selectionMode {
                    selectionToolbar
                    if !selectedIDs.isEmpty { bulkToolbar }
                }
                if filter == .all {
                    VaultFilterToolbar(
                        query: $query,
                        searchPrompt: searchPrompt,
                        tagFilterTitle: languageStore.language == .simplifiedChinese ? "标签筛选" : "Tag filter",
                        selectedTagCount: selectedTags.count,
                        selectedGroupName: selectedGroupName,
                        openTags: { closeInteractions(); showTagFilter() },
                        openGroups: { closeInteractions(); showingGroupPicker = true }
                    )
                    if relevantKind == .attachment { attachmentCategoryToolbar }
                } else {
                    VaultSearchToolbar(query: $query)
                }
            }
            if baseItems.isEmpty {
                if showsRecentItems { recentItemsStrip }
                VaultEmptyState(
                    title: filter == .trash ? t(.trashIsEmpty) : t(.noItems),
                    message: filter == .trash ? t(.deletedRecordsHere) : t(.tapAddRecord),
                    icon: filter == .trash ? "trash" : (category?.icon ?? "lock.square"),
                    compact: false
                )
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        if showsRecentItems { recentItemsStrip }
                        ForEach(baseItems) { item in
                            VaultItemRow(
                                item: item,
                                filter: filter,
                                selected: selectedIDs.contains(item.id),
                                selectionMode: selectionMode,
                                rowInteraction: rowInteraction,
                                swipeResetRequest: interactionResetRequest,
                                expandedSwipeKey: $expandedSwipeKey,
                                onBeginSelection: {
                                    closeInteractions()
                                    selectionMode = true
                                    selectedIDs = [item.id]
                                },
                                onRequestActions: { item, anchor in closeInteractions(); pendingActionItem = item; pendingActionAnchor = anchor },
                                onRequestDelete: { item in requestDelete(item) },
                                onSelect: { selectionMode ? toggleSelection(item.id) : open(item) }
                            )
                        }
                    }
                    .padding(12)
                    .background(GeometryReader { proxy in
                        Color.clear.preference(
                            key: VaultScrollOffsetPreferenceKey.self,
                            value: proxy.frame(in: .named("vault-list-overlay")).minY
                        )
                    })
                }
                .scrollDismissesKeyboard(.interactively)
                .onPreferenceChange(VaultScrollOffsetPreferenceKey.self) { _ in
                    closeInteractions()
                }
                .background(PVTheme.background)
            }
        }
        .background(PVTheme.background)
        .background {
            PVNativeCategorySwipeRecognizer(
                isEnabled: category != nil && filter == .all && !selectionMode && !showingGroupPicker && pendingActionItem == nil && bulkChoice == nil,
                onSwipe: { onCategorySwipe?($0) }
            )
        }
        .coordinateSpace(name: "vault-list-overlay")
        .overlay { anchoredActionMenu }
        .onChange(of: attachmentImportCompletion) { _, _ in
            guard category == .attachment else { return }
            query = ""
            selectedTags.removeAll()
            selectedGroup = nil
            attachmentCategory = nil
            endSelection()
            closeInteractions()
        }
        .onChange(of: interactionResetRequest) { _, _ in
            closeInteractions()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { closeInteractions() }
        }
        .onChange(of: selectionRequest) { _, _ in
            selectionMode = true
            selectedIDs.removeAll()
        }
        .onChange(of: Set(baseItems.map(\.id))) { _, visibleIDs in
            selectedIDs = VaultSelectionPolicy.visibleSelection(selectedIDs, visibleIDs: visibleIDs)
            if let selectedItem, !visibleIDs.contains(selectedItem.id) {
                self.selectedItem = nil
            }
        }
        .onChange(of: preferences.privacyLevel) { _, level in
            if VaultPrivacyPresentation(level: level).restrictsSensitiveNavigation {
                query = ""; selectedTags.removeAll(); selectedGroup = nil; attachmentCategory = nil; endSelection()
            }
        }
        .onChange(of: relevantKind) { _, nextKind in
            if nextKind != .attachment { attachmentCategory = nil }
        }
        .pvWebModal(isPresented: $confirmingBulkTrash, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: languageStore.language == .simplifiedChinese ? "将 \(selectedIDs.count) 项资料移入恢复中心？" : "Move \(selectedIDs.count) items to Recovery Center?", message: bulkTrashConfirmationMessage, confirmTitle: languageStore.language == .simplifiedChinese ? "移入恢复中心" : "Move to Recovery Center", cancelTitle: t(.cancel), destructive: true, confirm: {
                if model.applyBulk(selectedIDs: selectedIDs, moveToTrash: true) { endSelection(); confirmingBulkTrash = false }
            }, cancel: { confirmingBulkTrash = false })
        }
        .pvWebModal(isPresented: $confirmingBulkPermanentDelete, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: languageStore.language == .simplifiedChinese ? "彻底删除 \(selectedIDs.count) 项资料？" : "Permanently delete \(selectedIDs.count) items?", message: bulkPermanentDeleteConfirmationMessage, confirmTitle: languageStore.language == .simplifiedChinese ? "彻底删除" : "Delete Permanently", cancelTitle: t(.cancel), destructive: true, confirm: {
                if model.deletePermanently(ids: selectedIDs) { endSelection(); confirmingBulkPermanentDelete = false }
            }, cancel: { confirmingBulkPermanentDelete = false })
        }
        .pvWebModal(isPresented: $confirmingEmptyTrash, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: languageStore.language == .simplifiedChinese ? "清空恢复中心？" : "Empty Recovery Center?", message: emptyTrashConfirmationMessage, confirmTitle: languageStore.language == .simplifiedChinese ? "永久清空" : "Empty Permanently", cancelTitle: t(.cancel), destructive: true, confirm: {
                if model.emptyTrash() { confirmingEmptyTrash = false }
            }, cancel: { confirmingEmptyTrash = false })
        }
        .pvWebModal(isPresented: Binding(get: { pendingRetentionDays != nil }, set: { if !$0 { pendingRetentionDays = nil } }), maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(
                title: languageStore.language == .simplifiedChinese ? "确认缩短保留期" : "Confirm shorter retention",
                message: retentionConfirmationMessage,
                confirmTitle: t(.delete), cancelTitle: t(.cancel), destructive: true,
                confirm: applyPendingRetention,
                cancel: { pendingRetentionDays = nil }
            )
        }
        .pvWebModal(isPresented: $showingGroupPicker, maxWidth: 620, sizing: .fit) { groupPickerSheet }
        .pvWebModal(item: $pendingTrashItem, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) { item in
            PVConfirmModal(title: languageStore.language == .simplifiedChinese ? "将“\(item.title.isEmpty ? t(.untitled) : item.title)”移入恢复中心？" : "Move “\(item.title.isEmpty ? t(.untitled) : item.title)” to Recovery Center?", message: singleTrashConfirmationMessage, confirmTitle: languageStore.language == .simplifiedChinese ? "移入恢复中心" : "Move to Recovery Center", cancelTitle: t(.cancel), destructive: true, confirm: {
                if model.moveToTrash(item) { pendingTrashItem = nil }
            }, cancel: { pendingTrashItem = nil })
        }
        .pvWebModal(item: $pendingPermanentDeleteItem, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) { item in
            PVConfirmModal(title: languageStore.language == .simplifiedChinese ? "彻底删除“\(item.title.isEmpty ? t(.untitled) : item.title)”？" : "Permanently delete “\(item.title.isEmpty ? t(.untitled) : item.title)”?", message: singlePermanentDeleteConfirmationMessage, confirmTitle: languageStore.language == .simplifiedChinese ? "彻底删除" : "Delete Permanently", cancelTitle: t(.cancel), destructive: true, confirm: {
                if model.deletePermanently(item) { pendingPermanentDeleteItem = nil }
            }, cancel: { pendingPermanentDeleteItem = nil })
        }
        .pvWebModal(isPresented: $confirmingGroupDelete, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: languageStore.language == .simplifiedChinese ? "删除分组？" : "Delete Group?", message: groupDeleteConfirmationMessage, confirmTitle: languageStore.language == .simplifiedChinese ? "删除分组" : "Delete Group", cancelTitle: t(.cancel), destructive: true, confirm: deleteEditingGroup, cancel: { confirmingGroupDelete = false })
        }
        .pvWebModal(isPresented: Binding(get: { bulkChoice != nil }, set: { if !$0 { bulkChoice = nil } }), maxWidth: 520, sizing: .capped) { bulkChoiceSheet }
    }

    private func closeInteractions() {
        pendingActionItem = nil
        expandedSwipeKey = nil
    }

    private func open(_ item: VaultItem) {
        closeInteractions()
        guard !VaultPrivacyPresentation(level: preferences.privacyLevel).restrictsSensitiveNavigation else { return }
        selectedItem = model.markOpened(item)
        onOpenDetail?()
    }

    private var searchPrompt: String {
        let zh = languageStore.language == .simplifiedChinese
        switch relevantKind {
        case .account: return zh ? "搜索名称、账号和内容" : "Search names, accounts, and content"
        case .website: return zh ? "搜索名称、网址和内容" : "Search names, URLs, and content"
        case .secureNote: return zh ? "搜索标题和正文" : "Search titles and note text"
        case .totp: return zh ? "搜索名称、账号和标签" : "Search names, accounts, and tags"
        case .attachment: return zh ? "搜索文件名和标签" : "Search filenames and tags"
        case .custom: return zh ? "搜索名称和自定义字段" : "Search names and custom fields"
        case nil: return zh ? "搜索名称、账号和内容" : "Search names, accounts, and content"
        }
    }

    private var recentItems: [VaultItem] {
        guard let relevantKind else { return [] }
        return model.vault.items
            .filter { !$0.isDeleted && $0.kind == relevantKind && $0.lastOpenedAt != nil }
            .sorted { $0.lastOpenedAt! > $1.lastOpenedAt! }
            .prefix(5)
            .map { $0 }
    }

    private var showsRecentItems: Bool {
        filter == .all && query.isEmpty && !selectionMode && !recentItems.isEmpty
    }

    private var recentItemsStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(languageStore.language == .simplifiedChinese ? "最近查看" : "Recently viewed")
                .font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(recentItems) { item in
                        Button(privacyRecentTitle(item)) { open(item) }
                            .buttonStyle(PVButtonStyle(role: .secondary))
                            .accessibilityIdentifier("recent-item-\(item.id.uuidString)")
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
        .accessibilityIdentifier("recent-items")
    }

    private func privacyRecentTitle(_ item: VaultItem) -> String {
        VaultPrivacyPresentation(level: preferences.privacyLevel).hidesTitle
            ? t(.record)
            : (item.title.isEmpty ? t(.untitled) : item.title)
    }

    private var sheetHeader: some View {
        HStack(spacing: 12) {
            if let back = productBackAction {
                Button(action: back) {
                    Image(systemName: "chevron.left").frame(width: 44, height: 44).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("back-product-modal")
                .accessibilityLabel(languageStore.language == .simplifiedChinese ? "返回" : "Back")
            }
            Text(sheetTitle).font(.title2.bold())
            Spacer()
            if filter == .trash && !baseItems.isEmpty {
                Button(t(.empty), role: .destructive) { confirmingEmptyTrash = true }
                    .buttonStyle(PVButtonStyle(role: .destructive))
            }
            Button(action: dismiss) {
                Image(systemName: "xmark").frame(width: 44, height: 44).contentShape(Rectangle())
            }
                .accessibilityIdentifier("close-product-modal")
                .accessibilityLabel(t(.cancel))
                .buttonStyle(.plain)
        }
        .padding(16).background(PVTheme.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
    private var sheetTitle: String {
        if let kind { return L10n.kind(kind, language: languageStore.language) }
        return switch filter { case .all: t(.vault); case .favorites: t(.favorites); case .recent: t(.recent); case .trash: t(.trash) }
    }

    private var trashRetentionToolbar: some View {
        HStack(spacing: 10) {
            Image(systemName: "calendar.badge.clock").foregroundStyle(PVTheme.accent)
            Text(languageStore.language == .simplifiedChinese ? "自动清理" : "Auto-delete").font(.subheadline.weight(.semibold))
            Spacer()
            PVChoiceField(
                title: languageStore.language == .simplifiedChinese ? "自动清理" : "Auto-delete",
                icon: "calendar.badge.clock",
                selection: $retentionSelection,
                options: [
                    PVChoiceOption(0, languageStore.language == .simplifiedChinese ? "永久保留" : "Keep forever"),
                    PVChoiceOption(7, languageStore.language == .simplifiedChinese ? "7 天" : "7 days"),
                    PVChoiceOption(30, languageStore.language == .simplifiedChinese ? "30 天" : "30 days"),
                    PVChoiceOption(90, languageStore.language == .simplifiedChinese ? "90 天" : "90 days")
                ],
                onSelect: { requestRetentionChange(retentionSelection) }
            )
            .frame(maxWidth: 220)
            .onAppear { retentionSelection = preferences.trashRetentionDays }
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .background(PVTheme.surfaceSoft)
    }

    private var attachmentCategoryToolbar: some View {
        PVChoiceField(
            title: languageStore.language == .simplifiedChinese ? "附件分类" : "Attachment category",
            icon: "paperclip",
            selection: $attachmentCategory,
            options: [
                PVChoiceOption(AttachmentCategory?.none, languageStore.language == .simplifiedChinese ? "全部附件" : "All attachments"),
                PVChoiceOption(Optional(AttachmentCategory.image), languageStore.language == .simplifiedChinese ? "图片" : "Images"),
                PVChoiceOption(Optional(AttachmentCategory.video), languageStore.language == .simplifiedChinese ? "视频" : "Videos"),
                PVChoiceOption(Optional(AttachmentCategory.other), languageStore.language == .simplifiedChinese ? "其他" : "Other")
            ]
        )
        .frame(maxWidth: .infinity)
        .accessibilityIdentifier("attachment-category-filter")
        .padding(.horizontal, 8).padding(.top, 8).padding(.bottom, 8)
        .background(PVTheme.surfaceSoft)
    }

    private var bulkTrashConfirmationMessage: String {
        languageStore.language == .simplifiedChinese
            ? "所选资料会移入恢复中心，可在恢复中心恢复；到达自动清理期限后将被永久删除。"
            : "The selected items will move to Recovery Center and can be restored there until the retention period expires."
    }
    private var bulkPermanentDeleteConfirmationMessage: String {
        languageStore.language == .simplifiedChinese ? "所选资料及其附件将被永久删除。此操作无法撤销。" : "The selected items and their attachments will be permanently deleted. This cannot be undone."
    }
    private var emptyTrashConfirmationMessage: String {
        languageStore.language == .simplifiedChinese ? "恢复中心中的所有资料及附件将被永久删除。此操作无法撤销。" : "Every item and attachment in Recovery Center will be permanently deleted. This cannot be undone."
    }
    private var singleTrashConfirmationMessage: String {
        languageStore.language == .simplifiedChinese ? "该资料会移入恢复中心，之后仍可恢复。" : "This item will move to Recovery Center and can be restored later."
    }
    private var singlePermanentDeleteConfirmationMessage: String {
        languageStore.language == .simplifiedChinese ? "该资料及其附件将被永久删除。此操作无法撤销。" : "This item and its attachments will be permanently deleted. This cannot be undone."
    }
    private var groupDeleteConfirmationMessage: String {
        languageStore.language == .simplifiedChinese ? "删除分组后，其中的资料会返回默认分组，资料本身不会删除。" : "Items in this group will return to the default group; the items themselves will not be deleted."
    }

    private var retentionConfirmationMessage: String {
        let count = pendingRetentionDays.map { model.expiredTrashCount(retentionDays: $0) } ?? 0
        return languageStore.language == .simplifiedChinese
            ? "此设置会立即永久删除 \(count) 条已超过保留期的资料，且无法撤销。"
            : "This immediately and permanently deletes \(count) item(s) older than the retention period. This cannot be undone."
    }

    private func requestRetentionChange(_ days: Int) {
        let old = preferences.trashRetentionDays
        guard old != days else { return }
        let shortens = days > 0 && (old == 0 || days < old)
        if shortens && model.expiredTrashCount(retentionDays: days) > 0 {
            retentionSelection = old
            previousRetentionDays = old
            pendingRetentionDays = days
        } else {
            preferences.trashRetentionDays = days
            if filter == .trash { _ = model.purgeExpiredTrash(retentionDays: days) }
        }
    }

    private func applyPendingRetention() {
        guard let days = pendingRetentionDays else { return }
        let expected = model.expiredTrashCount(retentionDays: days)
        preferences.trashRetentionDays = days
        retentionSelection = days
        let removed = model.purgeExpiredTrash(retentionDays: days)
        guard removed == expected else {
            preferences.trashRetentionDays = previousRetentionDays
            return
        }
        pendingRetentionDays = nil
    }

    private var selectionToolbar: some View {
        HStack {
            Button(selectionMode ? t(.cancel) : (languageStore.language == .simplifiedChinese ? "选择" : "Select")) {
                selectionMode.toggle()
                if !selectionMode { selectedIDs.removeAll() }
            }.buttonStyle(PVButtonStyle(role: .secondary))
            if selectionMode {
                Text("\(selectedIDs.count)/\(baseItems.count)").font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted)
                Spacer()
                Button(t(.allItems)) { selectedIDs = Set(baseItems.map(\.id)) }.buttonStyle(PVButtonStyle(role: .secondary))
            }
        }.padding(.horizontal, 8).padding(.vertical, 6).background(PVTheme.surfaceSoft)
            .accessibilityIdentifier("bulk-selection-toolbar")
    }

    @ViewBuilder private var bulkToolbar: some View {
        if filter == .trash {
            HStack(spacing: 8) {
                Button(t(.restore), systemImage: "arrow.uturn.backward") {
                    if model.applyBulk(selectedIDs: selectedIDs, restoreFromTrash: true) { endSelection() }
                }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                Button(t(.delete), systemImage: "trash", role: .destructive) { confirmingBulkPermanentDelete = true }
                    .buttonStyle(PVButtonStyle(role: .destructive, fillsWidth: true))
            }.padding(8).background(PVTheme.selected)
        } else {
            HStack(spacing: 8) { primaryBulkActions }
                .padding(8).background(PVTheme.selected)
        }
    }

    @ViewBuilder private var primaryBulkActions: some View {
        Button { bulkChoice = .favorite } label: { Image(systemName: "star") }.buttonStyle(PVIconButtonStyle())
        Button { bulkChoice = .pinned } label: { Image(systemName: "pin") }.buttonStyle(PVIconButtonStyle())
        Button { bulkChoice = .group } label: { Label(languageStore.language == .simplifiedChinese ? "设置分组" : "Set Group", systemImage: "square.stack.3d.up") }
            .buttonStyle(PVButtonStyle(role: .secondary)).disabled(relevantKind == nil)
        Button { bulkChoice = .tags } label: { Label(languageStore.language == .simplifiedChinese ? "设置标签" : "Set Tags", systemImage: "tag") }
            .buttonStyle(PVButtonStyle(role: .secondary))
        Spacer(minLength: 0)
        Button { confirmingBulkTrash = true } label: { Image(systemName: "trash") }.buttonStyle(PVIconButtonStyle())
    }

    private var parsedBulkTags: [String] { availableTags.map(\.name).filter(selectedBulkTags.contains) }

    private var selectedGroupName: String {
        guard let selectedGroup else { return languageStore.language == .simplifiedChinese ? "全部" : "All" }
        if selectedGroup.isEmpty { return t(.defaultGroup) }
        return availableGroups.first(where: { $0.id.uuidString == selectedGroup })?.name ?? t(.defaultGroup)
    }

    @ViewBuilder private var bulkChoiceSheet: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: languageStore.language == .simplifiedChinese ? "批量操作" : "Bulk Action", cancelTitle: t(.cancel)) { bulkChoice = nil }
            VStack(spacing: 8) {
                switch bulkChoice {
                case .favorite:
                    actionButton(t(.favorite), icon: "star.fill") { applyBulkChoice(favorite: true) }
                    actionButton(t(.unfavorite), icon: "star") { applyBulkChoice(favorite: false) }
                case .pinned:
                    actionButton(t(.pin), icon: "pin.fill") { applyBulkChoice(pinned: true) }
                    actionButton(t(.unpin), icon: "pin") { applyBulkChoice(pinned: false) }
                case .group:
                    actionButton(t(.defaultGroup), icon: "square.stack.3d.up") { applyBulkChoice(group: "") }
                    ForEach(availableGroups) { group in actionButton(group.name, icon: "square.stack.3d.up") { applyBulkChoice(group: group.id.uuidString) } }
                    PVField(title: languageStore.language == .simplifiedChinese ? "新建分组" : "New Group") { TextField(languageStore.language == .simplifiedChinese ? "分组名称" : "Group name", text: $groupName) }
                    Button(languageStore.language == .simplifiedChinese ? "新建并应用" : "Create & Apply", systemImage: "plus") { createBulkGroupAndApply() }
                        .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(cleanGroupName.isEmpty)
                case .tags:
                    bulkTagEditor
                case nil: EmptyView()
                }
            }.padding(16)
        }
    }

    @ViewBuilder private var bulkTagEditor: some View {
        ForEach(availableTags) { tag in
            Button {
                if selectedBulkTags.remove(tag.name) == nil { selectedBulkTags.insert(tag.name) }
            } label: {
                HStack {
                    Circle().fill(Color(hex: tag.colorHex)).frame(width: 12, height: 12)
                    Text(tag.name)
                    Spacer()
                    Image(systemName: selectedBulkTags.contains(tag.name) ? "checkmark.circle.fill" : "circle")
                }.contentShape(Rectangle())
            }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
        }
        PVField(title: languageStore.language == .simplifiedChinese ? "新建标签" : "New Tag") { TextField(languageStore.language == .simplifiedChinese ? "标签名称" : "Tag name", text: $bulkNewTag) }
        Button(languageStore.language == .simplifiedChinese ? "新建并选中" : "Create & Select", systemImage: "plus") { createBulkTagAndSelect() }
            .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)).disabled(bulkNewTag.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        HStack(spacing: 8) {
            Button(languageStore.language == .simplifiedChinese ? "添加标签" : "Add Tags") { applyBulkChoice(addTags: parsedBulkTags) }
                .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(parsedBulkTags.isEmpty)
            Button(languageStore.language == .simplifiedChinese ? "移除标签" : "Remove Tags") { applyBulkChoice(removeTags: parsedBulkTags) }
                .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)).disabled(parsedBulkTags.isEmpty)
        }
    }

    private func applyBulkChoice(favorite: Bool? = nil, pinned: Bool? = nil, group: String? = nil, addTags: [String] = [], removeTags: [String] = []) {
        if model.applyBulk(selectedIDs: selectedIDs, favorite: favorite, pinned: pinned, group: group, addTags: addTags, removeTags: removeTags) {
            bulkChoice = nil; endSelection()
        }
    }

    private func createBulkGroupAndApply() {
        guard let kind = relevantKind else { return }
        let name = cleanGroupName
        guard model.updateOrganization({ $0.groupRegistry.create(name: name, kind: kind) }),
              let group = model.vault.groupRegistry.groups(for: kind).first(where: { $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame }) else { return }
        groupName = ""
        applyBulkChoice(group: group.id.uuidString)
    }

    private func createBulkTagAndSelect() {
        guard let clean = TagPolicy.normalizedName(bulkNewTag), model.updateOrganization({ $0.tagRegistry.create(name: clean) }) else { return }
        let canonical = model.vault.tagRegistry.tags.first(where: { $0.name.localizedCaseInsensitiveCompare(clean) == .orderedSame })?.name ?? clean
        selectedBulkTags.insert(canonical)
        bulkNewTag = ""
    }

    private func showTagFilter() {
        precondition(presentOverlay != nil, "Tag filter requires the root overlay host")
        guard let presentOverlay else { return }
        presentOverlay(AnyView(VaultTagFilterSurface(initialTags: selectedTags, initialModeIsAll: tagFilterMode == .all, close: { presentOverlay(nil) }, apply: { tags, isAll in
            selectedTags = tags; tagFilterMode = isAll ? .all : .any
        })))
    }

    private var groupPickerSheet: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: t(.group), cancelTitle: t(.cancel)) { showingGroupPicker = false }
            ScrollView {
                LazyVStack(spacing: 8) {
                    groupChoiceRow(name: languageStore.language == .simplifiedChinese ? "全部" : "All", count: model.vault.items.filter { relevantKind == nil || $0.kind == relevantKind }.count, value: nil)
                    groupChoiceRow(name: t(.defaultGroup), count: model.vault.items.filter { (relevantKind == nil || $0.kind == relevantKind) && $0.group.isEmpty }.count, value: "")
                    ForEach(availableGroups) { group in
                        HStack(spacing: 8) {
                            Button {
                                selectedGroup = group.id.uuidString; showingGroupPicker = false
                            } label: {
                                HStack { Text("\(group.name)（\(groupCount(group))）"); Spacer(); if selectedGroup == group.id.uuidString { Image(systemName: "checkmark") } }
                            }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                            Button(languageStore.language == .simplifiedChinese ? "重命名" : "Rename") { editingGroup = group; groupName = group.name }
                                .buttonStyle(PVButtonStyle(role: .secondary))
                            Button(t(.delete), role: .destructive) { editingGroup = group; confirmingGroupDelete = true }
                                .buttonStyle(PVButtonStyle(role: .destructive))
                        }
                    }
                }.padding(16)
            }
            .frame(maxHeight: .infinity)
            .scrollIndicators(.visible)
            Divider()
            VStack(spacing: 10) {
                TextField(languageStore.language == .simplifiedChinese ? "新分组名称" : "New group name", text: $groupName).textFieldStyle(.roundedBorder)
                HStack {
                    if editingGroup != nil {
                        Button(t(.cancel)) { editingGroup = nil; groupName = "" }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                    }
                    Button(editingGroup == nil ? (languageStore.language == .simplifiedChinese ? "创建分组" : "Create Group") : (languageStore.language == .simplifiedChinese ? "保存重命名" : "Save Rename")) { saveGroup() }
                        .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(cleanGroupName.isEmpty || relevantKind == nil)
                }
            }
            .padding(16)
            .background(PVTheme.surface)
        }
    }

    private func selectorChoice(_ title: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) { Text(title).frame(maxWidth: .infinity, minHeight: 44) }
            .buttonStyle(PVButtonStyle(role: selected ? .primary : .secondary, fillsWidth: true))
    }

    private func actionButton(_ title: String, icon: String, destructive: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(title, systemImage: icon).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }
            .buttonStyle(PVButtonStyle(role: destructive ? .destructive : .secondary, fillsWidth: true))
    }

    private func groupChoiceRow(name: String, count: Int, value: String?) -> some View {
        Button {
            selectedGroup = value
            showingGroupPicker = false
        } label: {
            HStack { Text("\(name)（\(count)）"); Spacer(); if selectedGroup == value { Image(systemName: "checkmark") } }
        }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
    }

    private func groupCount(_ group: GroupDefinition) -> Int {
        model.vault.items.filter { $0.kind == relevantKind && $0.group == group.id.uuidString && !$0.isDeleted }.count
    }

    private var cleanGroupName: String { groupName.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func saveGroup() {
        guard let relevantKind else { return }
        let succeeded = model.updateOrganization { vault in
            if let editingGroup { _ = vault.groupRegistry.rename(groupID: editingGroup.id, kind: relevantKind, to: cleanGroupName) }
            else { vault.groupRegistry.create(name: cleanGroupName, kind: relevantKind) }
        }
        if succeeded { editingGroup = nil; groupName = "" }
    }

    private func deleteEditingGroup() {
        guard let relevantKind, let editingGroup else { return }
        let succeeded = model.updateOrganization { vault in
            vault.items = vault.groupRegistry.delete(groupID: editingGroup.id, kind: relevantKind, items: vault.items)
        }
        if succeeded {
            if selectedGroup == editingGroup.id.uuidString { selectedGroup = nil }
            self.editingGroup = nil; groupName = ""; confirmingGroupDelete = false
        }
    }

    @ViewBuilder
    private var anchoredActionMenu: some View {
        if rowInteraction == .actions, let item = pendingActionItem {
            GeometryReader { proxy in
                ZStack(alignment: .topTrailing) {
                    Color.black.opacity(0.001)
                        .contentShape(Rectangle())
                        .accessibilityElement()
                        .accessibilityIdentifier("anchored-item-menu-backdrop")
                        .accessibilityLabel(languageStore.language == .simplifiedChinese ? "关闭操作菜单" : "Close action menu")
                        .onTapGesture { withAnimation(.easeOut(duration: 0.14)) { pendingActionItem = nil } }
                    PVAnchoredItemMenu(
                        favoriteTitle: item.isFavorite ? t(.unfavorite) : t(.favorite),
                        pinTitle: item.isPinned ? t(.unpin) : t(.pin),
                        editTitle: t(.editItem),
                        deleteTitle: t(.delete),
                        favorite: { updateMarker(item, favorite: !item.isFavorite) },
                        pin: { updateMarker(item, pinned: !item.isPinned) },
                        edit: {
                            pendingActionItem = nil
                            onEditItem?(item)
                        },
                        delete: { pendingActionItem = nil; requestDelete(item) }
                    )
                    .position(menuPosition(in: proxy.size))
                }
            }
            .zIndex(900)
        }
    }

    private func menuPosition(in size: CGSize) -> CGPoint {
        let width: CGFloat = 178
        let height: CGFloat = 186
        let x = min(size.width - width / 2 - 12, max(width / 2 + 12, pendingActionAnchor.maxX - width / 2))
        let preferredY = pendingActionAnchor.maxY + height / 2 + 6
        let fitsBelow = pendingActionAnchor.maxY + height + 6 <= size.height - 12
        let y = fitsBelow ? preferredY : max(height / 2 + 12, pendingActionAnchor.minY - height / 2 - 6)
        return CGPoint(x: x, y: y)
    }

    private func requestDelete(_ item: VaultItem) {
        if filter == .trash { pendingPermanentDeleteItem = item }
        else { pendingTrashItem = item }
    }

    private func updateMarker(_ item: VaultItem, favorite: Bool? = nil, pinned: Bool? = nil) {
        var changed = item
        if let favorite { changed.isFavorite = favorite }
        if let pinned { changed.isPinned = pinned }
        if model.save(changed) { pendingActionItem = nil }
    }

    private func toggleSelection(_ id: UUID) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) } else { selectedIDs.insert(id) }
    }

    private func endSelection() {
        selectedIDs.removeAll(); bulkNewTag = ""; selectedBulkTags.removeAll(); selectionMode = false
    }
}

private struct VaultSearchToolbar: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Binding var query: String
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: "magnifyingglass").foregroundStyle(PVTheme.muted)
            TextField(t(.searchPrompt), text: $query).textInputAutocapitalization(.never)
            if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }.foregroundStyle(PVTheme.muted) }
        }
        .padding(.horizontal, 10).frame(minWidth: 0, minHeight: PVTheme.minimumControlHeight)
        .background(PVTheme.surface).overlay(RoundedRectangle(cornerRadius: 9).stroke(PVTheme.inputLine)).clipShape(RoundedRectangle(cornerRadius: 9))
        .padding(8).background(PVTheme.surfaceSoft)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
}

private struct VaultFilterToolbar: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Binding var query: String
    let searchPrompt: String
    let tagFilterTitle: String
    let selectedTagCount: Int
    let selectedGroupName: String
    let openTags: () -> Void
    let openGroups: () -> Void
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        HStack(spacing: 7) {
            HStack(spacing: 7) {
                Image(systemName: "magnifyingglass").foregroundStyle(PVTheme.muted)
                TextField(searchPrompt, text: $query).textInputAutocapitalization(.never)
                if !query.isEmpty { Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }.foregroundStyle(PVTheme.muted) }
            }
            .padding(.horizontal, 10).frame(minWidth: 0, minHeight: PVTheme.minimumControlHeight)
            .background(PVTheme.surface).overlay(RoundedRectangle(cornerRadius: 9).stroke(PVTheme.inputLine)).clipShape(RoundedRectangle(cornerRadius: 9))
            Button(action: openTags) {
                HStack(spacing: 5) {
                    Image(systemName: selectedTagCount == 0 ? "tag" : "tag.fill")
                    Text(selectedTagCount == 0 ? tagFilterTitle : "\(t(.tags)) \(selectedTagCount)")
                        .lineLimit(1)
                }
            }.buttonStyle(PVButtonStyle(role: selectedTagCount == 0 ? .secondary : .primary)).accessibilityIdentifier("open-tag-filter")
            Button(action: openGroups) {
                HStack(spacing: 5) {
                    Image(systemName: "square.stack.3d.up")
                    Text(selectedGroupName).lineLimit(1)
                }
            }.buttonStyle(PVButtonStyle(role: .secondary)).accessibilityIdentifier("open-group-picker")
        }
        .padding(8).background(PVTheme.surfaceSoft)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
}

private struct RecoveryCenterView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @Environment(\.pvModalDismiss) private var dismiss
    @Environment(\.pvModalBack) private var back
    @State private var query = ""
    @State private var selectedIDs = Set<UUID>()
    @State private var pendingPermanentDeleteItem: VaultItem?
    @State private var confirmingEmpty = false
    @State private var confirmingBulkDelete = false
    @State private var pendingRetentionDays: Int?
    @State private var previousRetentionDays = 30

    private var items: [VaultItem] {
        let deleted = model.vault.items.filter(\.isDeleted)
        let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return deleted }
        return deleted.filter { $0.title.localizedCaseInsensitiveContains(clean) || ($0.attachmentName?.localizedCaseInsensitiveContains(clean) ?? false) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                if let back {
                    Button(action: back) { Image(systemName: "chevron.left").frame(width: 44, height: 44).contentShape(Rectangle()) }
                        .buttonStyle(.plain).accessibilityIdentifier("back-product-modal")
                }
                Text(zh ? "恢复中心" : "Recovery Center").font(.title2.bold())
                Spacer()
                if !items.isEmpty {
                    Button(zh ? "清空" : "Empty", role: .destructive) { confirmingEmpty = true }
                        .buttonStyle(PVButtonStyle(role: .destructive))
                }
                Button(action: dismiss) { Image(systemName: "xmark").frame(width: 44, height: 44).contentShape(Rectangle()) }
                    .buttonStyle(.plain).accessibilityIdentifier("close-product-modal")
            }
            .padding(16).background(PVTheme.surface)
            recoveryRetentionToolbar
            recoveryBulkToolbar
            VaultSearchToolbar(query: $query)
            if items.isEmpty {
                VaultEmptyState(title: zh ? "恢复中心为空" : "Recovery Center is Empty", message: zh ? "删除的资料会显示在这里。" : "Deleted records appear here.", icon: "trash", compact: true)
            } else {
                ScrollView {
                    LazyVStack(spacing: 8) {
                        ForEach(items) { item in
                            RecoveryCenterItemRow(
                                item: item,
                                retentionDays: preferences.trashRetentionDays,
                                isSelected: selectedIDs.contains(item.id),
                                onToggleSelection: { toggleSelection(item.id) },
                                onRestore: { restoreFromRecoveryCenter(item) },
                                onPermanentDelete: { pendingPermanentDeleteItem = item }
                            )
                        }
                    }.padding(12)
                }.background(PVTheme.background)
            }
        }
        .background(PVTheme.background)
        .pvWebModal(item: $pendingPermanentDeleteItem, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) { item in
            PVConfirmModal(title: zh ? "彻底删除“\(item.title)”？" : "Permanently delete “\(item.title)”?", message: zh ? "该资料及附件将永久删除，无法撤销。" : "This record and its attachments will be permanently deleted. This cannot be undone.", confirmTitle: zh ? "彻底删除" : "Delete Permanently", cancelTitle: zh ? "取消" : "Cancel", destructive: true, confirm: {
                if model.deletePermanently(item) { selectedIDs.remove(item.id); pendingPermanentDeleteItem = nil }
            }, cancel: { pendingPermanentDeleteItem = nil })
        }
        .pvWebModal(isPresented: $confirmingEmpty, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: zh ? "清空恢复中心？" : "Empty Recovery Center?", message: zh ? "所有资料及附件将永久删除，无法撤销。" : "All records and attachments will be permanently deleted. This cannot be undone.", confirmTitle: zh ? "永久清空" : "Empty Permanently", cancelTitle: zh ? "取消" : "Cancel", destructive: true, confirm: {
                if model.emptyTrash() { selectedIDs.removeAll(); confirmingEmpty = false }
            }, cancel: { confirmingEmpty = false })
        }
        .pvWebModal(isPresented: $confirmingBulkDelete, maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: zh ? "彻底删除 \(selectedIDs.count) 项资料？" : "Permanently delete \(selectedIDs.count) items?", message: zh ? "所选资料及其附件将被永久删除。此操作无法撤销。" : "The selected items and attachments will be permanently deleted. This cannot be undone.", confirmTitle: zh ? "彻底删除" : "Delete Permanently", cancelTitle: zh ? "取消" : "Cancel", destructive: true, confirm: {
                if model.deletePermanently(ids: selectedIDs) { selectedIDs.removeAll(); confirmingBulkDelete = false }
            }, cancel: { confirmingBulkDelete = false })
        }
        .pvWebModal(isPresented: Binding(get: { pendingRetentionDays != nil }, set: { if !$0 { pendingRetentionDays = nil } }), maxWidth: 440, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: zh ? "确认缩短保留期" : "Confirm shorter retention", message: retentionConfirmationMessage, confirmTitle: zh ? "确认并清理" : "Confirm & Delete", cancelTitle: zh ? "取消" : "Cancel", destructive: true, confirm: applyPendingRetention, cancel: { pendingRetentionDays = nil })
        }
    }

    private var zh: Bool { languageStore.language == .simplifiedChinese }

    private var recoveryRetentionToolbar: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(retentionSummary).font(.caption).foregroundStyle(PVTheme.muted)
                .accessibilityIdentifier("recovery-retention-summary")
            HStack(spacing: 6) {
                ForEach([7, 30, 90, 0], id: \.self) { days in
                    Button(retentionLabel(days)) { requestRetentionChange(days) }
                        .buttonStyle(PVButtonStyle(role: preferences.trashRetentionDays == days ? .primary : .secondary, fillsWidth: true))
                        .accessibilityIdentifier("recovery-retention-choice-\(days)")
                }
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10).background(PVTheme.surfaceSoft)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }

    private var recoveryBulkToolbar: some View {
        HStack(spacing: 8) {
            Button(zh ? "全选" : "Select All") { selectedIDs = selectedIDs.count == items.count ? [] : Set(items.map(\.id)) }
                .buttonStyle(PVButtonStyle(role: .secondary)).accessibilityIdentifier("recovery-select-all")
            Spacer(minLength: 0)
            Button(zh ? "恢复所选" : "Restore Selected") {
                if model.applyBulk(selectedIDs: selectedIDs, restoreFromTrash: true) { selectedIDs.removeAll() }
            }.buttonStyle(PVButtonStyle(role: .secondary)).disabled(selectedIDs.isEmpty).accessibilityIdentifier("recovery-restore-selected")
            Button(zh ? "彻底删除所选" : "Delete Selected", role: .destructive) { confirmingBulkDelete = true }
                .buttonStyle(PVButtonStyle(role: .destructive)).disabled(selectedIDs.isEmpty).accessibilityIdentifier("recovery-delete-selected")
        }
        .padding(.horizontal, 12).padding(.vertical, 8).background(PVTheme.surfaceSoft)
    }

    private var retentionSummary: String {
        preferences.trashRetentionDays == 0
            ? (zh ? "资料永久保留，内容只在本机解密" : "Items are kept forever and decrypted only on this device")
            : (zh ? "资料默认保留 \(preferences.trashRetentionDays) 天，内容只在本机解密" : "Items are kept for \(preferences.trashRetentionDays) days and decrypted only on this device")
    }

    private func retentionLabel(_ days: Int) -> String {
        days == 0 ? (zh ? "永久保留" : "Forever") : (zh ? "\(days) 天" : "\(days) days")
    }

    private var retentionConfirmationMessage: String {
        let count = pendingRetentionDays.map { model.expiredTrashCount(retentionDays: $0) } ?? 0
        return zh ? "此设置会立即永久删除 \(count) 条已超过保留期的资料，且无法撤销。" : "This immediately and permanently deletes \(count) item(s) older than the retention period. This cannot be undone."
    }

    private func requestRetentionChange(_ days: Int) {
        let old = preferences.trashRetentionDays
        guard old != days else { return }
        let shortens = days > 0 && (old == 0 || days < old)
        if shortens && model.expiredTrashCount(retentionDays: days) > 0 {
            previousRetentionDays = old
            pendingRetentionDays = days
        } else {
            preferences.trashRetentionDays = days
            _ = model.purgeExpiredTrash(retentionDays: days)
            reconcileSelection()
        }
    }

    private func applyPendingRetention() {
        guard let days = pendingRetentionDays else { return }
        let expected = model.expiredTrashCount(retentionDays: days)
        preferences.trashRetentionDays = days
        let removed = model.purgeExpiredTrash(retentionDays: days)
        guard removed == expected else { preferences.trashRetentionDays = previousRetentionDays; return }
        reconcileSelection()
        pendingRetentionDays = nil
    }

    private func reconcileSelection() {
        selectedIDs.formIntersection(Set(model.vault.items.filter(\.isDeleted).map(\.id)))
    }

    private func toggleSelection(_ id: UUID) {
        if selectedIDs.remove(id) == nil { selectedIDs.insert(id) }
    }

    private func restoreFromRecoveryCenter(_ item: VaultItem) {
        if model.restore(item) { selectedIDs.remove(item.id) }
    }
}

private struct RecoveryCenterItemRow: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    let item: VaultItem
    let retentionDays: Int
    let isSelected: Bool
    let onToggleSelection: () -> Void
    let onRestore: () -> Void
    let onPermanentDelete: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Button(action: onToggleSelection) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isSelected ? PVTheme.accent : PVTheme.muted)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(isSelected ? "Deselect" : "Select")
            Image(systemName: "arrow.uturn.backward.circle").foregroundStyle(PVTheme.accentPressed)
                .frame(width: 36, height: 36).background(PVTheme.selected).clipShape(RoundedRectangle(cornerRadius: 9))
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title.isEmpty ? (languageStore.language == .simplifiedChinese ? "未命名" : "Untitled") : item.title).font(.body.weight(.semibold)).lineLimit(1)
                Text(L10n.kind(item.kind, language: languageStore.language)).font(.caption).foregroundStyle(PVTheme.muted)
                if let deletedAt = item.deletedAt {
                    let metadata = RecoveryRetentionMetadata(deletedAt: deletedAt, retentionDays: retentionDays)
                    Text(recoveryRemainingText(metadata))
                        .font(.caption2)
                        .foregroundStyle(PVTheme.muted)
                        .lineLimit(1)
                        .accessibilityIdentifier("recovery-time-\(item.id.uuidString)")
                }
            }
            Spacer()
            Button(languageStore.language == .simplifiedChinese ? "恢复" : "Restore", action: onRestore)
                .buttonStyle(PVButtonStyle(role: .primary))
                .accessibilityIdentifier("restore-item-\(item.id.uuidString)")
            Button(languageStore.language == .simplifiedChinese ? "永久删除" : "Delete Permanently", role: .destructive, action: onPermanentDelete)
                .buttonStyle(PVButtonStyle(role: .destructive))
                .accessibilityIdentifier("permanent-delete-item-\(item.id.uuidString)")
        }
        .padding(12).frame(minHeight: 78).background(PVTheme.surface)
        .overlay(RoundedRectangle(cornerRadius: PVTheme.cornerRadius).stroke(PVTheme.line))
        .clipShape(RoundedRectangle(cornerRadius: PVTheme.cornerRadius))
    }

    private func recoveryRemainingText(_ metadata: RecoveryRetentionMetadata) -> String {
        guard metadata.expirationDate != nil else {
            return languageStore.language == .simplifiedChinese ? "永久保留" : "Kept permanently"
        }
        let days = metadata.remainingDays ?? 0
        return languageStore.language == .simplifiedChinese
            ? "剩余 \(days) 天"
            : "\(days) day\(days == 1 ? "" : "s") remaining"
    }
}

private struct VaultItemRow: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var preferences: LocalVaultPreferences
    let item: VaultItem
    let filter: VaultListView.Filter
    let selected: Bool
    let selectionMode: Bool
    let rowInteraction: VaultListView.RowInteraction
    let swipeResetRequest: Int
    @Binding var expandedSwipeKey: String?
    let onBeginSelection: () -> Void
    let onRequestActions: (VaultItem, CGRect) -> Void
    let onRequestDelete: (VaultItem) -> Void
    let onSelect: () -> Void
    @State private var rowFrame: CGRect = .zero
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }
    private var privacy: VaultPrivacyPresentation { VaultPrivacyPresentation(level: preferences.privacyLevel) }

    var body: some View {
        switch rowInteraction {
        case .tapOnly:
            rowContent
        case .actions:
            PVSwipeDeleteRow(
            deleteTitle: t(.delete),
            accessibilityID: "swipe-delete-\(item.id.uuidString)",
            resetRequest: swipeResetRequest,
            expansionKey: item.id.uuidString,
            expandedKey: $expandedSwipeKey,
            onDelete: { onRequestDelete(item) }
            ) { rowContent }
        }
    }

    private var rowContent: some View {
        HStack(spacing: 0) {
            if item.kind == .attachment && !selectionMode {
                Button(action: onSelect) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(privacy.hidesTitle ? t(.record) : (item.attachmentName ?? item.title))
                            .font(.body.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
                        Text(privacy.hidesSummary ? "••••••" : attachmentMetadata)
                            .font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted).lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(privacy.level == .off ? (item.attachmentName ?? item.title) : t(.record))
                .accessibilityValue(privacy.level == .off ? attachmentMetadata : "")
                .accessibilityIdentifier("vault-item-\(item.id.uuidString)")
            } else {
                Button(action: onSelect) {
                    HStack(spacing: 11) {
                        if selectionMode {
                            Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                                .font(.title3).foregroundStyle(selected ? PVTheme.accent : PVTheme.muted)
                                .accessibilityIdentifier(selected ? "selected-item-\(item.id.uuidString)" : "unselected-item-\(item.id.uuidString)")
                        }
                        Image(systemName: itemIcon).font(.system(size: 16, weight: .semibold)).foregroundStyle(PVTheme.accentPressed)
                            .frame(width: 36, height: 36).background(PVTheme.selected).clipShape(RoundedRectangle(cornerRadius: 9))
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 5) {
                                Text(privacy.hidesTitle ? t(.record) : (item.title.isEmpty ? t(.untitled) : item.title)).font(.body.weight(.semibold)).lineLimit(1)
                                if item.isPinned { Image(systemName: "pin.fill").font(.caption2).foregroundStyle(PVTheme.accent) }
                                if item.isFavorite { Image(systemName: "star.fill").font(.caption2).foregroundStyle(.orange) }
                            }
                            Text(privacy.hidesSummary ? "••••••" : subtitle).font(.caption).foregroundStyle(PVTheme.muted).lineLimit(1)
                        }
                        Spacer(minLength: 4)
                        if item.kind == .totp && !privacy.hidesSummary {
                            TOTPLiveCodeView(secret: item.totpSecret)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .overlay {
                    if rowInteraction == .actions && !selectionMode && !privacy.restrictsSensitiveNavigation {
                        PVNativeLongPressRecognizer(
                            minimumDuration: 0.45,
                            allowableMovement: 24,
                            onTap: onSelect,
                            onRecognized: handleLongPress
                        )
                        .contentShape(Rectangle())
                        .accessibilityHidden(true)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(privacy.level == .off ? (item.title.isEmpty ? t(.untitled) : item.title) : t(.record))
                .accessibilityValue(privacy.level == .off ? subtitle : "")
                .accessibilityIdentifier("vault-item-\(item.id.uuidString)")
            }
                if rowInteraction == .actions && item.kind != .totp && !selectionMode && !privacy.restrictsSensitiveNavigation {
                    GeometryReader { proxy in
                        Button { onRequestActions(item, proxy.frame(in: .named("vault-list-overlay"))) } label: { Image(systemName: "ellipsis").accessibilityLabel(t(.more)) }
                            .buttonStyle(PVIconButtonStyle())
                            .accessibilityIdentifier("item-actions-\(item.id.uuidString)")
                    }
                    .frame(width: 44, height: 44)
                }
        }
        .padding(.leading, 12).padding(.trailing, 8).frame(minHeight: 66)
        .background(PVTheme.surface).overlay(RoundedRectangle(cornerRadius: PVTheme.cornerRadius).stroke(PVTheme.line)).clipShape(RoundedRectangle(cornerRadius: PVTheme.cornerRadius))
        .background(GeometryReader { proxy in
            Color.clear.onAppear { rowFrame = proxy.frame(in: .named("vault-list-overlay")) }
                .onChange(of: proxy.frame(in: .named("vault-list-overlay"))) { _, frame in rowFrame = frame }
        })
    }

    private func handleLongPress() {
        guard rowInteraction == .actions, !selectionMode, !privacy.restrictsSensitiveNavigation else { return }
        if item.kind == .totp {
            onRequestActions(item, rowFrame)
        } else {
            onBeginSelection()
        }
    }

    private var attachmentMetadata: String {
        let category = AttachmentMetadataPolicy.category(name: item.attachmentName ?? item.title)
        let categoryName: String
        switch category {
        case .image: categoryName = languageStore.language == .simplifiedChinese ? "图片" : "Image"
        case .video: categoryName = languageStore.language == .simplifiedChinese ? "视频" : "Video"
        case .other: categoryName = languageStore.language == .simplifiedChinese ? "其他" : "Other"
        }
        return "\(categoryName) · \(formattedAttachmentSize)"
    }

    private var formattedAttachmentSize: String {
        ByteCountFormatter.string(
            fromByteCount: Int64(item.attachmentData?.count ?? 0),
            countStyle: .file
        )
    }

    private var subtitle: String {
        if item.kind == .attachment { return item.attachmentName ?? t(.kindAttachment) }
        return [item.username, item.url, model.vault.groupName(for: item)].first { !$0.isEmpty } ?? L10n.kind(item.kind, language: languageStore.language)
    }
    private var itemIcon: String { WebVaultCategory.allCases.first { $0.kind == item.kind }?.icon ?? "rectangle.and.pencil.and.ellipsis" }
}

private struct TOTPLiveCodeView: View {
    let secret: String
    private let period = 30

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let elapsed = Int(context.date.timeIntervalSince1970) % period
            let remaining = elapsed == 0 ? period : period - elapsed
            HStack(spacing: 7) {
                Text((try? TOTP.generate(secret: secret, date: context.date, period: period)) ?? "------")
                    .font(.system(.caption, design: .monospaced).bold()).foregroundStyle(PVTheme.accentPressed)
                ZStack {
                    Circle().stroke(PVTheme.line, lineWidth: 3)
                    Circle().trim(from: 0, to: CGFloat(remaining) / CGFloat(period))
                        .stroke(remaining <= 5 ? PVTheme.danger : PVTheme.accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Text("\(remaining)").font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(remaining <= 5 ? PVTheme.danger : PVTheme.muted)
                }.frame(width: 28, height: 28)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(remaining) seconds remaining")
        }
    }
}

private struct VaultTagFilterSurface: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let initialTags: Set<String>
    let initialModeIsAll: Bool
    let close: () -> Void
    let apply: (Set<String>, Bool) -> Void
    @State private var stagedTags: Set<String>
    @State private var modeIsAll: Bool

    init(initialTags: Set<String>, initialModeIsAll: Bool, close: @escaping () -> Void, apply: @escaping (Set<String>, Bool) -> Void) {
        self.initialTags = initialTags; self.initialModeIsAll = initialModeIsAll; self.close = close; self.apply = apply
        _stagedTags = State(initialValue: initialTags); _modeIsAll = State(initialValue: initialModeIsAll)
    }
    private var zh: Bool { languageStore.language == .simplifiedChinese }
    private var tags: [TagDefinition] { model.vault.tagRegistry.tags }

    var body: some View {
        PVWebModal(maxWidth: 520, sizing: .capped, dismissOnBackdrop: true, onDismiss: close) {
            VStack(spacing: 0) {
                PVModalHeader(title: zh ? "标签筛选" : "Tag Filter", cancelTitle: zh ? "取消" : "Cancel", onCancel: close)
                ScrollView { VStack(alignment: .leading, spacing: 12) {
                    Text(zh ? "组合筛选当前分类和分组内的资料" : "Combine tags within the current category and group").font(.subheadline).foregroundStyle(PVTheme.muted)
                    HStack(spacing: 8) {
                        modeButton(zh ? "同时包含全部" : "Include all", isAll: true)
                        modeButton(zh ? "包含任意一个" : "Include any", isAll: false)
                    }
                    if tags.isEmpty { Text(zh ? "还没有标签" : "No tags yet").foregroundStyle(PVTheme.muted).padding(.vertical, 16) }
                    ForEach(tags) { tag in Button { toggle(tag.name) } label: {
                        PVTagIdentityRow(tag: tag, selected: stagedTags.contains(tag.name)) { EmptyView() }
                    }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)) }
                }.padding(16) }
                PVModalFooter {
                    Button(zh ? "清除" : "Clear") { stagedTags.removeAll(); apply([], modeIsAll); close() }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                    Button(zh ? "应用筛选" : "Apply Filter") { apply(stagedTags, modeIsAll); close() }.buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
                }
            }
        }
    }
    private func toggle(_ name: String) { if !stagedTags.insert(name).inserted { stagedTags.remove(name) } }
    private func modeButton(_ title: String, isAll: Bool) -> some View {
        Button(title) { modeIsAll = isAll }.buttonStyle(PVButtonStyle(role: modeIsAll == isAll ? .primary : .secondary, fillsWidth: true))
    }
}

private struct VaultEmptyState: View {
    let title: String
    let message: String
    let icon: String
    var compact = false
    var body: some View {
        VStack {
            if !compact { Spacer(minLength: 28) }
            PVCard {
                VStack(spacing: 12) {
                    Image(systemName: icon).font(.system(size: 30, weight: .medium)).foregroundStyle(PVTheme.accentPressed)
                        .frame(width: 64, height: 64).background(PVTheme.selected).clipShape(RoundedRectangle(cornerRadius: 16))
                    Text(title).font(.title3.bold())
                    Text(message).font(.subheadline).foregroundStyle(PVTheme.muted).multilineTextAlignment(.center)
                }.frame(maxWidth: .infinity)
            }
            .frame(maxWidth: 360).padding(20)
            if !compact { Spacer() }
        }
        .frame(maxWidth: .infinity, maxHeight: compact ? nil : .infinity)
        .background(PVTheme.background)
    }
}

struct VaultEmptyDetail: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }
    var body: some View {
        VaultEmptyState(title: t(.chooseItem), message: t(.contentLocalOnly), icon: "lock.shield")
    }
}

struct VaultDetailView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @Environment(\.openURL) private var openURL
    let onEdit: (VaultItem) -> Void
    var onPreview: ((VaultItem) -> Void)? = nil
    @State private var displayedItem: VaultItem
    @State private var revealedCredentialIDs: Set<UUID> = []

    @State private var exportingAttachment = false
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    init(item: VaultItem, onEdit: @escaping (VaultItem) -> Void, onPreview: ((VaultItem) -> Void)? = nil) {
        self.onEdit = onEdit
        self.onPreview = onPreview
        _displayedItem = State(initialValue: item)
    }

    private var currentItem: VaultItem {
        model.vault.items.first { $0.id == displayedItem.id } ?? displayedItem
    }
    private var privacy: VaultPrivacyPresentation { VaultPrivacyPresentation(level: preferences.privacyLevel) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    Image(systemName: WebVaultCategory.allCases.first { $0.kind == currentItem.kind }?.icon ?? "rectangle.and.pencil.and.ellipsis")
                        .font(.title2).foregroundStyle(PVTheme.accentPressed).frame(width: 46, height: 46).background(PVTheme.selected).clipShape(RoundedRectangle(cornerRadius: 12))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(L10n.kind(currentItem.kind, language: languageStore.language)).font(.caption.bold()).foregroundStyle(PVTheme.muted)
                        Text(privacy.hidesDetail ? t(.record) : (currentItem.title.isEmpty ? t(.untitled) : currentItem.title)).font(.title2.bold()).lineLimit(2)
                    }
                    Spacer()
                    if !privacy.restrictsSensitiveNavigation {
                        Button {
                            var updated = currentItem
                            updated.isFavorite.toggle()
                            if model.save(updated) { displayedItem = updated }
                        } label: { Image(systemName: currentItem.isFavorite ? "star.fill" : "star").frame(width: 44, height: 44) }
                            .buttonStyle(PVIconButtonStyle())
                            .accessibilityLabel(currentItem.isFavorite ? t(.unfavorite) : t(.favorite))
                        Button(t(.editItem)) { onEdit(currentItem) }
                            .accessibilityIdentifier("edit-item")
                            .buttonStyle(PVButtonStyle(role: .secondary))
                    }
                }
                if privacy.hidesDetail {
                    PVCard { Text("••••••••").font(.title3).foregroundStyle(PVTheme.muted).frame(maxWidth: .infinity, alignment: .center) }
                } else if hasVisibleDetailContent {
                    PVCard { VStack(spacing: 0) {
                        if currentItem.kind == .account {
                            ForEach(Array(currentItem.credentials.enumerated()), id: \.element.id) { index, credential in
                                credentialRows(credential, index: index)
                            }
                        }
                        if !currentItem.url.isEmpty { urlDetailRow(t(.website), currentItem.url) }
                        if !currentItem.notes.isEmpty { detailRow(t(.notes), currentItem.notes, copy: false) }
                        if !currentItem.totpSecret.isEmpty { totpRow }
                        if currentItem.kind == .attachment { attachmentRows }
                        ForEach(currentItem.customFields.filter { CustomFieldVisibility.isVisible($0, in: currentItem.customFields) }) { field in customFieldRow(field) }
                    } }
                } else {
                    HStack(spacing: 10) {
                        Image(systemName: "info.circle").foregroundStyle(PVTheme.accent)
                        Text(languageStore.language == .simplifiedChinese ? "此资料还没有可显示的字段，轻点编辑添加内容。" : "This record has no visible fields yet. Tap Edit to add content.")
                            .font(.subheadline).foregroundStyle(PVTheme.muted)
                    }
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(PVTheme.surfaceSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                if !privacy.hidesOrganization && (!currentItem.tags.isEmpty || !currentItem.group.isEmpty) {
                    PVCard { VStack(alignment: .leading, spacing: 9) {
                        if !currentItem.group.isEmpty { Label(model.vault.groupName(for: currentItem), systemImage: "square.stack.3d.up").foregroundStyle(PVTheme.muted) }
                        if !currentItem.tags.isEmpty { ScrollView(.horizontal, showsIndicators: false) { HStack { ForEach(currentItem.tags, id: \.self) { Text($0).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 5).background(PVTheme.selected).clipShape(Capsule()) } } } }
                    } }
                }
            }.padding(16).frame(maxWidth: 720)
        }
        .background(PVTheme.background)
        .fileExporter(isPresented: $exportingAttachment, document: AttachmentDocument(data: currentItem.attachmentData ?? Data()), contentType: .data, defaultFilename: currentItem.attachmentName ?? currentItem.title) { if case .failure = $0 { model.errorMessage = t(.unableExportAttachment) } }

    }

    private var hasVisibleDetailContent: Bool {
        let hasCredentials = currentItem.credentials.contains { !$0.username.isEmpty || !$0.password.isEmpty }
        let hasCustomFields = currentItem.customFields.contains { CustomFieldVisibility.isVisible($0, in: currentItem.customFields) }
        let hasAttachment = currentItem.kind == .attachment && (currentItem.attachmentData != nil || !(currentItem.attachmentName ?? "").isEmpty)
        return hasCredentials || !currentItem.url.isEmpty || !currentItem.notes.isEmpty || !currentItem.totpSecret.isEmpty || hasAttachment || hasCustomFields
    }

    private func detailRow(_ title: String, _ value: String, copy: Bool) -> some View {
        HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) { Text(title).font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted); Text(value).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
            if copy { Button { model.copySecret(value) } label: { Image(systemName: "doc.on.doc").frame(width: 44, height: 44) }.accessibilityLabel(t(.copy)) }
        }.padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }

    private func normalizedWebURL(_ raw: String) -> URL? {
        let clean = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return nil }
        let candidate = clean.contains("://") ? clean : "https://\(clean)"
        guard let url = URL(string: candidate), ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.host != nil else { return nil }
        return url
    }

    private func urlDetailRow(_ title: String, _ value: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 4) { Text(title).font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted); Text(value).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading) }
            Button { model.copySecret(value) } label: { Image(systemName: "doc.on.doc").frame(width: 44, height: 44) }.accessibilityLabel(t(.copy))
            Button { if let url = normalizedWebURL(value) { openURL(url) } } label: { Image(systemName: "safari").frame(width: 44, height: 44) }
                .accessibilityLabel(t(.website)).disabled(normalizedWebURL(value) == nil)
        }.padding(.vertical, 10).overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }

    @ViewBuilder private func customFieldRow(_ field: CustomField) -> some View {
        if field.type == .url {
            urlDetailRow(field.name, field.value)
        } else {
            SecretCustomFieldRow(field: field)
        }
    }
    @ViewBuilder
    private func credentialRows(_ credential: VaultCredential, index: Int) -> some View {
        if !credential.username.isEmpty { detailRow("\(t(.username)) \(index + 1)", credential.username, copy: true) }
        if !credential.password.isEmpty {
            HStack(spacing: 6) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(t(.password)) \(index + 1)").font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted)
                    Text(revealedCredentialIDs.contains(credential.id) ? credential.password : "••••••••")
                        .font(.system(.body, design: .monospaced)).privacySensitive()
                        .accessibilityLabel(t(.password))
                        .accessibilityValue(revealedCredentialIDs.contains(credential.id) ? credential.password : "")
                        .accessibilityHidden(!revealedCredentialIDs.contains(credential.id))
                }
                Spacer()
                Button {
                    if revealedCredentialIDs.remove(credential.id) == nil { revealedCredentialIDs.insert(credential.id) }
                } label: {
                    Image(systemName: revealedCredentialIDs.contains(credential.id) ? "eye.slash" : "eye").frame(width: 44, height: 44)
                }
                .accessibilityLabel(revealedCredentialIDs.contains(credential.id) ? t(.hidePassword) : t(.showPassword))
                Button { model.copySecret(credential.password) } label: { Image(systemName: "doc.on.doc").frame(width: 44, height: 44) }.accessibilityLabel(t(.copy))
            }.padding(.vertical, 8).overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
        }
    }


    private var totpRow: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let code = try? TOTP.generate(secret: currentItem.totpSecret, date: context.date)
            HStack { VStack(alignment: .leading) { Text(t(.authenticator)).font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted); Text(code ?? "------").font(.system(.title2, design: .monospaced).bold()).foregroundStyle(PVTheme.accentPressed).privacySensitive().accessibilityHidden(true) }; Spacer(); Text("\(30 - Int(context.date.timeIntervalSince1970) % 30)s").foregroundStyle(PVTheme.muted); Button(t(.copy)) { if let code { model.copySecret(code) } }.buttonStyle(PVButtonStyle(role: .secondary)).disabled(code == nil) }.padding(.vertical, 9)
        }
    }
    @ViewBuilder private var attachmentRows: some View {
        detailRow(t(.filename), currentItem.attachmentName ?? currentItem.title, copy: false)
        detailRow(t(.size), ByteCountFormatter.string(fromByteCount: Int64(currentItem.attachmentData?.count ?? 0), countStyle: .file), copy: false)
        if let data = currentItem.attachmentData,
           AttachmentPreviewPolicy.previewKind(name: currentItem.attachmentName ?? currentItem.title, data: data) != nil {
            Button { onPreview?(currentItem) } label: { Label(t(.previewFile), systemImage: "eye") }
                .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)).padding(.top, 10)
                .accessibilityIdentifier("preview-attachment")
        }
        Button { exportingAttachment = true } label: { Label(t(.exportFile), systemImage: "square.and.arrow.up") }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)).disabled(currentItem.attachmentData == nil).padding(.top, 10)
    }


}

private struct SecretCustomFieldRow: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let field: CustomField
    @State private var revealed = false
    private var presentation: SecretFieldPresentation { SecretFieldPresentation(field: field) }
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        HStack(alignment: .top, spacing: 6) {
            VStack(alignment: .leading, spacing: 4) {
                Text(field.name).font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted)
                Group {
                    if field.isSecret && !revealed {
                        Text(presentation.displayValue(revealed: false))
                    } else {
                        Text(presentation.displayValue(revealed: true)).textSelection(.enabled)
                    }
                }
                .font(field.isSecret ? .system(.body, design: .monospaced) : .body)
                .frame(maxWidth: .infinity, alignment: .leading)
                .privacySensitive(field.isSecret)
                .accessibilityHidden(field.isSecret)
            }
            if field.isSecret {
                Button { revealed.toggle() } label: {
                    Image(systemName: revealed ? "eye.slash" : "eye").frame(width: 44, height: 44)
                }.accessibilityLabel(revealed ? t(.hidePassword) : t(.showPassword))
            }
            Button { model.copySecret(presentation.copyValue) } label: {
                Image(systemName: "doc.on.doc").frame(width: 44, height: 44)
            }.accessibilityLabel(t(.copy))
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
}
