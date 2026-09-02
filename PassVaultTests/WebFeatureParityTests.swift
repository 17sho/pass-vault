import XCTest
@testable import PassVault

final class WebFeatureParityTests: XCTestCase {
    func testCustomRecordFieldsPersistTypeConditionAndRecursiveVisibility() throws {
        let source = CustomField(name: "环境", value: "生产", type: .text)
        let dependent = CustomField(name: "密钥", value: "secret", type: .secret, condition: CustomFieldCondition(fieldID: source.id, equals: "生产"))
        let hidden = CustomField(name: "测试密钥", value: "hidden", type: .secret, condition: CustomFieldCondition(fieldID: source.id, equals: "测试"))
        let fields = [source, dependent, hidden]
        XCTAssertTrue(CustomFieldVisibility.isVisible(dependent, in: fields))
        XCTAssertFalse(CustomFieldVisibility.isVisible(hidden, in: fields))
        XCTAssertEqual(try JSONDecoder().decode([CustomField].self, from: JSONEncoder().encode(fields)), fields)
    }

    func testCloningCustomRecordRegeneratesFieldIDsAndRewritesConditions() {
        let source = CustomField(name: "环境", value: "生产", type: .text)
        let dependent = CustomField(name: "地址", value: "example.test", type: .url, condition: CustomFieldCondition(fieldID: source.id, equals: "生产"))
        let clone = CustomRecordPolicy.cloneFields([source, dependent])
        XCTAssertNotEqual(clone[0].id, source.id)
        XCTAssertEqual(clone[1].condition?.fieldID, clone[0].id)
    }

    func testSixBuiltInCustomRecordTemplatesMatchWebContract() {
        XCTAssertEqual(BuiltInCustomRecordTemplate.allCases.map(\.id), ["blank", "bank-card", "identity", "api", "server", "software-license"])
        XCTAssertEqual(BuiltInCustomRecordTemplate.bankCard.fields.map(\.type), [.text, .secret, .date, .secret, .textarea, .text])
    }
    func testCustomFieldPolicyMatchesWebBoundsAndRejectsDuplicateIDs() throws {
        XCTAssertNoThrow(try CustomFieldPolicy.validate([]))
        XCTAssertNoThrow(try CustomFieldPolicy.validate([
            CustomField(name: "IP 地址", value: "192.0.2.10"),
            CustomField(name: "密码", value: "secret", isSecret: true)
        ]))
        XCTAssertThrowsError(try CustomFieldPolicy.validate(Array(repeating: CustomField(name: "字段", value: "值"), count: 21)))
        XCTAssertThrowsError(try CustomFieldPolicy.validate([CustomField(name: "", value: "值")]))
        XCTAssertThrowsError(try CustomFieldPolicy.validate([CustomField(name: String(repeating: "名", count: 81), value: "值")]))
        XCTAssertThrowsError(try CustomFieldPolicy.validate([CustomField(name: "字段", value: String(repeating: "值", count: 10_001))]))

        let duplicate = UUID()
        XCTAssertThrowsError(try CustomFieldPolicy.validate([
            CustomField(id: duplicate, name: "一", value: "1"),
            CustomField(id: duplicate, name: "二", value: "2")
        ]))
    }

    func testCanonicalItemDecodeRejectsInvalidCustomFields() throws {
        let payload = #"{"id":"00000000-0000-0000-0000-000000000001","kind":"custom","title":"Broken","credentials":[],"url":"","notes":"","totpSecret":"","customFields":[{"id":"10000000-0000-0000-0000-000000000001","name":"","value":"x","isSecret":false}],"tags":[],"group":"","isFavorite":false,"isPinned":false,"createdAt":0,"modifiedAt":0}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .secondsSince1970
        XCTAssertThrowsError(try decoder.decode(VaultItem.self, from: payload))
    }

    func testSearchUsesVisibleFieldsAndNeverIndexesSecretCustomFieldNamesOrValues() {
        let item = VaultItem(
            kind: .custom,
            title: "服务器资料",
            customFields: [
                CustomField(name: "机房", value: "东京", isSecret: false),
                CustomField(name: "Support PIN", value: "928461", isSecret: true)
            ]
        )
        let vault = Vault(items: [item])

        XCTAssertEqual(vault.search("东京").map(\.id), [item.id])
        XCTAssertTrue(vault.search("Support PIN").isEmpty)
        XCTAssertTrue(vault.search("928461").isEmpty)
    }

    func testFuzzySearchNormalizesPunctuationAndRanksExactPrefixBeforeSubstring() {
        let exact = VaultItem(title: "GitHub")
        let prefix = VaultItem(title: "GitHub Work")
        let punctuation = VaultItem(title: "Git-Hub Backup")
        let substring = VaultItem(title: "My GitHub Account")
        let vault = Vault(items: [substring, punctuation, prefix, exact])

        XCTAssertEqual(vault.search("github").map(\.id), [exact.id, prefix.id, punctuation.id, substring.id])
    }

