import SwiftUI
import UniformTypeIdentifiers

struct VaultEditorView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvModalDismiss) private var dismiss
    @Environment(\.pvModalBack) private var back
    @State private var item: VaultItem
    @State private var revealedCredentialIDs: Set<UUID> = []
    @State private var selectedTags: Set<String>
    @State private var groupSelection: String
    @State private var passwordOptions = PasswordGeneratorOptions()
    @State private var pendingGeneratedPassword: String?
    @State private var generatorTargetID: UUID?
    @State private var exportingAttachment = false
    @State private var showingSaveTemplate = false
    @State private var pendingTemplate: CustomFieldTemplate?
    @State private var pendingTemplateSelection: CustomFieldTemplate?
    @State private var confirmingTemplateReplacement = false
    @State private var confirmingDiscardChanges = false
    @State private var discardEditorAfterConfirmation = false
    @State private var showingTemplateChoices = false
    @State private var editorError: String?

    private let originalItem: VaultItem
    private let originalTagsText: String
    private let originalGroupSelection: String
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    init(item: VaultItem, isExistingItem: Bool = false) {
        originalItem = item
        originalTagsText = item.tags.joined(separator: ", ")
        originalGroupSelection = item.group
        _item = State(initialValue: item)
        _selectedTags = State(initialValue: Set(item.tags))
        _groupSelection = State(initialValue: item.group)
        _ = isExistingItem
    }

    var body: some View {
        editorSurface
            .pvScreen()
            .onChange(of: item.kind) { _, _ in groupSelection = "" }
            .fileExporter(isPresented: $exportingAttachment, document: AttachmentDocument(data: item.attachmentData ?? Data()), contentType: .data, defaultFilename: item.attachmentName ?? item.title) { if case .failure = $0 { model.errorMessage = t(.unableExportAttachment) } }
            .pvWebModal(isPresented: $showingTemplateChoices, maxWidth: 520, sizing: .capped, onDismiss: completeTemplateSelection) { templateChoicesModal }
            .pvWebModal(isPresented: $showingSaveTemplate, maxWidth: 480, sizing: .fit, dismissOnBackdrop: false) {
                SaveCustomFieldTemplateModal(fields: item.customFields) { showingSaveTemplate = false }
            }
            .pvWebModal(isPresented: $confirmingTemplateReplacement, maxWidth: 460, sizing: .fit, dismissOnBackdrop: false) { replaceTemplateConfirmation }
            .pvWebModal(isPresented: $confirmingDiscardChanges, maxWidth: 460, sizing: .fit, dismissOnBackdrop: false, onDismiss: completeDiscardRoute) { discardChangesConfirmation }
    }

    private var editorSurface: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: model.vault.items.contains { $0.id == item.id } ? t(.editItem) : t(.newItem), cancelTitle: t(.cancel)) { requestDismiss() }
            editorScrollContent
            editorFooter
        }
    }

    private var editorScrollContent: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                editorSection(t(.record)) {
                    PVValueRow(title: t(.type), value: L10n.kind(item.kind, language: languageStore.language))
                    PVField(title: t(.title)) {
                        TextField(t(.title), text: $item.title)
                            .accessibilityIdentifier("editor-title")
                    }
                }
                if item.kind == .attachment { attachmentSection }
                else {
                    if item.kind == .account { credentialsSection; websiteSection }
                    if item.kind == .website { websiteSection }
                    if item.kind == .totp { totpSection }
                    organizationSection
                    editorSection(t(.notes)) {
                        PVField(title: t(.notes)) { TextEditor(text: $item.notes).frame(minHeight: 110).scrollContentBackground(.hidden) }
                    }
                    customFieldsSection
                }
            }
            .padding(16).frame(maxWidth: 720).frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("editor-scroll")
        .scrollDismissesKeyboard(.interactively)
    }

    private var editorFooter: some View {
        PVModalFooter {
            VStack(alignment: .leading, spacing: 10) {
                if let editorError {
                    Text(editorError)
                        .font(.footnote)
                        .foregroundStyle(PVTheme.danger)
                        .accessibilityIdentifier("editor-validation-error")
                }
                HStack(spacing: 10) {
                    Button(t(.cancel)) { requestDismiss() }
                        .accessibilityIdentifier("editor-cancel")
                        .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                    Button(t(.save)) { save() }
                        .accessibilityIdentifier("editor-save")
                        .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
                        .disabled(item.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    private var templateChoicesModal: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: t(.applyTemplate), cancelTitle: t(.cancel)) { showingTemplateChoices = false }
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(model.vault.customFieldTemplates) { template in
                        HStack(spacing: 8) {
                            Button { pendingTemplateSelection = template; showingTemplateChoices = false } label: { Text(template.name).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading) }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                            Button(role: .destructive) { _ = model.deleteCustomFieldTemplate(id: template.id) } label: { Image(systemName: "trash").frame(width: 44, height: 44) }.buttonStyle(PVIconButtonStyle()).accessibilityLabel("\(t(.deleteTemplate)): \(template.name)")
                        }
                    }
                }.padding(16)
            }
        }
    }


    private var replaceTemplateConfirmation: some View {
        PVConfirmModal(title: t(.applyTemplate), message: languageStore.language == .simplifiedChinese ? "应用模板会替换当前自定义字段。尚未保存的字段内容将丢失，但资料的其他内容不受影响。" : "Applying this template replaces the current custom fields. Unsaved field content will be lost; other item content is unchanged.", confirmTitle: t(.replaceFields), cancelTitle: t(.cancel), destructive: true, confirm: {
            applyPendingTemplate(); confirmingTemplateReplacement = false
        }, cancel: { pendingTemplate = nil; confirmingTemplateReplacement = false })
    }

    private var discardChangesConfirmation: some View {
        PVConfirmModal(title: t(.unsavedChanges), message: languageStore.language == .simplifiedChinese ? "当前修改尚未保存。放弃后将无法恢复这些更改。" : "Your changes have not been saved. Discarding them cannot be undone.", confirmTitle: t(.discardChanges), cancelTitle: t(.continueEditing), destructive: true, confirm: {
            discardEditorAfterConfirmation = true; confirmingDiscardChanges = false
        }, cancel: { confirmingDiscardChanges = false })
    }


    private func requestDismiss() {
        if item != originalItem || selectedTags != Set(originalItem.tags) || groupSelection != originalGroupSelection { confirmingDiscardChanges = true }
        else { dismiss() }
    }

    private var credentialsSection: some View {
        editorSection(t(.credentials)) {
            ForEach($item.credentials) { $credential in
                let credentialIndex = item.credentials.firstIndex { $0.id == credential.id } ?? 0
                PVCard {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("\(t(.credentials)) \(credentialIndex + 1)").font(.subheadline.bold())
                            Spacer()
                            Button { _ = VaultCredentialEditorPolicy.move(credential.id, direction: .up, in: &item.credentials) } label: {
                                Image(systemName: "arrow.up").frame(width: 44, height: 44)
                            }
                            .disabled(credentialIndex == 0)
                            .accessibilityLabel("\(t(.credentials)) \(credentialIndex + 1) ↑")
                            Button { _ = VaultCredentialEditorPolicy.move(credential.id, direction: .down, in: &item.credentials) } label: {
                                Image(systemName: "arrow.down").frame(width: 44, height: 44)
                            }
                            .disabled(credentialIndex >= item.credentials.count - 1)
                            .accessibilityLabel("\(t(.credentials)) \(credentialIndex + 1) ↓")
                            if item.credentials.count > 1 {
                                Button(role: .destructive) { item.credentials.removeAll { $0.id == credential.id } } label: { Image(systemName: "trash").frame(width: 44, height: 44) }
                                    .accessibilityLabel("\(t(.delete)) \(t(.credentials)) \(credentialIndex + 1)")
                            }
                        }
                        PVField(title: t(.username)) { TextField(t(.username), text: $credential.username).textInputAutocapitalization(.never) }
                        PVField(title: t(.password)) {
                            HStack(spacing: 0) {
                                Group {
                                    if revealedCredentialIDs.contains(credential.id) { TextField(t(.password), text: $credential.password) }
                                    else { SecureField(t(.password), text: $credential.password) }
                                }
                                .textInputAutocapitalization(.never)
                                Button {
                                    if revealedCredentialIDs.remove(credential.id) == nil { revealedCredentialIDs.insert(credential.id) }
                                } label: {
                                    Image(systemName: revealedCredentialIDs.contains(credential.id) ? "eye.slash" : "eye").frame(width: 44, height: 44)
                                }
                                .accessibilityLabel("\(revealedCredentialIDs.contains(credential.id) ? t(.hidePassword) : t(.showPassword)) \(credentialIndex + 1)")
                                Button {
                                    generatorTargetID = credential.id
                                    pendingGeneratedPassword = nil
                                } label: {
                                    Image(systemName: "wand.and.stars").frame(width: 44, height: 44)
                                }
                                .accessibilityLabel("\(t(.generate)) \(t(.password)) \(credentialIndex + 1)")
                                Button { model.copySecret(credential.password) } label: {
                                    Image(systemName: "doc.on.doc").frame(width: 44, height: 44)
                                }
                                .accessibilityLabel("\(t(.copy)) \(t(.password)) \(credentialIndex + 1)").disabled(credential.password.isEmpty)
                            }
                        }
                    }
                }
            }
            Button(t(.add), systemImage: "plus") {
                guard item.credentials.count < 20 else { return }
                item.credentials.append(VaultCredential())
            }
            .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
            .disabled(item.credentials.count >= 20)
            if let targetID = generatorTargetID {
                PasswordGeneratorPanel(options: $passwordOptions, preview: pendingGeneratedPassword) {
                    do { pendingGeneratedPassword = try PasswordGenerator.generate(options: passwordOptions) }
                    catch { model.errorMessage = t(.selectCharacterClass) }
                } useGenerated: {
                    guard let generated = pendingGeneratedPassword else { return }
                    _ = VaultCredentialEditorPolicy.replacePassword(generated, for: targetID, in: &item.credentials)
                    revealedCredentialIDs.insert(targetID)
                    generatorTargetID = nil
                    pendingGeneratedPassword = nil
                } cancel: {
                    generatorTargetID = nil
                    pendingGeneratedPassword = nil
                }
            }
        }
    }

    private var websiteSection: some View {
        editorSection(t(.website)) {
            PVField(title: t(.website)) { TextField(t(.website), text: $item.url).keyboardType(.URL).textInputAutocapitalization(.never) }
        }
    }

    private var totpSection: some View {
        editorSection(t(.authenticator)) {
            PVField(title: t(.totpSecret)) { SecureField(t(.totpSecret), text: $item.totpSecret).textInputAutocapitalization(.characters) }
            PVCard {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let code = try? TOTP.generate(secret: item.totpSecret, date: context.date)
                    HStack {
                        Text(code ?? "------").font(.system(.title, design: .monospaced).bold()).foregroundStyle(PVTheme.accentPressed)
                        Spacer()
                        Text("\(30 - Int(context.date.timeIntervalSince1970) % 30)s").foregroundStyle(PVTheme.muted)
                        Button(t(.copy)) { if let code { model.copySecret(code) } }.buttonStyle(PVButtonStyle(role: .secondary)).disabled(code == nil)
                    }
                }
            }
        }
    }

    private var organizationSection: some View {
        editorSection(t(.organization)) {
            PVField(title: t(.group)) { VaultGroupSelectionField(selection: $groupSelection, kind: item.kind) }
            PVField(title: languageStore.language == .simplifiedChinese ? "标签" : "Tags") { VaultTagSelectionField(selection: $selectedTags) }
            PVCard {
                VStack(spacing: 0) {
                    PVToggleRow(title: t(.favorite), icon: "star", isOn: $item.isFavorite)
                    Rectangle().fill(PVTheme.line).frame(height: 1)
                    PVToggleRow(title: t(.pin), icon: "pin", isOn: $item.isPinned)
                }
            }
        }
    }

    private var attachmentSection: some View {
        editorSection(t(.encryptedAttachment)) {
            PVCard {
                VStack(spacing: 0) {
                    PVValueRow(title: t(.filename), value: item.attachmentName ?? item.title)
                    Rectangle().fill(PVTheme.line).frame(height: 1)
                    PVValueRow(title: t(.size), value: ByteCountFormatter.string(fromByteCount: Int64(item.attachmentData?.count ?? 0), countStyle: .file))
                }
            }
            PVField(title: t(.filename)) {
                TextField(t(.filename), text: Binding(get: { item.attachmentName ?? item.title }, set: { item.attachmentName = $0; item.title = $0 }))
            }
            Text(t(.attachmentExplanation)).font(.footnote).foregroundStyle(PVTheme.muted)
            Button(t(.exportFile), systemImage: "square.and.arrow.up") { exportingAttachment = true }
                .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true)).disabled(item.attachmentData == nil)
        }
    }

    private var customFieldsSection: some View {
        editorSection(t(.customFields)) {
            if item.kind == .custom {
                if !model.vault.customFieldTemplates.isEmpty {
                    Button { showingTemplateChoices = true } label: { Label(t(.applyTemplate), systemImage: "square.grid.2x2") }
                        .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                }
            }
            ForEach($item.customFields) { $field in
                PVCard {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text(t(.customFields)).font(.subheadline.bold())
                            Spacer()
                            Button(role: .destructive) { item.customFields.removeAll { $0.id == field.id } } label: {
                                Image(systemName: "trash").frame(width: 44, height: 44)
                            }.accessibilityLabel(t(.delete))
                        }
                        PVField(title: t(.name)) { TextField(t(.name), text: $field.name) }
                        PVField(title: MoreMenuLocalCopy.text("字段类型", "Field type", language: languageStore.language)) {
                            PVChoiceField(title: MoreMenuLocalCopy.text("字段类型", "Field type", language: languageStore.language), icon: "rectangle.and.pencil.and.ellipsis", selection: $field.type, options: CustomFieldType.allCases.map { PVChoiceOption($0, $0.rawValue.capitalized) })
                        }
                        PVField(title: t(.value)) {
                            HStack(spacing: 0) {
                                Group {
                                    switch field.type {
                                    case .secret: SecureField(t(.value), text: $field.value)
                                    case .textarea: TextEditor(text: $field.value).frame(minHeight: 88).scrollContentBackground(.hidden)
                                    case .number: TextField(t(.value), text: $field.value).keyboardType(.numbersAndPunctuation)
                                    case .url: TextField(t(.value), text: $field.value).keyboardType(.URL).textInputAutocapitalization(.never)
                                    default: TextField(t(.value), text: $field.value)
                                    }
                                }
                                Button { model.copySecret(field.value) } label: { Image(systemName: "doc.on.doc").frame(width: 44, height: 44) }
                                    .accessibilityLabel(t(.copy)).disabled(field.value.isEmpty)
                            }
                        }
                        PVField(title: MoreMenuLocalCopy.text("显示条件", "Visibility condition", language: languageStore.language)) {
                            let priorFields = Array(item.customFields.prefix { $0.id != field.id })
                            PVChoiceField(title: MoreMenuLocalCopy.text("显示条件", "Visibility condition", language: languageStore.language), icon: "eye", selection: Binding(get: { field.condition?.fieldID }, set: { field.condition = $0.map { CustomFieldCondition(fieldID: $0, equals: field.condition?.equals ?? "") } }), options: [PVChoiceOption(UUID?.none, MoreMenuLocalCopy.text("始终显示", "Always visible", language: languageStore.language))] + priorFields.map { PVChoiceOption(Optional($0.id), $0.name.isEmpty ? t(.untitled) : $0.name) })
                            if field.condition != nil {
                                TextField(MoreMenuLocalCopy.text("等于此值", "Equals value", language: languageStore.language), text: Binding(get: { field.condition?.equals ?? "" }, set: { field.condition?.equals = $0 }))
                            }
                        }
                        .onChange(of: field.type) { _, type in field.isSecret = type == .secret }
                    }
                }
            }
            Button(t(.addCustomField), systemImage: "plus") { item.customFields.append(CustomField()) }
                .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                .disabled(item.customFields.count >= 20)
            if item.kind == .custom {
                Button(t(.saveAsTemplate), systemImage: "square.and.arrow.down") {
                    showingSaveTemplate = true
                }
                    .accessibilityIdentifier("save-as-template")
                    .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                    .disabled(item.customFields.isEmpty)
            }
        }
    }

    private func selectTemplate(_ template: CustomFieldTemplate) {
        if item.customFields.isEmpty { item.customFields = template.makeCustomFields() }
        else { pendingTemplate = template; confirmingTemplateReplacement = true }
    }

    private func completeTemplateSelection() {
        guard let template = pendingTemplateSelection else { return }
        pendingTemplateSelection = nil
        selectTemplate(template)
    }

    private func completeDiscardRoute() {
        guard discardEditorAfterConfirmation else { return }
        discardEditorAfterConfirmation = false
        if let back { back() } else { dismiss() }
    }

    private func applyPendingTemplate() {
        if let pendingTemplate { item.customFields = pendingTemplate.makeCustomFields() }
        pendingTemplate = nil
    }


    private func customFieldValidationMessage(_ error: Error) -> String {
        guard let error = error as? CustomFieldPolicyError else {
            return MoreMenuLocalCopy.text("自定义字段无效，请检查后重试。", "Custom fields are invalid. Review them and try again.", language: languageStore.language)
        }
        switch error {
        case .emptyName:
            return MoreMenuLocalCopy.text("每个自定义字段都必须填写名称。", "Every custom field needs a name.", language: languageStore.language)
        case .nameTooLong:
            return MoreMenuLocalCopy.text("自定义字段名称不能超过 80 个字符。", "Custom field names cannot exceed 80 characters.", language: languageStore.language)
        case .valueTooLong:
            return MoreMenuLocalCopy.text("自定义字段内容过长。", "A custom field value is too long.", language: languageStore.language)
        case .rowCount:
            return MoreMenuLocalCopy.text("自定义字段不能超过 20 个。", "You can add at most 20 custom fields.", language: languageStore.language)
        case .duplicateID, .controlCharacter:
            return MoreMenuLocalCopy.text("自定义字段格式无效，请检查后重试。", "A custom field has an invalid format.", language: languageStore.language)
        }
    }

    private func editorValidationMessage(_ error: Error) -> String {
        if error is CustomFieldPolicyError { return customFieldValidationMessage(error) }
        if let error = error as? VaultCredentialPolicyError {
            switch error {
            case .incomplete:
                return MoreMenuLocalCopy.text("每组账户必须同时填写登录名和密码，或同时留空。", "Each credential needs both a username and password, or both must be empty.", language: languageStore.language)
            case .rowCount:
                return MoreMenuLocalCopy.text("账户凭据数量无效。", "The credential count is invalid.", language: languageStore.language)
            case .usernameTooLong, .passwordTooLong, .duplicateID:
                return MoreMenuLocalCopy.text("账户凭据格式无效，请检查后重试。", "The credentials are invalid. Review them and try again.", language: languageStore.language)
            }
        }
        return t(.unableSaveChanges)
    }

    private func editorSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 9) { PVSectionTitle(title: title); content() }
    }

    private func save() {
        editorError = nil
        guard let normalizedTags = TagPolicy.normalizedSelection(Array(selectedTags)) else {
            editorError = MoreMenuLocalCopy.text("标签格式无效，请检查后重试。", "Tags are invalid. Review them and try again.", language: languageStore.language)
            return
        }
        item.tags = normalizedTags
        item.group = groupSelection
        do { try CustomFieldPolicy.validate(item.customFields) }
        catch { editorError = editorValidationMessage(error); return }
        if item.kind == .account {
            do { try VaultCredentialPolicy.validate(item.credentials) }
            catch { editorError = editorValidationMessage(error); return }
        }
        if model.save(item) { dismiss() }
        else { editorError = t(.unableSaveChanges) }
    }
}

