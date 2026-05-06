import Foundation
import Vapor

private actor ConnectionLogWriter {
    private let logFileURL: URL

    init() {
        self.logFileURL = AppPaths.logsDirectory().appendingPathComponent("connections.log")
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

func connectionLogPath() async -> String {
    await connectionLogWriter.path()
}

private func connectionLogTimestamp() -> String {
    let formatter = ISO8601DateFormatter()
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: Date())
}

private func connectionLogValue(_ value: String) -> String {
    let escaped = value
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\r", with: "\\r")
        .replacingOccurrences(of: "\t", with: "\\t")
        .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
}

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
    let line = [
        connectionLogTimestamp(),
        "connection",
        "action=\(connectionLogValue(action))",
        "ip=\(connectionLogValue(connection.ip))",
        "port=\(connectionLogValue(connection.port))",
        "identifier=\(connectionLogValue(resolvedIdentifier))",
        "path=\(connectionLogValue(req.url.path))"
    ].joined(separator: " ")
    req.logger.info("\(line)")
    Task {
        await connectionLogWriter.append(line)
    }
}

func logServerEvent(_ message: String) async {
    let line = [
        connectionLogTimestamp(),
        "server",
        "message=\(connectionLogValue(message))"
    ].joined(separator: " ")
    await connectionLogWriter.append(line)
}
