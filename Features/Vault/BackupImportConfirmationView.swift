import SwiftUI

struct BackupImportConfirmationView: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    let data: Data
    let onFinish: () -> Void
    @State private var password = ""
    @State private var revealed = false
    @State private var verifying = false
    @State private var preview: BackupPreview?
    @State private var errorText: String?
    @State private var confirmingReplacement = false
    @State private var generation = UUID()

    private func t(_ key: L10nKey) -> String { L10n.text(key, language: languageStore.language) }

    var body: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: t(.confirmImport), cancelTitle: t(.cancel)) { cancel() }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let preview {
                        PVCard { VStack(spacing: 0) {
                            valueRow(t(.backupCreatedAt), preview.createdAt.formatted(date: .abbreviated, time: .shortened))
                            valueRow(t(.backupRecords), "\(preview.recordCount)")
                            valueRow(t(.backupAttachments), "\(preview.attachmentCount)")
                            valueRow(t(.backupAttachmentSize), ByteCountFormatter.string(fromByteCount: Int64(preview.attachmentBytes), countStyle: .file))
                            valueRow(t(.currentVaultRecords), "\(model.vault.items.count)")
                        } }
                        Text(t(.backupWillReplace)).font(.footnote.bold()).foregroundStyle(PVTheme.danger)
                    } else {
                        PVField(title: t(.backupMasterPassword)) {
                            HStack(spacing: 0) {
                                Group { if revealed { TextField(t(.backupMasterPassword), text: $password) } else { SecureField(t(.backupMasterPassword), text: $password) } }
                                Button { revealed.toggle() } label: { Image(systemName: revealed ? "eye.slash" : "eye").frame(width: 44, height: 44) }
                            }
                        }
                        Text(languageStore.language == .simplifiedChinese ? "输入该网页版密码库导出时使用的主密码，仅用于解密备份。导入不会更改当前主密码。" : "Enter the master password used by the web vault when this backup was exported. Importing will not change your current master password.").font(.footnote).foregroundStyle(PVTheme.muted)
                        if verifying { HStack { ProgressView(); Text(languageStore.language == .simplifiedChinese ? "正在验证备份…" : "Verifying backup…") }.foregroundStyle(PVTheme.muted) }
                        if let errorText { Text(errorText).font(.footnote).foregroundStyle(PVTheme.danger) }
                    }
                }.padding(16).frame(maxWidth: 560).frame(maxWidth: .infinity)
            }
            PVModalFooter {
                Button(t(.cancel)) { cancel() }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                if preview == nil {
                    Button(t(.verifyBackup)) { verify() }.buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(password.isEmpty || verifying)
                } else {
                    Button(t(.replaceVault), role: .destructive) { confirmingReplacement = true }.buttonStyle(PVButtonStyle(role: .destructive, fillsWidth: true))
                }
            }
        }.pvScreen()
        .pvWebModal(isPresented: $confirmingReplacement, maxWidth: 460, sizing: .fit, dismissOnBackdrop: false) {
            PVConfirmModal(title: t(.replaceVault), message: t(.backupWillReplace), confirmTitle: t(.replaceVault), cancelTitle: t(.cancel), destructive: true, confirm: {
                guard model.importBackup(data, password: password).didReplaceVault else { return }
                cancel()
            }, cancel: { confirmingReplacement = false })
        }
    }

    private func valueRow(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) { Text(title).font(.caption.bold()).foregroundStyle(PVTheme.muted); Text(value).frame(maxWidth: .infinity, alignment: .leading) }.padding(.vertical, 9)
    }

    private func verify() {
        guard !verifying else { return }
        verifying = true; errorText = nil
        let current = generation, entered = password
        Task {
            let result = await model.previewBackupAsync(data, password: entered)
            guard generation == current else { return }
            verifying = false
            switch result {
            case .success(let value): preview = value
            case .failure(let error): errorText = model.backupImportErrorMessage(error)
            }
        }
    }

    private func cancel() { generation = UUID(); password = ""; onFinish() }
}