private struct SaveCustomFieldTemplateModal: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let fields: [CustomField]
    let close: () -> Void
    @State private var templateName = ""
    @State private var validationError: String?

    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: t(.saveAsTemplate), cancelTitle: t(.cancel), onCancel: close)
            VStack(alignment: .leading, spacing: 12) {
                PVField(title: t(.templateName)) {
                    TextField(t(.templateName), text: $templateName)
                        .accessibilityIdentifier("template-name")
                }
                if let validationError {
                    Text(validationError)
                        .font(.footnote)
                        .foregroundStyle(PVTheme.danger)
                        .accessibilityIdentifier("template-validation-error")
                }
            }
            .padding(20)
            PVModalFooter {
                Button(t(.cancel), action: close).buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                Button(t(.save), action: save)
                    .accessibilityIdentifier("template-save")
                    .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
            }
        }
    }

    private func save() {
        validationError = nil
        do {
            let positions = Dictionary(uniqueKeysWithValues: fields.enumerated().map { ($0.element.id, $0.offset) })
            let templateFields = fields.map { field in
                CustomFieldTemplateField(name: field.name, value: field.value, type: field.type, conditionFieldIndex: field.condition.flatMap { positions[$0.fieldID] }, conditionEquals: field.condition?.equals)
            }
            let template = try CustomFieldTemplate(name: templateName, fields: templateFields)
            guard model.saveCustomFieldTemplate(template) else {
                validationError = copy("无法保存模板，请重试。", "Unable to save the template. Try again.")
                return
            }
            close()
        } catch {
            validationError = message(for: error)
        }
    }

    private func message(for error: Error) -> String {
        if let error = error as? CustomFieldTemplateError, error == .emptyName {
            return copy("请输入 1 至 80 个字符的模板名称。", "Enter a template name between 1 and 80 characters.")
        }
        guard let fieldError = error as? CustomFieldPolicyError else {
            return copy("自定义字段无效，请检查后重试。", "Custom fields are invalid. Review them and try again.")
        }
        switch fieldError {
        case .emptyName: return copy("每个自定义字段都必须填写名称。", "Every custom field needs a name.")
        case .nameTooLong: return copy("自定义字段名称不能超过 80 个字符。", "Custom field names cannot exceed 80 characters.")
        case .valueTooLong: return copy("自定义字段内容过长。", "A custom field value is too long.")
        case .rowCount: return copy("自定义字段不能超过 20 个。", "You can add at most 20 custom fields.")
        case .duplicateID, .controlCharacter: return copy("自定义字段格式无效，请检查后重试。", "A custom field has an invalid format.")
        }
    }

    private func copy(_ chinese: String, _ english: String) -> String {
        MoreMenuLocalCopy.text(chinese, english, language: languageStore.language)
    }
}

