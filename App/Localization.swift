import Foundation
import SwiftUI

enum AppLanguage: String, CaseIterable, Identifiable {
    case simplifiedChinese = "zh-Hans"
    case english = "en"

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: rawValue) }
}

final class AppLanguageStore: ObservableObject {
    private static let storageKey = "appLanguage"
    private let defaults: UserDefaults

    @Published var language: AppLanguage {
        didSet { defaults.set(language.rawValue, forKey: Self.storageKey) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        language = defaults.string(forKey: Self.storageKey).flatMap(AppLanguage.init(rawValue:)) ?? .simplifiedChinese
    }
}

enum L10nKey: String, CaseIterable {
    case appName, ok, cancel, save, change, delete, restore, trash, empty, add, lock, copy, importAction
    case language, simplifiedChinese, english, appearance, brandSubtitle
    case vault, favorites, recent, settings
    case passVaultLocked, createMasterPassword, unlock, masterPassword, confirmPassword, createVault, quickUnlock, recoveryWarning, passwordsDoNotMatch
    case trashIsEmpty, noItems, deletedRecordsHere, tapAddRecord, searchPrompt, importAttachment, unableImportAttachment, untitled
    case kindAccount, kindWebsite, kindSecureNote, kindTotp, kindCustom, kindAttachment
    case record, type, title, organization, group, tags, favorite, unfavorite, pin, unpin, remove, notes, editItem, newItem
    case unsavedChanges, discardChanges, continueEditing
    case credentials, username, password, hidePassword, showPassword, passwordGenerator, length, uppercase, lowercase, digits, symbols, generate, useGeneratedPassword, selectCharacterClass, website
    case authenticator, totpSecret, encryptedAttachment, filename, size, attachmentExplanation, previewFile, exportFile, unableExportAttachment
    case customFields, name, value, secret, addCustomField, applyTemplate, saveAsTemplate, templateName, deleteTemplate, replaceFields
    case security, quickUnlockSetting, quickUnlockExplanation, changeMasterPassword, lockNow
    case encryptedBackup, exportBackup, importBackup, backupExplanation, settingsTitle, unableExportBackup, unableReadBackup
    case backupMasterPassword, importedPasswordExplanation, confirmImport, verifyBackup, replaceVault, backupCreatedAt, backupRecords, backupAttachments, backupAttachmentSize, currentVaultRecords, backupWillReplace, currentMasterPassword, newMasterPassword, confirmNewPassword, changePassword
    case useAtLeast8, quickUnlockReason, useMasterPassword, quickUnlockFailed, unableOpenVault
    case backupImportedDisableFailed, backupImported, backupRejected, masterPasswordChanged, masterPasswordNotChanged
    case quickUnlockEnabled, quickUnlockDisabled, unableUpdateQuickUnlock, copiedClipboard, unableSaveChanges
    case myVault, newRecord, more, tagFilter, defaultGroup, contentLocalOnly, chooseItem, allItems
    case history, noHistory, restoreVersion, encryptedShare, exportEncryptedItem, importEncryptedItem, sharePassword, shareExplanation
    case unableExportSharedItem, unableImportSharedItem, sharedItemImported, localCapabilityBoundary
}

enum L10n {
    static func text(_ key: L10nKey, language: AppLanguage) -> String {
        (language == .simplifiedChinese ? zh : en)[key]!
    }

    static func kind(_ kind: VaultItemKind, language: AppLanguage) -> String {
        let key: L10nKey
        switch kind {
        case .account: key = .kindAccount
        case .website: key = .kindWebsite
        case .secureNote: key = .kindSecureNote
        case .totp: key = .kindTotp
        case .custom: key = .kindCustom
        case .attachment: key = .kindAttachment
        }
        return text(key, language: language)
    }

