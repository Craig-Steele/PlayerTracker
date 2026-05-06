import Foundation

enum AppPaths {
    static func appDataDirectory() -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Roll4Initiative", isDirectory: true)
    }

    static func webClientDirectory() -> URL {
        let sourceURL = URL(fileURLWithPath: #filePath)
        return sourceURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Client-Web", isDirectory: true)
    }
}

enum BrowserLauncher {
    static func launchDisplayPage() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["http://localhost:8080/display.html"]

        do {
            try process.run()
        } catch {
            fputs("Failed to launch display page: \(error)\n", stderr)
        }
    }
}