private struct PasswordGeneratorPanel: View {
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Binding var options: PasswordGeneratorOptions
    let preview: String?
    let generate: () -> Void
    let useGenerated: () -> Void
    let cancel: () -> Void
    @State private var expanded = true
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Button { expanded.toggle() } label: {
                    HStack { Label(t(.passwordGenerator), systemImage: "slider.horizontal.3"); Spacer(); Image(systemName: expanded ? "chevron.up" : "chevron.down") }
                }
                .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                Button(t(.generate), systemImage: "wand.and.stars", action: generate)
                    .buttonStyle(PVButtonStyle(role: .primary))
            }
            if expanded {
                PVCard {
                    VStack(spacing: 4) {
                        Stepper("\(t(.length)): \(options.length)", value: $options.length, in: 12...64).frame(minHeight: 44)
                        Rectangle().fill(PVTheme.line).frame(height: 1)
                        Toggle(t(.uppercase), isOn: $options.uppercase).frame(minHeight: 44)
                        Toggle(t(.lowercase), isOn: $options.lowercase).frame(minHeight: 44)
                        Toggle(t(.digits), isOn: $options.digits).frame(minHeight: 44)
                        Toggle(t(.symbols), isOn: $options.symbols).frame(minHeight: 44)
                        if let preview {
                            Rectangle().fill(PVTheme.line).frame(height: 1)
                            Text(preview).font(.system(.body, design: .monospaced)).textSelection(.enabled).frame(maxWidth: .infinity, alignment: .leading).padding(.vertical, 10)
                                .privacySensitive().accessibilityHidden(true)
                            HStack {
                                Button(t(.cancel), action: cancel).buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                                Button(t(.useGeneratedPassword), action: useGenerated).buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
                            }
                        }
                    }.tint(PVTheme.accent)
                }
            }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var preferences: LocalVaultPreferences
    @EnvironmentObject private var fileImporter: FileImportCoordinator
    @Environment(\.pvModalDismiss) private var dismiss
    @State private var showingPasswordChange = false
    @State private var exportingBackup = false
    @State private var backupScope: BackupScope = .complete

    @State private var backupDocument = BackupDocument()
    @State private var pendingBackup: Data?
    @State private var pendingBackupPreview: BackupPreview?
    @State private var confirmingBackupReplacement = false
    @State private var importPassword = ""
    @State private var revealImportPassword = false
    @State private var verifyingBackup = false
    @State private var backupImportError: String?
    var initialAction: SettingsInitialAction?
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: t(.settingsTitle), cancelTitle: t(.cancel)) { dismiss() }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    PVCard {
                        HStack(spacing: 12) {
                            Image("Logo").resizable().scaledToFit().frame(width: 48, height: 48)
                            VStack(alignment: .leading, spacing: 3) { Text(t(.appName)).font(.headline); Text(t(.brandSubtitle)).font(.caption).foregroundStyle(PVTheme.muted) }
                        }
                    }
                    settingsSection(t(.appearance)) {
                        PVField(title: t(.language)) { PVChoiceField(title: t(.language), icon: "globe", selection: $languageStore.language, options: [PVChoiceOption(.simplifiedChinese, t(.simplifiedChinese)), PVChoiceOption(.english, t(.english))]) }
                        PVField(title: MoreMenuLocalCopy.title(.theme, language: languageStore.language)) {
                            PVChoiceField(title: MoreMenuLocalCopy.title(.theme, language: languageStore.language), icon: "circle.lefthalf.filled", selection: $preferences.theme, options: [
                                PVChoiceOption(.system, MoreMenuLocalCopy.text("跟随系统", "System", language: languageStore.language)),
                                PVChoiceOption(.light, MoreMenuLocalCopy.text("白天模式", "Light", language: languageStore.language)),
                                PVChoiceOption(.dark, MoreMenuLocalCopy.text("夜晚模式", "Dark", language: languageStore.language))
                            ], selectionAnimation: .easeInOut(duration: 0.24))
                            .accessibilityIdentifier("settings-theme-choice")
                        }
                    }
                    settingsSection(t(.security)) {
                        PVField(title: MoreMenuLocalCopy.text("自动锁定时间", "Auto-lock", language: languageStore.language)) {
                            PVChoiceField(title: MoreMenuLocalCopy.text("自动锁定时间", "Auto-lock", language: languageStore.language), icon: "timer", selection: $preferences.autoLockChoice, options: AutoLockChoice.allCases.map { PVChoiceOption($0, autoLockLabel($0)) }, onSelect: { model.recordActivity() })
                        }
                        PVField(title: MoreMenuLocalCopy.text("剪贴板自动清除", "Clear clipboard", language: languageStore.language)) {
                            PVChoiceField(title: MoreMenuLocalCopy.text("剪贴板自动清除", "Clear clipboard", language: languageStore.language), icon: "doc.on.clipboard", selection: $preferences.clipboardClearChoice, options: ClipboardClearChoice.allCases.map { PVChoiceOption($0, clipboardLabel($0)) })
                                .accessibilityIdentifier("settings-clipboard-choice")
                        }
                        Text(MoreMenuLocalCopy.text("复制密码、验证码或其他敏感内容后，将按所选时间自动清除；如果你随后复制了其他内容，则不会误删。", "Passwords, codes, and other sensitive values are cleared after the selected delay. Newer clipboard content is never removed.", language: languageStore.language))
                            .font(.footnote).foregroundStyle(PVTheme.muted)
                        PVCard { PVToggleRow(title: t(.quickUnlockSetting), icon: "faceid", isOn: Binding(get: { model.quickUnlockEnabled }, set: { model.setQuickUnlock(enabled: $0) })) }
                        Text(t(.quickUnlockExplanation)).font(.footnote).foregroundStyle(PVTheme.muted)
                        Button(t(.changeMasterPassword), systemImage: "key") { showingPasswordChange = true }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                        Button(t(.lockNow), systemImage: "lock") { model.lock() }.buttonStyle(PVButtonStyle(role: .destructive, fillsWidth: true))
                    }
                    settingsSection(MoreMenuLocalCopy.text("隐私", "Privacy", language: languageStore.language)) {
                        PVField(title: MoreMenuLocalCopy.text("保护级别", "Protection level", language: languageStore.language)) {
                            PVChoiceField(title: MoreMenuLocalCopy.text("保护级别", "Protection level", language: languageStore.language), icon: "eye.slash", selection: $preferences.privacyLevel, options: [
                                PVChoiceOption(.off, MoreMenuLocalCopy.text("关闭", "Off", language: languageStore.language)),
                                PVChoiceOption(.titles, MoreMenuLocalCopy.text("标题可见", "Titles visible", language: languageStore.language)),
                                PVChoiceOption(.list, MoreMenuLocalCopy.text("列表隐私", "Private list", language: languageStore.language)),
                                PVChoiceOption(.full, MoreMenuLocalCopy.text("完整隐私", "Full privacy", language: languageStore.language))
                            ], onSelect: { if preferences.privacyPersist { preferences.persistPrivacyLevel(preferences.privacyLevel) } })
                        }
                        PVCard {
                            PVToggleRow(title: MoreMenuLocalCopy.text("重新打开时保持开启", "Keep enabled when reopened", language: languageStore.language), icon: "lock.shield", isOn: Binding(
                                get: { preferences.privacyPersist },
                                set: { enabled in
                                    preferences.privacyPersist = enabled
                                    if enabled { preferences.persistPrivacyLevel(preferences.privacyLevel) }
                                }
                            ))
                        }
                    }
                    settingsSection(t(.encryptedBackup)) {
                        PVChoiceField(title: t(.encryptedBackup), icon: "archivebox", selection: $backupScope, options: [PVChoiceOption(.complete, MoreMenuLocalCopy.text("完整备份（资料与附件）", "Complete backup (records and attachments)", language: languageStore.language)), PVChoiceOption(.recordsOnly, MoreMenuLocalCopy.text("仅资料（不含附件）", "Records only (no attachments)", language: languageStore.language))])
                        HStack(spacing: 8) {
                            Button(t(.exportBackup), systemImage: "square.and.arrow.up") {
                                if let data = model.exportBackup(scope: backupScope) { backupDocument = BackupDocument(data: data); exportingBackup = true }
                            }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                            Button(t(.importBackup), systemImage: "square.and.arrow.down") { beginBackupImport() }
                                .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                        }
                        Text(t(.backupExplanation)).font(.footnote).foregroundStyle(PVTheme.muted)
                    }
                }
                .padding(16).frame(maxWidth: 720).frame(maxWidth: .infinity)
            }
        }
        .pvScreen()
        .overlay(alignment: .topLeading) { Color.clear.frame(width: 1, height: 1).accessibilityIdentifier("settings-screen") }
        .onAppear {
            guard let initialAction else { return }
            switch initialAction {
            case .exportBackup:
                if let data = model.exportBackup() { backupDocument = BackupDocument(data: data); exportingBackup = true }
            case .importBackup: beginBackupImport()
            case .changePassword: showingPasswordChange = true
            }
        }
        .pvWebModal(isPresented: $showingPasswordChange, maxWidth: 620, sizing: .capped, dismissOnBackdrop: false) { ChangePasswordView() }
        .fileExporter(isPresented: $exportingBackup, document: backupDocument, contentType: BackupDocument.readableContentTypes[0], defaultFilename: "PassVault-Encrypted-Backup.pvbackup") { if case .failure = $0 { model.errorMessage = t(.unableExportBackup) } }
        .onReceive(NotificationCenter.default.publisher(for: .passVaultBackupImportReady)) { notification in
            guard let data = notification.object as? Data else { return }
            pendingBackup = data
        }
        .pvWebModal(isPresented: Binding(get: { pendingBackup != nil }, set: { if !$0 { resetBackupImport() } }), maxWidth: 660, dismissOnBackdrop: false) {
            if let data = pendingBackup { BackupImportConfirmationView(data: data, onFinish: resetBackupImport) }
        }
    }

    private func autoLockLabel(_ value: AutoLockChoice) -> String {
        switch value {
        case .oneMinute: durationLabel(1, zhUnit: "分钟", enUnit: "min")
        case .fiveMinutes: durationLabel(5, zhUnit: "分钟", enUnit: "min")
        case .fifteenMinutes: durationLabel(15, zhUnit: "分钟", enUnit: "min")
        case .thirtyMinutes: durationLabel(30, zhUnit: "分钟", enUnit: "min")
        case .never: MoreMenuLocalCopy.text("永不", "Never", language: languageStore.language)
        }
    }

    private func clipboardLabel(_ value: ClipboardClearChoice) -> String {
        switch value {
        case .never: MoreMenuLocalCopy.text("永不", "Never", language: languageStore.language)
        case .fifteenSeconds: durationLabel(15, zhUnit: "秒", enUnit: "sec")
        case .thirtySeconds: durationLabel(30, zhUnit: "秒", enUnit: "sec")
        case .oneMinute: durationLabel(1, zhUnit: "分钟", enUnit: "min")
        case .twoMinutes: durationLabel(2, zhUnit: "分钟", enUnit: "min")
        }
    }

    private func durationLabel(_ value: Int, zhUnit: String, enUnit: String) -> String {
        MoreMenuLocalCopy.text("\(value) \(zhUnit)", "\(value) \(enUnit)", language: languageStore.language)
    }

    private func resetBackupImport() {
        pendingBackup = nil
        pendingBackupPreview = nil
        importPassword = ""
        revealImportPassword = false
        confirmingBackupReplacement = false
        verifyingBackup = false
        backupImportError = nil
    }

    private func verifyPendingBackup() {
        guard let data = pendingBackup, !verifyingBackup else { return }
        verifyingBackup = true
        backupImportError = nil
        let password = importPassword
        Task {
            let result = await model.previewBackupAsync(data, password: password)
            guard pendingBackup != nil else { return }
            verifyingBackup = false
            switch result {
            case .success(let preview): pendingBackupPreview = preview
            case .failure:
                backupImportError = languageStore.language == .simplifiedChinese
                    ? "备份密码不正确，或备份文件已损坏。"
                    : "The backup password is incorrect, or the backup is damaged."
            }
        }
    }

    private func beginBackupImport() {
        resetBackupImport()
        fileImporter.request(.backup)
    }

    private func settingsSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 9) { PVSectionTitle(title: title); content() }
    }
}