    func testInteractionCoordinatorKeepsEditorOpenWhenSaveFails() {
        XCTAssertFalse(WebInteractionPolicy.shouldDismiss(operationSucceeded: false))
        XCTAssertTrue(WebInteractionPolicy.shouldDismiss(operationSucceeded: true))
    }

    func testExistingItemTypeIsImmutableAndFieldSectionsAreTypeSpecific() {
        XCTAssertFalse(VaultEditorPolicy.canChangeKind(isExistingItem: true))
        XCTAssertTrue(VaultEditorPolicy.canChangeKind(isExistingItem: false))
        XCTAssertEqual(VaultEditorPolicy.sections(for: .account), [.credentials, .website, .organization, .notes, .customFields])
        XCTAssertEqual(VaultEditorPolicy.sections(for: .website), [.website, .organization, .notes, .customFields])
        XCTAssertEqual(VaultEditorPolicy.sections(for: .totp), [.totp, .organization, .notes, .customFields])
        XCTAssertEqual(VaultEditorPolicy.sections(for: .custom), [.organization, .notes, .customFields])
    }

    func testAccountSupportsOneToTwentyStableCredentialRows() throws {
        var item = VaultItem(kind: .account, title: "GitHub", username: "legacy-user", password: "legacy-secret")
        XCTAssertEqual(item.credentials.map(\.username), ["legacy-user"])

        item.credentials.append(VaultCredential(username: "second", password: "second-secret"))
        XCTAssertNoThrow(try VaultCredentialPolicy.validate(item.credentials))
        XCTAssertThrowsError(try VaultCredentialPolicy.validate([]))
        XCTAssertThrowsError(try VaultCredentialPolicy.validate(Array(repeating: VaultCredential(), count: 21)))
    }

    func testLegacyTopLevelCredentialDecodesAndReencodesCanonicalCredentials() throws {
        let legacy = #"{"id":"00000000-0000-0000-0000-000000000001","kind":"account","title":"Legacy","username":"old","password":"secret","url":"","notes":"","totpSecret":"","customFields":[],"tags":[],"group":"","isFavorite":false,"isPinned":false,"isDeleted":false,"createdAt":0,"modifiedAt":0}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .secondsSince1970
        let item = try decoder.decode(VaultItem.self, from: legacy)
        XCTAssertEqual(item.credentials.count, 1)
        XCTAssertEqual(item.credentials.first?.username, "old")
        XCTAssertEqual(item.credentials.first?.password, "secret")

        let encoded = try JSONEncoder().encode(item)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertNotNil(object["credentials"])
        XCTAssertNil(object["username"])
        XCTAssertNil(object["password"])
    }

    func testVaultPersistsRegistriesAndDefaultsOldVaultsToEmpty() throws {
        var tags = TagRegistry(); tags.create(name: "工作", colorHex: "176B57")
        var groups = GroupRegistry(); groups.create(name: "生产", kind: .account)
        let original = Vault(tagRegistry: tags, groupRegistry: groups)
        let decoded = try JSONDecoder().decode(Vault.self, from: JSONEncoder().encode(original))
        XCTAssertEqual(decoded.tagRegistry, tags)
        XCTAssertEqual(decoded.groupRegistry, groups)

        let old = #"{"version":1,"items":[]}"#.data(using: .utf8)!
        let legacy = try JSONDecoder().decode(Vault.self, from: old)
        XCTAssertTrue(legacy.tagRegistry.tags.isEmpty)
        XCTAssertTrue(legacy.groupRegistry.groups(for: .account).isEmpty)
    }

    func testTrashUsesDeletionTimestampAndExpiryPolicy() {
        let now = Date(timeIntervalSince1970: 2_000_000)
        var item = VaultItem(title: "Deleted")
        item.moveToTrash(at: now)
        XCTAssertEqual(item.deletedAt, now)
        XCTAssertTrue(item.isDeleted)
        XCTAssertFalse(TrashRetentionPolicy.isExpired(item, now: now.addingTimeInterval(29 * 86_400), retentionDays: 30))
        XCTAssertTrue(TrashRetentionPolicy.isExpired(item, now: now.addingTimeInterval(31 * 86_400), retentionDays: 30))
        item.restoreFromTrash()
        XCTAssertNil(item.deletedAt)
    }

