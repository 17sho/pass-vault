import XCTest
@testable import PassVault

final class LocalizationTests: XCTestCase {
    func testChineseIsDefaultAndLanguageCanPersist() {
        let suite = "PassVault.LocalizationTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = AppLanguageStore(defaults: defaults)
        XCTAssertEqual(store.language, .simplifiedChinese)
        store.language = .english
        XCTAssertEqual(AppLanguageStore(defaults: defaults).language, .english)
    }

    func testBothLanguagesCoverAllKeys() {
        for key in L10nKey.allCases {
            XCTAssertFalse(L10n.text(key, language: .simplifiedChinese).isEmpty)
            XCTAssertFalse(L10n.text(key, language: .english).isEmpty)
            XCTAssertNotEqual(L10n.text(key, language: .simplifiedChinese), key.rawValue)
            XCTAssertNotEqual(L10n.text(key, language: .english), key.rawValue)
        }
    }
}