enum SettingsInitialAction {
    case exportBackup, importBackup, changePassword
}

private struct ChangePasswordView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @Environment(\.pvModalDismiss) private var dismiss
    @State private var current = ""
    @State private var new = ""
    @State private var confirmation = ""
    @State private var revealCurrent = false
    @State private var revealNew = false
    @State private var submitting = false
    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: t(.changePassword), cancelTitle: t(.cancel)) { dismiss() }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    passwordField(t(.currentMasterPassword), text: $current, revealed: $revealCurrent)
                    passwordField(t(.newMasterPassword), text: $new, revealed: $revealNew)
                    PVField(title: t(.confirmNewPassword)) { SecureField(t(.confirmNewPassword), text: $confirmation) }
                    Text(t(.useAtLeast8)).font(.footnote).foregroundStyle(PVTheme.muted)
                }.padding(16).frame(maxWidth: 560).frame(maxWidth: .infinity)
            }
            PVModalFooter {
                Button(t(.cancel)) { dismiss() }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                Button(t(.change)) { changePassword() }.buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true))
                    .disabled(submitting || current.isEmpty || new.count < 8 || confirmation.isEmpty)
            }
        }.pvScreen()
    }

    private func passwordField(_ title: String, text: Binding<String>, revealed: Binding<Bool>) -> some View {
        PVField(title: title) {
            HStack(spacing: 0) {
                Group {
                    if revealed.wrappedValue { TextField(title, text: text) } else { SecureField(title, text: text) }
                }
                Button { revealed.wrappedValue.toggle() } label: { Image(systemName: revealed.wrappedValue ? "eye.slash" : "eye").frame(width: 44, height: 44) }
                    .accessibilityLabel(revealed.wrappedValue ? t(.hidePassword) : t(.showPassword))
            }
        }
    }

    private func changePassword() {
        guard new == confirmation else { model.errorMessage = t(.passwordsDoNotMatch); return }
        submitting = true
        defer { submitting = false }
        guard model.changePassword(currentPassword: current, newPassword: new) else { return }
        current = ""; new = ""; confirmation = ""; dismiss()
    }
}

