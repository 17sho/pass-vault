import XCTest

final class Feedback65LongPressBulkSelectionTests: XCTestCase {
    func testMainListLongPressStartsBulkSelectionWithPressedItemSelected() throws {
        let vaultSource = try vaultViewsSource()
        let row = try slice(vaultSource, from: "private struct VaultItemRow: View", to: "private struct TOTPLiveCodeView: View")

        XCTAssertTrue(row.contains("private func handleLongPress()"))
        XCTAssertTrue(row.contains("guard rowInteraction == .actions"))
        XCTAssertTrue(row.contains("if item.kind == .totp"))
        XCTAssertTrue(row.contains("onRequestActions(item, rowFrame)"), "TOTP must retain its long-press action menu")
        XCTAssertTrue(row.contains("onBeginSelection()"), "Ordinary records must enter the existing bulk-selection path")
        XCTAssertTrue(row.contains("PVNativeLongPressRecognizer("), "Physical-device touches must be handled by a native UIKit recognizer attached to the row")
        XCTAssertTrue(row.contains("minimumDuration: 0.45"))
        XCTAssertTrue(row.contains("onTap: onSelect"))
        XCTAssertTrue(row.contains("onRecognized: handleLongPress"))
        XCTAssertFalse(row.contains("LongPressGesture("), "SwiftUI long-press composition repeatedly failed on physical devices")
        XCTAssertFalse(row.contains("onLongPress: handleLongPress"))

        let native = try source("Features/Vault/PVNativeLongPressRecognizer.swift")
        XCTAssertTrue(native.contains("UILongPressGestureRecognizer"))
        XCTAssertTrue(native.contains("sender.state == .began"), "Selection and haptic must fire at recognition, before finger-up")
        XCTAssertTrue(native.contains("cancelsTouchesInView = true"), "Recognized long press must cancel the row Button tap on release")
        XCTAssertTrue(native.contains("UINotificationFeedbackGenerator().notificationOccurred(.success)"), "Entering bulk mode must vibrate clearly")
        XCTAssertTrue(native.contains("shouldRecognizeSimultaneouslyWith"), "Native long press must coexist with the enclosing scroll/swipe recognizers")

        let swipe = try source("Features/Vault/PVInteractiveRows.swift")
        XCTAssertFalse(swipe.contains("LongPressGesture("))
        XCTAssertTrue(swipe.contains(".highPriorityGesture("))
    }

    func testSelectionModeKeepsWholeRowTapAndHidesPerItemActions() throws {
        let source = try vaultViewsSource()
        let row = try slice(source, from: "private struct VaultItemRow: View", to: "private struct TOTPLiveCodeView: View")

        XCTAssertTrue(source.contains("selectionMode = true\n                                    selectedIDs = [item.id]"))
        XCTAssertTrue(source.contains("onSelect: { selectionMode ? toggleSelection(item.id) : open(item) }"))
        XCTAssertTrue(row.contains("!selectionMode"))
        XCTAssertTrue(row.contains("selected ? \"checkmark.circle.fill\" : \"circle\""))
    }

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func vaultViewsSource() throws -> String {
        try source("Features/Vault/VaultViews.swift")
    }

    private func slice(_ source: String, from start: String, to end: String) throws -> String {
        guard let startRange = source.range(of: start),
              let endRange = source.range(of: end, range: startRange.upperBound..<source.endIndex) else {
            throw NSError(domain: "Feedback65", code: 1)
        }
        return String(source[startRange.lowerBound..<endRange.lowerBound])
    }
}
