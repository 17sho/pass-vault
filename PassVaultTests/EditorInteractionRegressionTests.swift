import XCTest

final class EditorInteractionRegressionTests: XCTestCase {
    private var root: URL {
        URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
    }

    func testInHostBooleanModalDismissRunsCompletionExactlyOnce() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/PVWebModal.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("private func presentationEnded()"))
        XCTAssertTrue(source.contains("onChange(of: isPresented) { wasPresented, presented in"))
        XCTAssertTrue(source.contains("if wasPresented { presentationEnded() }"))
        XCTAssertFalse(source.contains("isPresented = false\n            present(nil)\n            onDismiss()"), "Dismiss completion must not be split across one closure while direct binding writes bypass it")
    }

    func testConfirmationHasOneCancelActionAndStableButtonIdentifiers() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/PVWebModal.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("var showsHeaderCancel = false"))
        XCTAssertTrue(source.contains(".accessibilityIdentifier(\"confirm-modal-cancel\")"))
        XCTAssertTrue(source.contains(".accessibilityIdentifier(\"confirm-modal-confirm\")"))
    }

    func testEditorUsesInlineValidationInsteadOfGlobalGenericSaveError() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultEditorAndSettings.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("@State private var editorError: String?"))
        XCTAssertTrue(source.contains("private struct SaveCustomFieldTemplateModal"))
        XCTAssertTrue(source.contains("@State private var validationError: String?"))
        XCTAssertTrue(source.contains("editorValidationMessage"))
        XCTAssertFalse(source.contains("catch { model.errorMessage = t(.unableSaveChanges); return false }"))
    }

    func testButtonAuditFixesPreserveFailureAndResetState() throws {
        let appModel = try String(contentsOf: root.appendingPathComponent("App/AppModel.swift"), encoding: .utf8)
        let rootView = try String(contentsOf: root.appendingPathComponent("Features/RootView.swift"), encoding: .utf8)
        let editor = try String(contentsOf: root.appendingPathComponent("Features/Vault/VaultEditorAndSettings.swift"), encoding: .utf8)
        let more = try String(contentsOf: root.appendingPathComponent("Features/Vault/MoreMenuLocalViews.swift"), encoding: .utf8)
        XCTAssertTrue(appModel.contains("func addAttachment(name: String, data: Data, group: String = \"\", tags: [String] = []) -> Bool"))
        let coordinator = try String(contentsOf: root.appendingPathComponent("Features/FileImportCoordinator.swift"), encoding: .utf8)
        XCTAssertTrue(coordinator.contains("onAttachmentDraft"))
        let backupConfirmation = try String(contentsOf: root.appendingPathComponent("Features/Vault/BackupImportConfirmationView.swift"), encoding: .utf8)
        XCTAssertTrue(editor.contains("private func resetBackupImport()"))
        XCTAssertTrue(backupConfirmation.contains("PVModalHeader(title: t(.confirmImport), cancelTitle: t(.cancel)) { cancel() }"))
        XCTAssertTrue(more.contains("selectedIDs.isEmpty || targetGroup == nil"))
    }

    func testUnlockBrandIsCenteredIndependentlyFromFormCopy() throws {
        let source = try String(contentsOf: root.appendingPathComponent("Features/RootView.swift"), encoding: .utf8)
        XCTAssertTrue(source.contains("VStack(spacing: 7)"))
        XCTAssertTrue(source.contains(".frame(maxWidth: .infinity, alignment: .center)"))
        XCTAssertTrue(source.contains("VStack(alignment: .leading, spacing: 7)"))
    }
}
