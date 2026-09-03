import SwiftUI

struct AttachmentImportComposer: View {
    @EnvironmentObject private var model: AppModel
    @EnvironmentObject private var languageStore: AppLanguageStore
    @EnvironmentObject private var fileImporter: FileImportCoordinator
    @Environment(\.pvModalDismiss) private var dismiss
    let draft: AttachmentImportDraft?
    @State private var selectedGroup = ""
    @State private var selectedTags: Set<String> = []
    @State private var saving = false

    private var zh: Bool { languageStore.language == .simplifiedChinese }

    var body: some View {
        VStack(spacing: 0) {
            PVModalHeader(title: zh ? "上传附件" : "Add attachment", cancelTitle: zh ? "取消" : "Cancel") { dismiss() }
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let draft {
                        PVCard { VStack(spacing: 0) {
                            composerValueRow(zh ? "文件名" : "Filename", draft.name)
                            composerValueRow(zh ? "大小" : "Size", ByteCountFormatter.string(fromByteCount: Int64(draft.data.count), countStyle: .file))
                        } }
                    } else {
                        Text(zh ? "选择文件来源" : "Choose a source").font(.headline)
                        sourceButton(zh ? "照片图库" : "Photo library", icon: "photo.on.rectangle") { fileImporter.requestMedia(.photoLibrary) }
                        sourceButton(zh ? "拍照或录像" : "Take photo or video", icon: "camera") { fileImporter.requestMedia(.camera) }
                        sourceButton(zh ? "选取文件" : "Choose file", icon: "folder") { fileImporter.request(.attachment) }
                    }
                    PVField(title: zh ? "分组" : "Group") { VaultGroupSelectionField(selection: $selectedGroup, kind: .attachment) }
                    PVField(title: zh ? "标签" : "Tags") { VaultTagSelectionField(selection: $selectedTags) }
                    Text(zh ? "确认后将在本机加密保存；实际可用容量取决于设备剩余存储空间。" : "Encrypted locally after confirmation. Practical capacity depends on available device storage.")
                        .font(.footnote).foregroundStyle(PVTheme.muted)
                }.padding(16)
            }
            PVModalFooter {
                Button(zh ? "取消" : "Cancel") { dismiss() }.buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
                Button(zh ? "加密并添加" : "Encrypt and add") { save() }
                    .buttonStyle(PVButtonStyle(role: .primary, fillsWidth: true)).disabled(draft == nil || saving)
            }
        }.pvScreen()
    }

    private func composerValueRow(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(PVTheme.muted)
            Text(value).frame(maxWidth: .infinity, alignment: .leading)
        }.padding(.vertical, 10)
    }

    private func sourceButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { Label(title, systemImage: icon).frame(maxWidth: .infinity, alignment: .leading) }
            .buttonStyle(PVButtonStyle(role: .secondary, fillsWidth: true))
    }

    private func save() {
        guard let draft else { return }
        saving = true
        guard model.addAttachment(name: draft.name, data: draft.data, group: selectedGroup, tags: Array(selectedTags).sorted()) else { saving = false; return }
        model.noticeMessage = zh ? "附件已添加" : "Attachment added"
        NotificationCenter.default.post(name: .passVaultAttachmentImportCompleted, object: nil)
        dismiss()
    }
}