    func testLegacyTrashStartsFreshRetentionWindowInsteadOfUsingModifiedAt() throws {
        let legacy = #"{"id":"00000000-0000-0000-0000-000000000001","kind":"account","title":"Legacy Trash","username":"old","password":"secret","url":"","notes":"","totpSecret":"","customFields":[],"tags":[],"group":"","isFavorite":false,"isPinned":false,"isDeleted":true,"createdAt":0,"modifiedAt":0}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .secondsSince1970
        let item = try decoder.decode(VaultItem.self, from: legacy)
        XCTAssertTrue(item.isDeleted)
        XCTAssertFalse(TrashRetentionPolicy.isExpired(item, now: Date(), retentionDays: 30))
    }

    func testCanonicalCredentialsRejectHalfEmptyDuplicateAndEmptyRows() throws {
        XCTAssertThrowsError(try VaultCredentialPolicy.validate([VaultCredential(username: "only-user", password: "")]))
        XCTAssertThrowsError(try VaultCredentialPolicy.validate([VaultCredential(username: "", password: "only-secret")]))
        XCTAssertNoThrow(try VaultCredentialPolicy.validate([VaultCredential()]))

        let duplicate = UUID()
        XCTAssertThrowsError(try VaultCredentialPolicy.validate([
            VaultCredential(id: duplicate, username: "a", password: "1"),
            VaultCredential(id: duplicate, username: "b", password: "2")
        ]))

        let canonical = #"{"id":"00000000-0000-0000-0000-000000000001","kind":"account","title":"Broken","credentials":[],"url":"","notes":"","totpSecret":"","customFields":[],"tags":[],"group":"","isFavorite":false,"isPinned":false,"createdAt":0,"modifiedAt":0}"#.data(using: .utf8)!
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .secondsSince1970
        XCTAssertThrowsError(try decoder.decode(VaultItem.self, from: canonical))
    }

    func testNonAccountRecordsDoNotApplyAccountCredentialCompletenessRule() throws {
        let item = VaultItem(kind: .totp, title: "Authenticator", username: "owner@example.test", totpSecret: "JBSWY3DPEHPK3PXP")
        let data = try JSONEncoder().encode(item)
        XCTAssertEqual(try JSONDecoder().decode(VaultItem.self, from: data).username, "owner@example.test")
    }

    func testSecretFieldPresentationCopiesOriginalValueWhileRemainingMasked() {
        let field = CustomField(name: "PIN", value: "928461", isSecret: true)
        let presentation = SecretFieldPresentation(field: field)

        XCTAssertEqual(presentation.displayValue(revealed: false), "••••••••")
        XCTAssertEqual(presentation.displayValue(revealed: true), "928461")
        XCTAssertEqual(presentation.copyValue, "928461")
    }


    func testAttachmentCategoryAndExpandedPreviewContract() {
        XCTAssertEqual(AttachmentMetadataPolicy.category(name: "photo.png"), .image)
        XCTAssertEqual(AttachmentMetadataPolicy.category(name: "movie.mp4"), .video)
        XCTAssertEqual(AttachmentMetadataPolicy.category(name: "archive.zip"), .other)
        XCTAssertEqual(AttachmentPreviewPolicy.previewKind(name: "config.yaml", data: Data("key: value".utf8)), .text)
        XCTAssertEqual(AttachmentPreviewPolicy.previewKind(name: "script.swift", data: Data("let x = 1".utf8)), .text)
    }

    func testAttachmentCategoryFilterKeepsOnlyTheChosenVisibleAttachmentKind() {
        let image = VaultItem(kind: .attachment, title: "photo.png", attachmentName: "photo.png")
        let video = VaultItem(kind: .attachment, title: "movie.mp4", attachmentName: "movie.mp4")
        let other = VaultItem(kind: .attachment, title: "archive.zip", attachmentName: "archive.zip")
        let deletedImage = VaultItem(kind: .attachment, title: "old.jpg", isDeleted: true, attachmentName: "old.jpg")
        let vault = Vault(items: [image, video, other, deletedImage])

        XCTAssertEqual(
            VaultListPolicy.items(in: vault, query: "", filter: .all, kind: .attachment, attachmentCategory: .image).map(\.id),
            [image.id]
        )
        XCTAssertEqual(
            VaultListPolicy.items(in: vault, query: "", filter: .all, kind: .attachment, attachmentCategory: .video).map(\.id),
            [video.id]
        )
        XCTAssertEqual(
            VaultListPolicy.items(in: vault, query: "", filter: .all, kind: .attachment, attachmentCategory: .other).map(\.id),
            [other.id]
        )
        XCTAssertEqual(
            VaultListPolicy.items(in: vault, query: "", filter: .all, kind: .account).map(\.id),
            []
        )
        XCTAssertEqual(
            VaultListPolicy.items(in: Vault(items: [VaultItem(kind: .account, title: "Account")]), query: "", filter: .all, kind: .account, attachmentCategory: nil).map(\.kind),
            [.account]
        )
    }
}
