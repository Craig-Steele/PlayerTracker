import Foundation

enum AppPaths {
    static func appDataDirectory(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        #if os(macOS)
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Roll4Initiative", isDirectory: true)
        #elseif os(Windows)
        environmentDirectory("LOCALAPPDATA", environment: environment)
            .appendingPathComponent("Roll4Initiative", isDirectory: true)
        #else
        xdgDirectory(environmentKey: "XDG_DATA_HOME", fallbackPath: ".local/share", environment: environment)
            .appendingPathComponent("Roll4Initiative", isDirectory: true)
        #endif
    }

    static func logsDirectory(environment: [String: String] = ProcessInfo.processInfo.environment) -> URL {
        #if os(macOS)
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/Roll4Initiative", isDirectory: true)
        #elseif os(Windows)
        environmentDirectory("LOCALAPPDATA", environment: environment)
            .appendingPathComponent("Roll4Initiative/Logs", isDirectory: true)
        #else
        xdgDirectory(environmentKey: "XDG_STATE_HOME", fallbackPath: ".local/state", environment: environment)
            .appendingPathComponent("Roll4Initiative/logs", isDirectory: true)
        #endif
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

enum BrowserLauncher {
    static var shouldLaunchByDefault: Bool {
        shouldLaunchByDefault(environment: ProcessInfo.processInfo.environment)
    }

    static func shouldLaunchByDefault(environment: [String: String]) -> Bool {
        guard let rawValue = environment["ROLL4INITIATIVE_LAUNCH_BROWSER"] else {
            return launchCommand(for: "http://localhost:8080/display.html") != nil
        }

        switch rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "1", "true", "yes", "on":
            return launchCommand(for: "http://localhost:8080/display.html") != nil
        case "0", "false", "no", "off":
            return false
        default:
            return launchCommand(for: "http://localhost:8080/display.html") != nil
        }
    }

    static func launchDisplayPage(url: String = "http://localhost:8080/display.html") {
        guard let command = launchCommand(for: url) else {
            fputs("No supported browser launcher is available for this platform.\n", stderr)
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: command.executable)
        process.arguments = command.arguments

        do {
            try process.run()
        } catch {
            fputs("Failed to launch display page: \(error)\n", stderr)
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