    private static let zh: [L10nKey: String] = [
        .appName: "密码保险库", .ok: "好", .cancel: "取消", .save: "保存", .change: "更改", .delete: "删除", .restore: "恢复", .trash: "恢复中心", .empty: "清空", .add: "添加", .lock: "锁定", .copy: "复制", .importAction: "导入",
        .language: "语言", .simplifiedChinese: "简体中文", .english: "English", .appearance: "外观与语言", .brandSubtitle: "本地加密保险库",
        .vault: "保险库", .favorites: "收藏", .recent: "最近使用", .settings: "设置",
        .passVaultLocked: "密码保险库已锁定", .createMasterPassword: "创建主密码", .unlock: "解锁", .masterPassword: "主密码", .confirmPassword: "确认密码", .createVault: "创建保险库", .quickUnlock: "快速解锁", .recoveryWarning: "本应用不提供远程恢复。主密码始终是恢复保险库的方式，请妥善保管。", .passwordsDoNotMatch: "两次输入的密码不一致。",
        .trashIsEmpty: "恢复中心为空", .noItems: "暂无项目", .deletedRecordsHere: "已删除的记录会显示在这里。", .tapAddRecord: "轻点 + 添加加密记录。", .searchPrompt: "搜索记录和字段", .importAttachment: "导入附件", .unableImportAttachment: "无法导入附件。", .untitled: "未命名",
        .kindAccount: "账户", .kindWebsite: "网站", .kindSecureNote: "安全笔记", .kindTotp: "验证码", .kindCustom: "自定义", .kindAttachment: "附件",
        .record: "记录", .type: "类型", .title: "标题", .organization: "整理", .group: "分组", .tags: "标签", .favorite: "收藏", .unfavorite: "取消收藏", .pin: "置顶", .unpin: "取消置顶", .remove: "移除", .notes: "备注", .editItem: "编辑项目", .newItem: "新建项目",
        .unsavedChanges: "有未保存的修改", .discardChanges: "放弃修改", .continueEditing: "继续编辑",
        .credentials: "凭据", .username: "用户名", .password: "密码", .hidePassword: "隐藏密码", .showPassword: "显示密码", .passwordGenerator: "密码生成器", .length: "长度", .uppercase: "大写字母", .lowercase: "小写字母", .digits: "数字", .symbols: "符号", .generate: "生成", .useGeneratedPassword: "填入此密码", .selectCharacterClass: "请至少选择一种字符类型。", .website: "网站",
        .authenticator: "身份验证器", .totpSecret: "TOTP Base32 密钥", .encryptedAttachment: "加密附件", .filename: "文件名", .size: "大小", .attachmentExplanation: "文件存储在经过认证的加密保险库中。附件没有应用预设的固定大小限制，实际容量取决于设备可用存储。", .previewFile: "预览文件", .exportFile: "导出文件", .unableExportAttachment: "无法导出附件。",
        .customFields: "自定义字段", .name: "名称", .value: "值", .secret: "敏感字段", .addCustomField: "添加自定义字段", .applyTemplate: "应用模板", .saveAsTemplate: "保存为模板", .templateName: "模板名称", .deleteTemplate: "删除模板", .replaceFields: "替换现有字段",
        .security: "安全", .quickUnlockSetting: "面容 ID / 设备所有者快速解锁", .quickUnlockExplanation: "保险库密钥的设备专用钥匙串副本需要验证用户身份。您仍可使用主密码。", .changeMasterPassword: "更改主密码", .lockNow: "立即锁定",
        .encryptedBackup: "加密备份", .exportBackup: "导出备份", .importBackup: "导入备份", .backupExplanation: "只有在格式、版本、密码和 AES-GCM 认证全部通过后，导入才会替换此设备上的保险库。", .settingsTitle: "设置", .unableExportBackup: "无法导出加密备份。", .unableReadBackup: "无法读取备份。",
        .backupMasterPassword: "备份的主密码", .importedPasswordExplanation: "导入的保险库会保留原来的主密码。", .confirmImport: "确认导入", .verifyBackup: "验证并预览", .replaceVault: "替换保险库", .backupCreatedAt: "备份时间", .backupRecords: "备份资料", .backupAttachments: "附件数量", .backupAttachmentSize: "附件大小", .currentVaultRecords: "当前资料", .backupWillReplace: "确认后将完全替换当前设备上的保险库，此操作不可撤销。", .currentMasterPassword: "当前主密码", .newMasterPassword: "新主密码", .confirmNewPassword: "确认新密码", .changePassword: "更改密码",
        .useAtLeast8: "请至少使用 8 个字符。", .quickUnlockReason: "解锁密码保险库", .useMasterPassword: "使用主密码", .quickUnlockFailed: "快速解锁失败，请使用主密码。", .unableOpenVault: "无法打开保险库。",
        .backupImportedDisableFailed: "备份已导入，但旧的快速解锁凭据无法移除。保险库已锁定；请使用导入备份的主密码重新进入后重试关闭快速解锁。", .backupImported: "加密备份已导入。为安全起见，快速解锁已关闭。", .backupRejected: "备份被拒绝。文件可能已损坏、不兼容或使用了其他密码。", .masterPasswordChanged: "主密码已更改。", .masterPasswordNotChanged: "未能更改主密码。",
        .quickUnlockEnabled: "快速解锁已开启。", .quickUnlockDisabled: "快速解锁已关闭。", .unableUpdateQuickUnlock: "无法在此设备上更新快速解锁。", .copiedClipboard: "已复制；剪贴板将按安全设置处理。", .unableSaveChanges: "无法保存更改。",
        .myVault: "我的密码库", .newRecord: "新建", .more: "更多", .tagFilter: "标签", .defaultGroup: "默认", .contentLocalOnly: "内容只会在本机解密。", .chooseItem: "选择一项查看详情", .allItems: "全部",
        .history: "历史版本", .noHistory: "暂无历史版本", .restoreVersion: "恢复此版本", .encryptedShare: "加密分享", .exportEncryptedItem: "导出加密资料", .importEncryptedItem: "导入加密资料", .sharePassword: "分享文件密码", .shareExplanation: "导出独立的密码保护文件。接收方需输入此密码；本应用不创建云端链接。",
        .unableExportSharedItem: "无法导出加密资料。", .unableImportSharedItem: "无法导入加密资料。文件可能损坏或密码错误。", .sharedItemImported: "加密资料已作为新项目导入。", .localCapabilityBoundary: "完全本地：不提供云同步、在线分享链接或远程撤销。"
    ]

