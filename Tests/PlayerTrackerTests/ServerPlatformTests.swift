import Foundation
import Testing
@testable import PlayerTracker

@Suite("Server Platform")
struct ServerPlatformTests {
    @Test("web client directory resolves to the checked-in client folder")
    func webClientDirectoryResolvesToCheckedInClientWebFolder() {
        let directory = AppPaths.webClientDirectory()
        #expect(directory.lastPathComponent == "Client-Web")
        #expect(FileManager.default.fileExists(atPath: directory.path))
    }

    @Test("app data directory resolves to the expected platform location")
    func appDataDirectoryResolvesToExpectedPlatformLocation() {
        let directory = AppPaths.appDataDirectory(environment: [:])

        #if os(macOS)
        #expect(directory.path.hasSuffix("Library/Application Support/Roll4Initiative"))
        #elseif os(Windows)
        #expect(directory.lastPathComponent == "Roll4Initiative")
        #else
        #expect(directory.path.contains(".local/share/Roll4Initiative"))
        #endif
    }

    @Test("logs directory resolves to the expected platform location")
    func logsDirectoryResolvesToExpectedPlatformLocation() {
        let directory = AppPaths.logsDirectory(environment: [:])

        #if os(macOS)
        #expect(directory.path.hasSuffix("Library/Logs/Roll4Initiative"))
        #elseif os(Windows)
        #expect(directory.path.replacingOccurrences(of: "\\", with: "/").hasSuffix("Roll4Initiative/Logs"))
        #else
        #expect(directory.path.contains(".local/state/Roll4Initiative/logs"))
        #endif
    }

    @Test("user data directory resolves to the expected platform location")
    func userDataDirectoryResolvesToExpectedPlatformLocation() {
        let directory = AppPaths.userDataDirectory(rulesetId: "pathfinder", environment: [:])

        #if os(macOS)
        #expect(directory.path.hasSuffix("Library/Application Support/Roll4Initiative/userdata/pathfinder"))
        #elseif os(Windows)
        #expect(directory.path.replacingOccurrences(of: "\\", with: "/").hasSuffix("Roll4Initiative/userdata/pathfinder"))
        #else
        #expect(directory.path.contains(".local/share/Roll4Initiative/userdata/pathfinder"))
        #endif
    }

    @Test("browser launch can be disabled by environment")
    func browserLaunchCanBeDisabledByEnvironment() {
        let environment = ["ROLL4INITIATIVE_LAUNCH_BROWSER": "0"]
        #expect(!BrowserLauncher.shouldLaunchByDefault(environment: environment))
    }
}
