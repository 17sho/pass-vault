import XCTest

final class VaultPresentationParityTests: XCTestCase {
    private var vaultSource: String {
        get throws {
            let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
            return try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultViews.swift"), encoding: .utf8)
        }
    }

    func testPhoneSelectionToolbarDoesNotUseDesktopDetailPrompt() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("UIDevice.current.userInterfaceIdiom == .pad && proxy.size.width >= 760"))
        XCTAssertFalse(source.contains("Button(selectionMode ? t(.cancel) : t(.chooseItem))"))
        XCTAssertTrue(source.contains("if selectionMode {\n                    selectionToolbar"))
        XCTAssertTrue(source.contains("onBeginSelection: {"))
    }

    func testNewPickerMatchesWebSixChoiceHierarchy() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("private var primaryKinds: [VaultItemKind] { [.account, .website, .secureNote, .totp] }"))
        XCTAssertTrue(source.contains("identifier: \"new-kind-attachment\""))
        XCTAssertTrue(source.contains("identifier: \"new-kind-custom\""))
        XCTAssertEqual(source.components(separatedBy: "ForEach(BuiltInCustomRecordTemplate.allCases)").count - 1, 1)
        XCTAssertTrue(source.contains("showingCustomTemplates = true"))
        XCTAssertTrue(source.contains("ForEach(model.vault.customFieldTemplates)"))
        XCTAssertTrue(source.contains("if showingCustomTemplates {\n            customTemplatePicker"))
        XCTAssertFalse(source.contains(".pvWebModal(isPresented: $showingCustomTemplates"))
        XCTAssertTrue(source.contains("back-custom-template-picker"))
    }

    func testCompactProductModalsRequestContentSizedInsets() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("PVWebModal(\n                maxWidth: productModalWidth"))
        XCTAssertFalse(source.contains("$showingHistory"))
        XCTAssertFalse(source.contains("$showingShare"))
        XCTAssertFalse(source.contains("private var historySheet: some View {\n        NavigationStack"))
        XCTAssertFalse(source.contains("private var shareSheet: some View {\n        NavigationStack"))
        XCTAssertFalse(source.contains(".frame(maxHeight: historySnapshots.isEmpty ? 320 : 640)"))
        XCTAssertFalse(source.contains("ScrollView {\n                        LazyVGrid"))
        XCTAssertFalse(source.contains(".fixedSize(horizontal: false, vertical: !showingCustomTemplates)"))
        XCTAssertFalse(source.contains(".frame(maxHeight: showingCustomTemplates ? 680 : nil"))
        XCTAssertTrue(source.contains("HStack(spacing: 8) { primaryBulkActions }"))
        XCTAssertTrue(source.contains("Button { bulkChoice = .tags }"))
        XCTAssertFalse(source.contains("VStack(spacing: 6) { regularBulkActions }"))
    }

    func testFavoritesAndCustomRecordsUseStableHomeAndModalCallbacks() throws {
        let source = try vaultSource
        XCTAssertFalse(source.contains("NavigationStack { VaultListView(kind: .custom"))
        XCTAssertFalse(source.contains("NavigationStack { VaultListView(filter: .favorites"))
        XCTAssertTrue(source.contains("customRecordsHomePane"))
        XCTAssertTrue(source.contains("VaultListView(filter: .favorites, selectedItem: $selectedItem, rowInteraction: .tapOnly, onOpenDetail:"))
        XCTAssertTrue(source.contains("openItemFromProductRoute()"))
        XCTAssertFalse(source.contains(".disabled(VaultPrivacyPresentation(level: preferences.privacyLevel).restrictsSensitiveNavigation)"), "New and Favorites must not silently become inert when privacy masking is active")
    }

    func testRecoveryCenterUsesDirectModalListAndHomeFiltersStayInteractiveWhenEmpty() throws {
        let source = try vaultSource
        XCTAssertFalse(source.contains("NavigationStack { VaultListView(filter: .trash"))
        XCTAssertTrue(source.contains("case .recoveryCenter:\n            RecoveryCenterView()"))
        XCTAssertFalse(source.contains(".buttonStyle(PVIconButtonStyle()).disabled(tags.isEmpty)"))
        XCTAssertFalse(source.contains(".buttonStyle(PVIconButtonStyle()).disabled(groups.isEmpty)"))
        XCTAssertTrue(source.contains("self.selectedItem = nil"))
        XCTAssertTrue(source.contains("openItemFromProductRoute()"))
    }

    func testAllProductSelectorsUseAppOwnedWebStyleSurfaces() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        for directory in ["App", "Core", "Features", "Storage"] {
            let directoryURL = root.appendingPathComponent(directory)
            let enumerator = FileManager.default.enumerator(at: directoryURL, includingPropertiesForKeys: nil)
            while let url = enumerator?.nextObject() as? URL {
                guard url.pathExtension == "swift" else { continue }
                let source = try String(contentsOf: url, encoding: .utf8)
                XCTAssertFalse(source.range(of: #"\bMenu\s*\{"#, options: .regularExpression) != nil, "System Menu remains in \(url.path)")
                XCTAssertFalse(source.range(of: #"\bPicker\s*\("#, options: .regularExpression) != nil, "System Picker remains in \(url.path)")
                XCTAssertFalse(source.contains(".contextMenu"), "System context menu remains in \(url.path)")
                XCTAssertFalse(source.contains(".confirmationDialog"), "System confirmation dialog remains in \(url.path)")
            }
        }
        let modalSource = try String(contentsOf: root.appendingPathComponent("Features/PVWebModal.swift"), encoding: .utf8)
        XCTAssertTrue(modalSource.contains("struct PVChoiceField<Value: Hashable>: View"))
        XCTAssertTrue(modalSource.contains("struct PVChoiceOverlayContainer<Content: View>: View"))
        XCTAssertTrue(modalSource.contains("@Environment(\\.pvPresentChoiceOverlay) private var presentInHost"))
        XCTAssertFalse(modalSource.contains(".fullScreenCover("), "App-owned windows must never use the system bottom-up cover transition")
        XCTAssertTrue(modalSource.contains(".contentShape(Rectangle())"))
        XCTAssertFalse(modalSource.contains(".allowsHitTesting(!isPresented)"), "A full-screen presentation must not disable hit testing on its own anchor hierarchy")
        XCTAssertFalse(modalSource.contains(".allowsHitTesting(item == nil)"), "Item presentations must not disable hit testing on their own anchor hierarchy")
        XCTAssertFalse(modalSource.contains(".accessibilityHidden(isPresented)"), "The presenting hierarchy must not hide the presented accessibility surface on physical iOS")
        XCTAssertFalse(modalSource.contains(".accessibilityHidden(item != nil)"), "Item presentations must keep their presented accessibility surface active")
        XCTAssertFalse(modalSource.contains(".pvWebModal(isPresented: $presented"), "A full-screen modal must not be attached to the 44pt choice button layout")
    }

    func testWebSelectorsCoverRowsTagsGroupsAndBulkActions() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("private struct VaultTagFilterSurface: View"))
        XCTAssertTrue(source.contains("private var groupPickerSheet: some View"))
        XCTAssertTrue(source.contains("private var anchoredActionMenu: some View"))
        XCTAssertTrue(source.contains("PVAnchoredItemMenu("))
        XCTAssertTrue(source.contains("private var bulkChoiceSheet: some View"))
        XCTAssertTrue(source.contains("pendingTrashItem = item"))
        XCTAssertTrue(source.contains("pendingPermanentDeleteItem = item"))
    }

    func testHistoryAndEmptyFilteredListsCannotOverflowTheirModalOrigin() throws {
        let source = try vaultSource
        XCTAssertFalse(source.contains(".fixedSize(horizontal: false, vertical: true)"))
        XCTAssertTrue(source.contains("compact: false"))
    }

    func testSingleItemDeletionConfirmationIsOwnedByTheStableList() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("@State private var pendingTrashItem: VaultItem?"))
        XCTAssertTrue(source.contains("@State private var pendingPermanentDeleteItem: VaultItem?"))
        XCTAssertTrue(source.contains("onRequestActions: { item, anchor in closeInteractions(); pendingActionItem = item; pendingActionAnchor = anchor }"))
        XCTAssertTrue(source.contains("onRequestDelete: { item in requestDelete(item) }"))
        XCTAssertFalse(source.contains("@State private var confirmingTrash = false"))
        XCTAssertFalse(source.contains("@State private var confirmingPermanentDelete = false"))
    }

    func testMoreMenuUsesSingleRootProductModal() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("onMore: { openProductRoute(.moreMenu) }"))
        XCTAssertTrue(source.contains("case .moreMenu:"))
        XCTAssertTrue(source.contains("moreMenuContent"))
        XCTAssertFalse(source.contains("Button { requestSystemAction(.importEncryptedItem) } label: { Label(t(.importEncryptedItem), systemImage: \"lock.doc\") }"))
        XCTAssertFalse(source.contains("Button { requestSystemAction(.importAttachment) } label: { Label(t(.importAttachment), systemImage: \"paperclip\") }"))
        XCTAssertFalse(source.contains("identifier: \"new-import-encrypted-item\""))
        XCTAssertTrue(source.contains("identifier: \"new-kind-attachment\""))
        XCTAssertFalse(source.contains("Menu {\n                ForEach(MoreMenuDestination.localReferenceOrder"))
        let preferences = try String(contentsOf: URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("App/LocalVaultPreferences.swift"), encoding: .utf8)
        XCTAssertFalse(preferences.contains(".settings, .privacy, .theme,"), "Theme belongs inside Settings, not as an independent More destination")
    }

    func testCrossModalRoutesWaitForActualDismissCompletion() throws {
        let source = try vaultSource
        XCTAssertFalse(source.contains("completeDetailActionRoute"))
        XCTAssertFalse(source.contains("onDismiss: completeMoreRoute"))
        XCTAssertFalse(source.contains("onDismiss: completeNewItemRoute"))
        XCTAssertFalse(source.contains("showingNewItemPicker = false; DispatchQueue.main.async"))
        XCTAssertFalse(source.contains("showingDetailActions = false; showingHistory = true"))
        XCTAssertFalse(source.contains("showingDetailActions = false; showingShare = true"))
    }

    func testPrimaryProductDrillDownUsesOneStableRootModal() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("private enum ProductRoute"))
        XCTAssertTrue(source.contains("@State private var productRoute: ProductRoute?"))
        XCTAssertTrue(source.contains("private var rootProductModal: some View"))
        XCTAssertTrue(source.contains("pushProductRoute(.editor(item))"))
        XCTAssertTrue(source.contains("pushProductRoute(.destination(destination))"))
        XCTAssertFalse(source.contains("case detail(VaultItem)"))
        XCTAssertTrue(source.contains("private var phoneContentPane"))
        XCTAssertTrue(source.contains("@State private var productRouteHistory: [ProductRoute] = []"))
        XCTAssertTrue(source.contains("private func popProductRoute()"))
        XCTAssertFalse(source.contains("onDismiss: completeMoreRoute"))
        XCTAssertFalse(source.contains("onDismiss: completeNewItemRoute"))
        XCTAssertFalse(source.contains("pendingNewRoute"))
        XCTAssertFalse(source.contains("pendingMoreRoute"))
    }

    func testNewItemTypeIsChosenOnceBeforeEditing() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let editor = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultEditorAndSettings.swift"), encoding: .utf8)
        XCTAssertTrue(editor.contains("PVValueRow(title: t(.type), value: L10n.kind(item.kind"))
        XCTAssertFalse(editor.contains("selection: $item.kind, options: VaultItemKind.allCases"))
    }

    func testSingleProductRouteAndGroupFiltersAreDistinct() throws {
        let source = try vaultSource
        XCTAssertTrue(source.contains("private enum ProductRoute"))
        XCTAssertTrue(source.contains("@State private var productRoute: ProductRoute?"))
        XCTAssertFalse(source.contains("pendingNewRoute"))
        XCTAssertFalse(source.contains("pendingMoreRoute"))
        XCTAssertFalse(source.contains("pendingNewAttachmentImport"))
        XCTAssertFalse(source.contains("pendingImportEncryptedItem"))
        XCTAssertTrue(source.contains("value: nil"))
        XCTAssertTrue(source.contains("value: \"\""))
        XCTAssertFalse(source.contains("value: \"__all\""))
    }
}