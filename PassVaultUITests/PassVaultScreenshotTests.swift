import XCTest

final class PassVaultScreenshotTests: XCTestCase {
    private let masterPassword = "UITest-Only-Password"
    private let demoAccountID = "10000000-0000-0000-0000-000000000001"

    @MainActor
    func testCaptureCoreScreens() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "-ui-testing-unlocked", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.terminate()
        app.launch()

        let account = app.descendants(matching: .any)["vault-item-\(demoAccountID)"]
        XCTAssertTrue(account.waitForExistence(timeout: 10), "The isolated UI-test fixture must open its vault")
        capture("01-unlocked-vault")

        XCTAssertTrue(account.exists, "The fixture account must remain visible")
        capture("02-vault-list")

        account.tap()
        XCTAssertTrue(app.staticTexts["Demo Bank Account"].waitForExistence(timeout: 10))
        capture("03-item-detail")

        let detailBack = app.buttons["item-detail-back"]
        if detailBack.waitForExistence(timeout: 2) {
            XCTAssertTrue(detailBack.isHittable)
            detailBack.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            XCTAssertTrue(detailBack.waitForNonExistence(timeout: 5), "Phone detail navigation must return to the vault list")
            XCTAssertTrue(app.buttons["new-record"].waitForExistence(timeout: 10))
        } else {
            XCTAssertTrue(app.buttons["new-record"].waitForExistence(timeout: 5), "Tablet split view must keep the vault list visible beside detail")
        }

        let newRecord = app.buttons["new-record"]
        XCTAssertTrue(newRecord.waitForExistence(timeout: 10), "Vault list must be available before opening theme")
        XCTAssertTrue(newRecord.isHittable, "Vault list controls must be interactive after returning from detail")

        openTheme(in: app)
        XCTAssertTrue(app.descendants(matching: .any)["modal-card"].waitForExistence(timeout: 10))
        capture("06-theme")
        let closeTheme = app.buttons["close-product-modal"].firstMatch
        XCTAssertTrue(closeTheme.waitForExistence(timeout: 5))
        closeTheme.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(newRecord.waitForExistence(timeout: 10) && newRecord.isHittable)

