import Foundation
import XCTest
@testable import PlayerTracker

final class ServerPlatformTests: XCTestCase {
    func testWebClientDirectoryResolvesToCheckedInClientWebFolder() {
        let directory = AppPaths.webClientDirectory()
        XCTAssertEqual(directory.lastPathComponent, "Client-Web")
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.path))
    }

    func testAppDataDirectoryResolvesToExpectedPlatformLocation() {
        let directory = AppPaths.appDataDirectory(environment: [:])

        #if os(macOS)
        XCTAssertTrue(directory.path.hasSuffix("Library/Application Support/Roll4Initiative"))
        #elseif os(Windows)
        XCTAssertEqual(directory.lastPathComponent, "Roll4Initiative")
        #else
        XCTAssertTrue(directory.path.contains(".local/share/Roll4Initiative"))
        #endif
    }

    func testLogsDirectoryResolvesToExpectedPlatformLocation() {
        let directory = AppPaths.logsDirectory(environment: [:])

        #if os(macOS)
        XCTAssertTrue(directory.path.hasSuffix("Library/Logs/Roll4Initiative"))
        #elseif os(Windows)
        XCTAssertTrue(directory.path.replacingOccurrences(of: "\\", with: "/").hasSuffix("Roll4Initiative/Logs"))
        #else
        XCTAssertTrue(directory.path.contains(".local/state/Roll4Initiative/logs"))
        #endif
    }

    func testBrowserLaunchCanBeDisabledByEnvironment() {
        let environment = ["ROLL4INITIATIVE_LAUNCH_BROWSER": "0"]
        XCTAssertFalse(BrowserLauncher.shouldLaunchByDefault(environment: environment))
    }
}
