import Foundation
import Testing
@testable import PlayerTracker

@Suite("Server Platform")
struct ServerPlatformTests {
    private func makeTemporaryDirectory(prefix: String) throws -> URL {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("\(prefix)-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    @Test("web client directory resolves to the checked-in client folder")
    func webClientDirectoryResolvesToCheckedInClientWebFolder() {
        let directory = AppPaths.webClientDirectory()
        #expect(directory.lastPathComponent == "Client-Web")
        #expect(FileManager.default.fileExists(atPath: directory.path))
    }

    @Test("app data directory resolves to the expected platform location")
    func appDataDirectoryResolvesToExpectedPlatformLocation() throws {
        let baseDirectory = try makeTemporaryDirectory(prefix: "app-data-base")
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        let directory = AppPaths.appDataDirectory(baseDirectory: baseDirectory)
        let normalizedPath = directory.path.replacingOccurrences(of: "\\", with: "/")
        #expect(normalizedPath.hasSuffix("TacticalTableTop/Initiative"))
    }

    @Test("logs directory resolves to the expected platform location")
    func logsDirectoryResolvesToExpectedPlatformLocation() throws {
        let baseDirectory = try makeTemporaryDirectory(prefix: "logs-base")
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        let directory = AppPaths.logsDirectory(baseDirectory: baseDirectory)
        let normalizedPath = directory.path.replacingOccurrences(of: "\\", with: "/")
        #expect(normalizedPath.hasSuffix("TacticalTableTop/Initiative/logs"))
    }

    @Test("user data directory resolves to the expected platform location")
    func userDataDirectoryResolvesToExpectedPlatformLocation() throws {
        let baseDirectory = try makeTemporaryDirectory(prefix: "userdata-base")
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        let directory = AppPaths.userDataDirectory(rulesetId: "pathfinder", baseDirectory: baseDirectory)
        let normalizedPath = directory.path.replacingOccurrences(of: "\\", with: "/")
        #expect(normalizedPath.hasSuffix("TacticalTableTop/Initiative/userdata/pathfinder"))
    }

    @Test("bootstrap migration moves a legacy directory to the current standard")
    func migrateDirectoryIfNeededMovesLegacyDirectory() throws {
        let baseDirectory = try makeTemporaryDirectory(prefix: "migration-base")
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        let newDirectory = baseDirectory
            .appendingPathComponent("TacticalTableTop", isDirectory: true)
            .appendingPathComponent("Initiative", isDirectory: true)
        let legacyDirectory = baseDirectory.appendingPathComponent("LegacyApp", isDirectory: true)
        let legacyFile = legacyDirectory.appendingPathComponent("sentinel.txt")

        try FileManager.default.createDirectory(at: legacyDirectory, withIntermediateDirectories: true)
        try "legacy".write(to: legacyFile, atomically: true, encoding: .utf8)

        try ServerBootstrap.migrateDirectoryIfNeeded(
            newDirectory: newDirectory,
            legacyDirectories: [legacyDirectory]
        )

        #expect(FileManager.default.fileExists(atPath: newDirectory.path))
        #expect(FileManager.default.fileExists(atPath: newDirectory.appendingPathComponent("sentinel.txt").path))
        #expect(!FileManager.default.fileExists(atPath: legacyDirectory.path))
    }

    @Test("browser launch can be disabled by environment")
    func browserLaunchCanBeDisabledByEnvironment() {
        let environment = ["ROLL4INITIATIVE_LAUNCH_BROWSER": "0"]
        #expect(!BrowserLauncher.shouldLaunchByDefault(environment: environment))
    }
}
