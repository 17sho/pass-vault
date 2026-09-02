import XCTest
@testable import PassVault

final class CustomFieldTemplateTests: XCTestCase {
    func testLegacyVaultDecodesWithNoTemplates() throws {
        let vault = try JSONDecoder().decode(Vault.self, from: Data(#"{"version":1,"items":[]}"#.utf8))
        XCTAssertTrue(vault.customFieldTemplates.isEmpty)
    }

    func testTemplateApplicationAlwaysCreatesFreshFieldIdentifiers() throws {
        let template = try CustomFieldTemplate(name: "身份", fields: [
            CustomFieldTemplateField(name: "证件号", value: "", isSecret: true),
            CustomFieldTemplateField(name: "签发地", value: "", isSecret: false)
        ])
        let first = template.makeCustomFields()
        let second = template.makeCustomFields()
        XCTAssertEqual(first.map(\.name), second.map(\.name))
        XCTAssertEqual(first.map(\.isSecret), second.map(\.isSecret))
        XCTAssertTrue(Set(first.map(\.id)).isDisjoint(with: Set(second.map(\.id))))
        XCTAssertEqual(Set(first.map(\.id)).count, first.count)
    }

    func testInvalidTemplateFieldContractIsRejected() {
        XCTAssertThrowsError(try CustomFieldTemplate(name: "Invalid", fields: [
            CustomFieldTemplateField(name: " ", value: "", isSecret: false)
        ]))
    }

    func testTemplatesRoundTripInsideEncryptedVault() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = EncryptedVaultStore(url: url, kdfIterations: 1_000)
        var session = try store.create(password: "master-password")
        session.vault.customFieldTemplates = [try CustomFieldTemplate(name: "Work", fields: [CustomFieldTemplateField(name: "Employee ID", value: "", isSecret: true)])]
        try store.save(session)
        let unlocked = try store.unlock(password: "master-password")
        XCTAssertEqual(unlocked.vault.customFieldTemplates.first?.name, "Work")
    }
}