        let relaunchedNewRecord = app.buttons["new-record"]
        XCTAssertTrue(relaunchedNewRecord.waitForExistence(timeout: 10) && relaunchedNewRecord.isHittable)
        relaunchedNewRecord.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.descendants(matching: .any)["modal-card"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["new-kind-account"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["new-import-encrypted-item"].exists)
        XCTAssertTrue(app.buttons["new-kind-attachment"].exists)
        XCTAssertTrue(app.buttons["new-kind-custom"].exists)
        XCTAssertFalse(app.buttons["new-custom-template-blank"].exists, "Custom templates must stay behind the web-equivalent second-level choice")
        capture("07-new-item-modal")
        app.buttons["new-kind-custom"].tap()
        XCTAssertTrue(app.buttons["new-custom-template-blank"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["close-custom-template-picker"].exists)
        app.buttons["close-custom-template-picker"].tap()
        XCTAssertTrue(app.buttons["new-kind-account"].waitForExistence(timeout: 5))
        app.buttons["new-kind-account"].tap()
        XCTAssertTrue(app.buttons["close-product-modal"].waitForExistence(timeout: 5))
        capture("08-editor-modal")
        app.buttons["close-product-modal"].tap()
        XCTAssertTrue(app.buttons["new-record"].waitForExistence(timeout: 10))
    }

    @MainActor
    func testAnchoredMenuAndSwipeDeleteAreFunctional() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "-ui-testing-unlocked", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.terminate()
        app.launch()

        let item = app.descendants(matching: .any)["vault-item-\(demoAccountID)"]
        XCTAssertTrue(item.waitForExistence(timeout: 10))
        let actions = app.buttons["item-actions-\(demoAccountID)"]
        XCTAssertTrue(actions.waitForExistence(timeout: 5) && actions.isHittable)
        actions.tap()
        XCTAssertTrue(app.descendants(matching: .any)["anchored-item-menu"].waitForExistence(timeout: 5))

        let backdrop = app.descendants(matching: .any)["anchored-item-menu-backdrop"]
        XCTAssertTrue(backdrop.waitForExistence(timeout: 5))
        backdrop.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.95)).tap()
        XCTAssertTrue(app.descendants(matching: .any)["anchored-item-menu"].waitForNonExistence(timeout: 5))

        let freshItem = app.descendants(matching: .any)["vault-item-\(demoAccountID)"]
        XCTAssertTrue(freshItem.waitForExistence(timeout: 10))
        freshItem.swipeLeft()
        let delete = app.buttons["swipe-delete-\(demoAccountID)"]
        XCTAssertTrue(delete.waitForExistence(timeout: 5) && delete.isHittable)
        delete.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let cancel = app.buttons["confirm-modal-cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 5) && cancel.isHittable)
        cancel.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.descendants(matching: .any)["vault-item-\(demoAccountID)"].waitForExistence(timeout: 8))
    }

    @MainActor
    func testMoreDestinationsAndNewItemRoutesAreReachable() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "-ui-testing-unlocked", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.terminate()
        app.launch()
        XCTAssertTrue(app.buttons["new-record"].waitForExistence(timeout: 10))

        for destination in ["globalSearch", "tags", "groupOrder", "pinOrder", "bulkGroup"] {
            let more = app.descendants(matching: .any)["vault-more-menu"]
            XCTAssertTrue(more.waitForExistence(timeout: 8) && more.isHittable)
            more.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let entry = app.descendants(matching: .any)["more-\(destination)"]
            let moreScroll = app.descendants(matching: .any)["more-menu-scroll"]
            XCTAssertTrue(moreScroll.waitForExistence(timeout: 5))
            var entryScrollAttempts = 0
            while (!entry.exists || !entry.isHittable) && entryScrollAttempts < 8 {
                moreScroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
                    .press(forDuration: 0.05, thenDragTo: moreScroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22)))
                entryScrollAttempts += 1
            }
            XCTAssertTrue(entry.exists, "Missing More entry \(destination)")
            XCTAssertTrue(entry.isHittable, "More entry \(destination) exists but cannot receive a real tap")
            entry.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let target = app.descendants(matching: .any)["more-destination-\(destination)"]
            XCTAssertTrue(target.waitForExistence(timeout: 8), "More entry \(destination) did not open its destination")
            let close = app.buttons["close-product-modal"].firstMatch
            XCTAssertTrue(close.waitForExistence(timeout: 5), "Destination \(destination) has no working close control")
            close.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            XCTAssertTrue(target.waitForNonExistence(timeout: 8), "Destination \(destination) must close before reopening More")
        }

        for destination in ["customRecords", "recoveryCenter"] {
            let more = app.descendants(matching: .any)["vault-more-menu"]
            XCTAssertTrue(more.waitForExistence(timeout: 8) && more.isHittable)
            more.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let entry = app.descendants(matching: .any)["more-\(destination)"]
            let moreScroll = app.descendants(matching: .any)["more-menu-scroll"]
            XCTAssertTrue(moreScroll.waitForExistence(timeout: 5))
            var entryScrollAttempts = 0
            while (!entry.exists || !entry.isHittable) && entryScrollAttempts < 8 {
                moreScroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
                    .press(forDuration: 0.05, thenDragTo: moreScroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22)))
                entryScrollAttempts += 1
            }
            XCTAssertTrue(entry.exists, "Missing More entry \(destination)")
            XCTAssertTrue(entry.isHittable, "More entry \(destination) exists but cannot receive a real tap")
            entry.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            let target = app.descendants(matching: .any)["more-destination-\(destination)"]
            XCTAssertTrue(target.waitForExistence(timeout: 8), "More entry \(destination) did not open its destination")
            let close = app.buttons["Cancel"].firstMatch
            XCTAssertTrue(close.waitForExistence(timeout: 5), "Destination \(destination) has no working Cancel button")
            close.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            XCTAssertTrue(target.waitForNonExistence(timeout: 8), "Destination \(destination) must close before reopening More")
        }

        let settingsMore = app.descendants(matching: .any)["vault-more-menu"]
        XCTAssertTrue(settingsMore.waitForExistence(timeout: 8) && settingsMore.isHittable)
        settingsMore.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertFalse(app.descendants(matching: .any)["more-theme"].exists, "Theme must not remain an independent More entry")
        let settingsEntry = app.descendants(matching: .any)["more-settings"]
        let settingsScroll = app.descendants(matching: .any)["more-menu-scroll"]
        XCTAssertTrue(settingsScroll.waitForExistence(timeout: 5))
        var settingsScrollAttempts = 0
        while (!settingsEntry.exists || !settingsEntry.isHittable) && settingsScrollAttempts < 8 {
            settingsScroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
                .press(forDuration: 0.05, thenDragTo: settingsScroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22)))
            settingsScrollAttempts += 1
        }
        XCTAssertTrue(settingsEntry.exists && settingsEntry.isHittable, "Missing or unreachable More entry settings")
        settingsEntry.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.descendants(matching: .any)["more-destination-settings"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.descendants(matching: .any)["settings-theme-choice"].waitForExistence(timeout: 8), "Theme must live inside Settings → Appearance")
        app.buttons["Cancel"].firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.descendants(matching: .any)["more-destination-settings"].waitForNonExistence(timeout: 8))

        let newRecord = app.buttons["new-record"]
        XCTAssertTrue(newRecord.waitForExistence(timeout: 8) && newRecord.isHittable)
        newRecord.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let newKindAccount = app.buttons["new-kind-account"]
        XCTAssertTrue(newKindAccount.waitForExistence(timeout: 5) && newKindAccount.isHittable)
        newKindAccount.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.staticTexts["Account"].waitForExistence(timeout: 8))
        XCTAssertTrue(app.buttons["close-product-modal"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testEditorDiscardAndTemplateActionsAreFunctional() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "-ui-testing-unlocked", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.terminate()
        app.launch()

        app.buttons["new-record"].tap()
        XCTAssertTrue(app.buttons["new-kind-custom"].waitForExistence(timeout: 8))
        app.buttons["new-kind-custom"].tap()
        XCTAssertTrue(app.buttons["new-custom-template-blank"].waitForExistence(timeout: 8))
        app.buttons["new-custom-template-blank"].tap()
        let saveTemplate = app.buttons["save-as-template"]
        XCTAssertTrue(saveTemplate.waitForExistence(timeout: 8), "Only custom records expose template actions")
        app.buttons["editor-cancel"].tap()
        XCTAssertTrue(app.buttons["new-record"].waitForExistence(timeout: 8), "Unchanged custom draft should close without a discard confirmation")

        let account = app.descendants(matching: .any)["vault-item-\(demoAccountID)"]
        XCTAssertTrue(account.waitForExistence(timeout: 10))
        account.tap()
        let edit = app.buttons["edit-item"]
        XCTAssertTrue(edit.waitForExistence(timeout: 8) && edit.isHittable)
        edit.tap()

        let title = app.textFields["editor-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 8))
        title.tap()
        title.typeText(" Updated")
        app.buttons["editor-cancel"].tap()

        let discard = app.buttons["confirm-modal-confirm"]
        XCTAssertTrue(discard.waitForExistence(timeout: 5) && discard.isHittable)
        discard.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["editor-save"].waitForNonExistence(timeout: 8), "Discard must close the editor")
        XCTAssertTrue(app.staticTexts["Demo Bank Account"].waitForExistence(timeout: 8), "Discard must restore detail")

        let editAgain = app.buttons["edit-item"]
        XCTAssertTrue(editAgain.waitForExistence(timeout: 8) && editAgain.isHittable)
        editAgain.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertFalse(app.buttons["save-as-template"].exists, "Ordinary records with extra fields must not expose template actions")
    }

    @MainActor
    func testPrivacyModeDoesNotSilentlyDisableNewFavoritesOrMoreRoutes() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing", "-ui-testing-unlocked", "-ui-testing-privacy", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()

        let favorites = app.buttons["open-favorites"]
        XCTAssertTrue(favorites.waitForExistence(timeout: 10))
        XCTAssertTrue(favorites.isEnabled && favorites.isHittable, "Favorites must remain actionable while privacy masking is enabled")
        favorites.tap()
        XCTAssertTrue(app.buttons["close-product-modal"].waitForExistence(timeout: 8), "Favorites did not open in privacy mode")
        XCTAssertTrue(app.descendants(matching: .any)["vault-item-\(demoAccountID)"].waitForExistence(timeout: 8), "Favorite fixture row is missing")
        app.descendants(matching: .any)["vault-item-\(demoAccountID)"].tap()
        XCTAssertTrue(app.buttons["item-detail-back"].waitForExistence(timeout: 8), "Favorite row did not return to the persistent vault shell detail pane")
        XCTAssertTrue(app.buttons["item-detail-close"].exists)
        app.buttons["item-detail-close"].tap()

        let newRecord = app.buttons["new-record"]
        XCTAssertTrue(newRecord.waitForExistence(timeout: 8))
        XCTAssertTrue(newRecord.isEnabled && newRecord.isHittable, "New must remain actionable while privacy masking is enabled")
        newRecord.tap()
        XCTAssertTrue(app.buttons["new-kind-account"].waitForExistence(timeout: 8), "New item picker did not open in privacy mode")
        app.buttons["close-new-item-picker"].tap()

        let more = app.descendants(matching: .any)["vault-more-menu"]
        XCTAssertTrue(more.waitForExistence(timeout: 8))
        more.tap()
        XCTAssertFalse(app.descendants(matching: .any)["more-privacy"].exists)
        let settings = app.descendants(matching: .any)["more-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 8) && settings.isHittable)
        settings.tap()
        XCTAssertTrue(app.descendants(matching: .any)["more-destination-settings"].waitForExistence(timeout: 8))
    }

    @MainActor
    private func openTheme(in app: XCUIApplication) {
        let menu = app.descendants(matching: .any)["vault-more-menu"]
        XCTAssertTrue(menu.waitForExistence(timeout: 10))
        menu.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let settings = app.descendants(matching: .any)["more-settings"]
        let scroll = app.descendants(matching: .any)["more-menu-scroll"]
        XCTAssertTrue(scroll.waitForExistence(timeout: 5))
        var attempts = 0
        while (!settings.exists || !settings.isHittable) && attempts < 8 {
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.82))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.22)))
            attempts += 1
        }
        XCTAssertTrue(settings.exists && settings.isHittable)
        settings.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.descendants(matching: .any)["more-destination-settings"].waitForExistence(timeout: 8))
    }

    @MainActor
    private func capture(_ name: String) {
        let screenshot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
