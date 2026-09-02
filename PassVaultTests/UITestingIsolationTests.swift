import XCTest
@testable import PassVault

final class UITestingIsolationTests: XCTestCase {
    func testUITestingLaunchPathIsCompileTimeDebugOnlyAndTemporary() throws {
        let repositoryRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let appSource = try String(
            contentsOf: repositoryRoot.appendingPathComponent("App/PassVaultApp.swift"),
            encoding: .utf8
        )
        let harnessSource = try String(
            contentsOf: repositoryRoot.appendingPathComponent("App/UITestingHarness.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(appSource.contains("#if DEBUG\n        if let testingModel = UITestingHarness.makeModel"))
        XCTAssertTrue(harnessSource.hasPrefix("#if DEBUG"))
        XCTAssertTrue(harnessSource.contains("ProcessInfo.processInfo.arguments.contains(launchArgument)"))
        XCTAssertTrue(harnessSource.contains("FileManager.default.temporaryDirectory"))
        XCTAssertFalse(harnessSource.contains("applicationSupportDirectory"))
        XCTAssertFalse(harnessSource.contains("appendingPathComponent(\"vault.pv\""))
    }

    func testFixtureUsesOnlyReservedExampleDomains() throws {
        let repositoryRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let harnessSource = try String(
            contentsOf: repositoryRoot.appendingPathComponent("App/UITestingHarness.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(harnessSource.contains("example.test"))
        XCTAssertTrue(harnessSource.contains("Synthetic UI-test record"))
        XCTAssertTrue(harnessSource.contains("fixture-vault.pv"))
    }
}
