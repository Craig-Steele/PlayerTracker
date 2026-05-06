import Vapor
import Foundation

private actor ConnectionLogWriter {
    private let logFileURL: URL

    init() {
        let logsDirectory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/PlayerTracker", isDirectory: true)
        self.logFileURL = logsDirectory.appendingPathComponent("connections.log")
    }

    func append(_ line: String) {
        do {
            let directoryURL = logFileURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

            if !FileManager.default.fileExists(atPath: logFileURL.path) {
                try Data().write(to: logFileURL)
            }

            let data = Data((line + "\n").utf8)
            let handle = try FileHandle(forWritingTo: logFileURL)
            defer {
                try? handle.close()
            }
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
        } catch {
            fputs("Failed to append connection log: \(error)\n", stderr)
        }
    }

    func path() -> String {
        logFileURL.path
    }
}

private let connectionLogWriter = ConnectionLogWriter()

private func clientConnectionInfo(for req: Request) -> (ip: String, port: String) {
    if let forwarded = req.headers.first(name: "X-Forwarded-For")?
        .split(separator: ",")
        .first?
        .trimmingCharacters(in: .whitespacesAndNewlines),
       !forwarded.isEmpty {
        return (forwarded, "unknown")
    }

    if let peerAddress = req.peerAddress,
       let ipAddress = peerAddress.ipAddress,
       !ipAddress.isEmpty {
        let port = peerAddress.port.map(String.init) ?? "unknown"
        return (ipAddress, port)
    }

    if let remoteAddress = req.remoteAddress,
       let ipAddress = remoteAddress.ipAddress,
       !ipAddress.isEmpty {
        let port = remoteAddress.port.map(String.init) ?? "unknown"
        return (ipAddress, port)
    }

    return ("unknown", "unknown")
}

func logConnection(_ req: Request, action: String, identifier: String? = nil) {
    let resolvedIdentifier = (identifier?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
        ? identifier!
        : "anonymous"
    let connection = clientConnectionInfo(for: req)
    let formatter = ISO8601DateFormatter()
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let timestamp = formatter.string(from: Date())
    let line = "\(timestamp) connection action=\(action) ip=\(connection.ip) port=\(connection.port) identifier=\(resolvedIdentifier) path=\(req.url.path)"
    req.logger.info("\(line)")
    Task {
        await connectionLogWriter.append(line)
    }
}

private func logServerEvent(_ message: String) async {
    let formatter = ISO8601DateFormatter()
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let timestamp = formatter.string(from: Date())
    await connectionLogWriter.append("\(timestamp) server \(message)")
}

@main
struct Run {
    static func main() async throws {
        let app = try await Application.make(.detect())
        do {
            let sitesDir = AppPaths.webClientDirectory().path + "/"

            print("Serving static files from:", sitesDir)

            app.middleware.use(FileMiddleware(publicDirectory: sitesDir))

            // Listen on all interfaces for LAN access
            app.http.server.configuration.hostname = "0.0.0.0"
            app.http.server.configuration.port = 8080

            let conditionLibrary = try RuleSetLibraryLoader.loadDefault()
            let campaignStore = CampaignStore(defaultLibrary: conditionLibrary)
            print("Loaded default ruleset:", conditionLibrary.label)
            print("Connection logs:", await connectionLogWriter.path())
            await logServerEvent("startup host=\(app.http.server.configuration.hostname) port=\(app.http.server.configuration.port)")

            try routes(app, campaignStore: campaignStore)
            Task {
                // Give the HTTP listener a moment to bind before opening the browser.
                try? await Task.sleep(for: .milliseconds(400))
                BrowserLauncher.launchDisplayPage()
            }
            try await app.execute()
            try await app.asyncShutdown()
        } catch {
            try? await app.asyncShutdown()
            throw error
        }
    }
}