    private static let en: [L10nKey: String] = [
        .appName: "Pass Vault", .ok: "OK", .cancel: "Cancel", .save: "Save", .change: "Change", .delete: "Delete", .restore: "Restore", .trash: "Recovery Center", .empty: "Empty", .add: "Add", .lock: "Lock", .copy: "Copy", .importAction: "Import",
        .language: "Language", .simplifiedChinese: "简体中文", .english: "English", .appearance: "Appearance & Language", .brandSubtitle: "Local encrypted vault",
        .vault: "Vault", .favorites: "Favorites", .recent: "Recent", .settings: "Settings",
        .passVaultLocked: "Pass Vault Locked", .createMasterPassword: "Create master password", .unlock: "Unlock", .masterPassword: "Master password", .confirmPassword: "Confirm password", .createVault: "Create Vault", .quickUnlock: "Quick Unlock", .recoveryWarning: "There is no remote recovery. Your master password always remains the recovery method; keep it safe.", .passwordsDoNotMatch: "Passwords do not match.",
        .trashIsEmpty: "Recovery Center is Empty", .noItems: "No Items", .deletedRecordsHere: "Deleted records appear here.", .tapAddRecord: "Tap + to add an encrypted record.", .searchPrompt: "Search records and fields", .importAttachment: "Import attachment", .unableImportAttachment: "Unable to import attachment.", .untitled: "Untitled",
        .kindAccount: "Account", .kindWebsite: "Website", .kindSecureNote: "Secure note", .kindTotp: "Authenticator", .kindCustom: "Custom", .kindAttachment: "Attachment",
        .record: "Record", .type: "Type", .title: "Title", .organization: "Organization", .group: "Group", .tags: "Tags", .favorite: "Favorite", .unfavorite: "Unfavorite", .pin: "Pin", .unpin: "Unpin", .remove: "Remove", .notes: "Notes", .editItem: "Edit Item", .newItem: "New Item",
        .unsavedChanges: "Unsaved Changes", .discardChanges: "Discard Changes", .continueEditing: "Continue Editing",
        .credentials: "Credentials", .username: "Username", .password: "Password", .hidePassword: "Hide password", .showPassword: "Show password", .passwordGenerator: "Password generator", .length: "Length", .uppercase: "Uppercase", .lowercase: "Lowercase", .digits: "Digits", .symbols: "Symbols", .generate: "Generate", .useGeneratedPassword: "Use This Password", .selectCharacterClass: "Select at least one character class.", .website: "Website",
        .authenticator: "Authenticator", .totpSecret: "TOTP Base32 secret", .encryptedAttachment: "Encrypted attachment", .filename: "Filename", .size: "Size", .attachmentExplanation: "Stored inside the authenticated encrypted vault payload. The app sets no fixed attachment-size limit; practical capacity depends on available device storage.", .previewFile: "Preview File", .exportFile: "Export File", .unableExportAttachment: "Unable to export attachment.",
        .customFields: "Custom fields", .name: "Name", .value: "Value", .secret: "Secret", .addCustomField: "Add custom field", .applyTemplate: "Apply Template", .saveAsTemplate: "Save as Template", .templateName: "Template name", .deleteTemplate: "Delete template", .replaceFields: "Replace Existing Fields",
        .security: "Security", .quickUnlockSetting: "Face ID / device-owner quick unlock", .quickUnlockExplanation: "A device-only Keychain copy of the vault key requires user presence. Your master password remains available.", .changeMasterPassword: "Change Master Password", .lockNow: "Lock Now",
        .encryptedBackup: "Encrypted Backup", .exportBackup: "Export Backup", .importBackup: "Import Backup", .backupExplanation: "Import replaces this local vault only after format, version, password, and AES-GCM authentication all succeed.", .settingsTitle: "Settings", .unableExportBackup: "Unable to export encrypted backup.", .unableReadBackup: "Unable to read backup.",
        .backupMasterPassword: "Backup master password", .importedPasswordExplanation: "The imported vault keeps its original master password.", .confirmImport: "Confirm Import", .verifyBackup: "Verify & Preview", .replaceVault: "Replace Vault", .backupCreatedAt: "Backup created", .backupRecords: "Backup records", .backupAttachments: "Attachments", .backupAttachmentSize: "Attachment size", .currentVaultRecords: "Current records", .backupWillReplace: "Confirmation completely replaces this device's current vault and cannot be undone.", .currentMasterPassword: "Current master password", .newMasterPassword: "New master password", .confirmNewPassword: "Confirm new password", .changePassword: "Change Password",
        .useAtLeast8: "Use at least 8 characters.", .quickUnlockReason: "Unlock Pass Vault", .useMasterPassword: "Use master password", .quickUnlockFailed: "Quick unlock failed. Use your master password.", .unableOpenVault: "Unable to open the vault.",
        .backupImportedDisableFailed: "Backup imported, but the old quick-unlock credential could not be removed. The vault was locked; unlock with the imported backup password, then retry disabling quick unlock.", .backupImported: "Encrypted backup imported. Quick unlock was disabled for safety.", .backupRejected: "Backup rejected. It may be damaged, incompatible, or use a different password.", .masterPasswordChanged: "Master password changed.", .masterPasswordNotChanged: "Master password was not changed.",
        .quickUnlockEnabled: "Quick unlock enabled.", .quickUnlockDisabled: "Quick unlock disabled.", .unableUpdateQuickUnlock: "Unable to update quick unlock on this device.", .copiedClipboard: "Copied; clipboard handling follows your security setting.", .unableSaveChanges: "Unable to save changes.",
        .myVault: "My Vault", .newRecord: "New", .more: "More", .tagFilter: "Tags", .defaultGroup: "Default", .contentLocalOnly: "Content is decrypted only on this device.", .chooseItem: "Select an item to view details", .allItems: "All",
        .history: "History", .noHistory: "No history yet", .restoreVersion: "Restore This Version", .encryptedShare: "Encrypted Share", .exportEncryptedItem: "Export Encrypted Item", .importEncryptedItem: "Import Encrypted Item", .sharePassword: "Share file password", .shareExplanation: "Exports a standalone password-protected file. The recipient needs this password; no cloud link is created.",
        .unableExportSharedItem: "Unable to export encrypted item.", .unableImportSharedItem: "Unable to import encrypted item. The file may be damaged or use another password.", .sharedItemImported: "Encrypted item imported as a new record.", .localCapabilityBoundary: "Local-only: no cloud sync, online share links, or remote revocation."
    ]
}
