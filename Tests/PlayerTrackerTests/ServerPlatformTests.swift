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
        let directory = AppPaths.webClientDirectory(
            environment: [:],
            currentDirectory: URL(fileURLWithPath: FileManager.default.currentDirectoryPath, isDirectory: true)
        )
        #expect(directory.lastPathComponent == "Client-Web")
        #expect(FileManager.default.fileExists(atPath: directory.path))
    }

    @Test("web client directory accepts an explicit packaged-runtime path")
    func webClientDirectoryUsesConfiguredPath() throws {
        let root = try makeTemporaryDirectory(prefix: "web-client-runtime")
        defer { try? FileManager.default.removeItem(at: root) }
        let configuredDirectory = root.appendingPathComponent("Client-Web", isDirectory: true)
        try FileManager.default.createDirectory(at: configuredDirectory, withIntermediateDirectories: true)

        let directory = AppPaths.webClientDirectory(
            environment: ["ROLL4INITIATIVE_WEB_CLIENT_DIRECTORY": configuredDirectory.path],
            currentDirectory: root.appendingPathComponent("different-working-directory", isDirectory: true),
            executableURL: nil
        )
        #expect(directory.standardizedFileURL == configuredDirectory.standardizedFileURL)
    }

    @Test("app data directory resolves to the expected platform location")
    func appDataDirectoryResolvesToExpectedPlatformLocation() throws {
        let baseDirectory = try makeTemporaryDirectory(prefix: "app-data-base")
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        let directory = AppPaths.appDataDirectory(baseDirectory: baseDirectory)
        let normalizedPath = directory.path.replacingOccurrences(of: "\\", with: "/")
        #expect(normalizedPath.hasSuffix("TacticalTableTop/Initiative"))
    }

    @Test("configured data directory controls the production database location")
    func configuredDataDirectoryControlsProductionDatabaseLocation() throws {
        let baseDirectory = try makeTemporaryDirectory(prefix: "configured-data-base")
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        let options = ServerBootstrapOptions.production(environment: [
            "PLAYERTRACKER_DATA_DIR": baseDirectory.path
        ])
        let normalizedPath = options.databaseFileURL.path.replacingOccurrences(of: "\\", with: "/")
        #expect(normalizedPath.hasPrefix(baseDirectory.path.replacingOccurrences(of: "\\", with: "/")))
        #expect(normalizedPath.hasSuffix("TacticalTableTop/Initiative/data/app.sqlite3"))
    }

    @Test("tactical map directory accepts an explicit packaged-runtime path")
    func tacticalMapSourceUsesConfiguredDirectory() throws {
        let directory = try makeTemporaryDirectory(prefix: "tactical-maps")
        defer { try? FileManager.default.removeItem(at: directory) }

        let sourceURL = AppPaths.tacticalMapSourceURL(environment: [
            "ROLL4INITIATIVE_TACTICAL_MAP_DIRECTORY": directory.path
        ])

        #expect(sourceURL.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL)
        #expect(sourceURL.lastPathComponent == "Arcane Library PZO30084E.map.json")
    }

    @Test("legacy data directory variable remains supported")
    func legacyConfiguredDataDirectoryRemainsSupported() throws {
        let baseDirectory = try makeTemporaryDirectory(prefix: "legacy-data-base")
        defer { try? FileManager.default.removeItem(at: baseDirectory) }

        let directory = AppPaths.appDataDirectory(environment: [
            "ROLL4INITIATIVE_DATA_DIRECTORY": baseDirectory.path
        ])
        #expect(directory.path.hasPrefix(baseDirectory.path))
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

    @Test("production uses PORT and preserves the default port")
    func productionUsesEnvironmentPort() {
        #expect(ServerBootstrapOptions.production(environment: ["PORT": "9000"]).port == 9000)
        #expect(ServerBootstrapOptions.production(environment: ["PORT": "not-a-port"]).port == 8080)
        #expect(ServerBootstrapOptions.production(environment: [:]).port == 8080)
        #expect(ServerBootstrapOptions.production(environment: [:]).hostname == "0.0.0.0")
    }

    @Test("browser launch defaults off outside an explicitly configured local environment")
    func browserLaunchDefaultsOffWithoutOptIn() {
        #expect(ServerRuntimeMode.current(environment: [:]) == .production)
        #expect(ServerRuntimeMode.current(environment: ["PLAYERTRACKER_ENV": "development"]) == .development)
        #if os(macOS)
        #expect(!BrowserLauncher.shouldLaunchByDefault(environment: [:]))
        #expect(BrowserLauncher.shouldLaunchByDefault(environment: ["PLAYERTRACKER_ENV": "development"]))
        #else
        #expect(!BrowserLauncher.shouldLaunchByDefault(environment: [:]))
        #endif
    }

    @Test("local folder opening defaults off outside macOS")
    func localFolderOpeningDefaultsOffOutsideMacOS() {
        #if os(macOS)
        #expect(!DirectoryLauncher.isEnabledByDefault(environment: [:]))
        #expect(DirectoryLauncher.isEnabledByDefault(environment: ["PLAYERTRACKER_ENV": "development"]))
        #else
        #expect(!DirectoryLauncher.isEnabledByDefault(environment: [:]))
        #endif
        #expect(DirectoryLauncher.isEnabledByDefault(environment: ["ROLL4INITIATIVE_OPEN_LOCAL_FOLDERS": "true"]))
    }
}