struct PVModalHeader: View {
    @Environment(\.pvModalBack) private var environmentBack
    let title: String
    let cancelTitle: String
    var onBack: (() -> Void)? = nil
    var showsCancel = true
    let onCancel: () -> Void
    private var effectiveBack: (() -> Void)? { onBack ?? environmentBack }
    var body: some View {
        HStack(spacing: 12) {
            if let effectiveBack {
                Button(action: effectiveBack) { Image(systemName: "chevron.left").frame(width: 30, height: 30) }
                    .accessibilityIdentifier("back-product-modal")
                    .accessibilityLabel("返回")
                    .buttonStyle(.plain)
            } else {
                Image("Logo").resizable().scaledToFit().frame(width: 30, height: 30)
            }
            Text(title).font(.title3.bold()).lineLimit(1)
            Spacer()
            if showsCancel {
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.body.weight(.semibold))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                    .accessibilityIdentifier("close-product-modal")
                    .accessibilityLabel(cancelTitle)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10).background(PVTheme.surface)
        .overlay(alignment: .bottom) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
}

struct PVModalFooter<Content: View>: View {
    @ViewBuilder let content: Content
    var body: some View {
        HStack(spacing: 10) { content }
            .padding(.horizontal, 16).padding(.vertical, 10).background(PVTheme.surface)
            .overlay(alignment: .top) { Rectangle().fill(PVTheme.line).frame(height: 1) }
    }
}

private struct PVToggleRow: View {
    let title: String
    let icon: String
    @Binding var isOn: Bool
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(PVTheme.accentPressed).frame(width: 24)
            Text(title).font(.subheadline.weight(.medium))
            Spacer()
            Toggle(title, isOn: $isOn).labelsHidden().tint(PVTheme.accent)
        }.frame(minHeight: PVTheme.minimumControlHeight)
    }
}

private struct PVValueRow: View {
    let title: String
    let value: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(PVTheme.muted)
            Spacer()
            Text(value).multilineTextAlignment(.trailing).textSelection(.enabled)
        }.padding(.vertical, 10)
    }
}
