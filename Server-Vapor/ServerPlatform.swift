import Foundation
import Vapor

enum AppPaths {
    private static let appFamilyDirectoryName = "TacticalTableTop"
    private static let appDataDirectoryName = "Initiative"

    static func appDataDirectory(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        #if os(macOS)
        let root = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support", isDirectory: true)
        return appDataDirectory(baseDirectory: root)
        #elseif os(Windows)
        let root = environmentDirectory("LOCALAPPDATA", environment: environment)
        return appDataDirectory(baseDirectory: root)
        #else
        let root = xdgDirectory(environmentKey: "XDG_DATA_HOME", fallbackPath: ".local/share", environment: environment)
        return appDataDirectory(baseDirectory: root)
        #endif
    }

    static func appDataDirectory(baseDirectory: URL) -> URL {
        baseDirectory
            .appendingPathComponent(appFamilyDirectoryName, isDirectory: true)
            .appendingPathComponent(appDataDirectoryName, isDirectory: true)
    }

    static func appDataDirectory(
        application: Application,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> URL {
        application.appPaths.appDataDirectoryOverride
            ?? appDataDirectory(environment: environment)
    }

    static func userDataDirectory(
        rulesetId: String,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> URL {
        appDataDirectory(environment: environment)
            .appendingPathComponent("userdata", isDirectory: true)
            .appendingPathComponent(rulesetId, isDirectory: true)
    }

    static func userDataDirectory(
        rulesetId: String,
        baseDirectory: URL
    ) -> URL {
        appDataDirectory(baseDirectory: baseDirectory)
            .appendingPathComponent("userdata", isDirectory: true)
            .appendingPathComponent(rulesetId, isDirectory: true)
    }

    static func userDataDirectory(
        rulesetId: String,
        application: Application,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> URL {
        appDataDirectory(application: application, environment: environment)
            .appendingPathComponent("userdata", isDirectory: true)
            .appendingPathComponent(rulesetId, isDirectory: true)
    }

    static func logsDirectory(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        #if os(macOS)
        let root = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs", isDirectory: true)
        return logsDirectory(baseDirectory: root)
        #elseif os(Windows)
        let root = environmentDirectory("LOCALAPPDATA", environment: environment)
        return logsDirectory(baseDirectory: root)
        #else
        let root = xdgDirectory(environmentKey: "XDG_STATE_HOME", fallbackPath: ".local/state", environment: environment)
        return logsDirectory(baseDirectory: root)
        #endif
    }

    static func logsDirectory(baseDirectory: URL) -> URL {
        baseDirectory
            .appendingPathComponent(appFamilyDirectoryName, isDirectory: true)
            .appendingPathComponent("\(appDataDirectoryName)/logs", isDirectory: true)
    }

    static func webClientDirectory() -> URL {
        let sourceURL = URL(fileURLWithPath: #filePath)
        return sourceURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Client-Web", isDirectory: true)
    }

    private static func environmentDirectory(_ key: String, environment: [String: String]) -> URL {
        if let rawValue = environment[key],
           !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return URL(fileURLWithPath: rawValue, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
    }

    private static func xdgDirectory(environmentKey: String, fallbackPath: String, environment: [String: String]) -> URL {
        if let rawValue = environment[environmentKey],
           !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return URL(fileURLWithPath: rawValue, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(fallbackPath, isDirectory: true)
    }
}

struct AppPathsConfiguration: @unchecked Sendable {
    var appDataDirectoryOverride: URL?
}

private struct AppPathsConfigurationKey: StorageKey {
    typealias Value = AppPathsConfiguration
}

extension Application {
    var appPaths: AppPathsConfiguration {
        get {
            storage[AppPathsConfigurationKey.self] ?? AppPathsConfiguration(appDataDirectoryOverride: nil)
        }
        set {
            storage[AppPathsConfigurationKey.self] = newValue
        }
    }
}

enum BrowserLauncher {
    static var shouldLaunchByDefault: Bool {
        shouldLaunchByDefault(environment: ProcessInfo.processInfo.environment)
    }

    static func shouldLaunchByDefault(environment: [String: String]) -> Bool {
        guard let rawValue = environment["ROLL4INITIATIVE_LAUNCH_BROWSER"] else {
            return launchCommand(for: "http://localhost:8080/admin.html") != nil
        }

        switch rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "1", "true", "yes", "on":
            return launchCommand(for: "http://localhost:8080/admin.html") != nil
        case "0", "false", "no", "off":
            return false
        default:
            return launchCommand(for: "http://localhost:8080/admin.html") != nil
        }
    }

    static func launchDisplayPage(url: String = "http://localhost:8080/admin.html") {
        guard let command = launchCommand(for: url) else {
            ServerDiagnostics.writeBrowserLauncherUnavailable()
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: command.executable)
        process.arguments = command.arguments

        do {
            try process.run()
        } catch {
            ServerDiagnostics.writeBrowserLaunchFailed(error)
        }
    }

    private static func launchCommand(for url: String) -> (executable: String, arguments: [String])? {
        #if os(macOS)
        return ("/usr/bin/open", [url])
        #elseif os(Linux)
        let executable = "/usr/bin/xdg-open"
        guard FileManager.default.isExecutableFile(atPath: executable) else {
            return nil
        }
        return (executable, [url])
        #elseif os(Windows)
        return ("cmd.exe", ["/C", "start", "", url])
        #else
        return nil
        #endif
    }
}

enum DirectoryLauncher {
    static func launch(url: URL) throws {
        guard let command = launchCommand(for: url) else {
            throw Abort(.internalServerError, reason: "No supported folder launcher is available for this platform.")
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: command.executable)
        process.arguments = command.arguments
        try process.run()
    }

    private static func launchCommand(for url: URL) -> (executable: String, arguments: [String])? {
        #if os(macOS)
        return ("/usr/bin/open", [url.path])
        #elseif os(Linux)
        let executable = "/usr/bin/xdg-open"
        guard FileManager.default.isExecutableFile(atPath: executable) else {
            return nil
        }
        return (executable, [url.path])
        #elseif os(Windows)
        return ("cmd.exe", ["/C", "start", "", url.path])
        #else
        return nil
        #endif
    }
}
