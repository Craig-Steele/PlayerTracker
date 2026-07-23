import Foundation

struct CampaignEventStreamClient {
    let baseURL: URL
    let playerSessionToken: String
    private static let streamTimeout: TimeInterval = 10 * 60

    func listen(
        campaignID: UUID,
        onEvent: @escaping @Sendable (String) async -> Void
    ) async throws {
        let url = try makeURL(path: "campaigns/\(campaignID.uuidString.lowercased())/events")
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = Self.streamTimeout
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.setValue("roll4_player_session=\(playerSessionToken)", forHTTPHeaderField: "Cookie")

        let (bytes, response) = try await Self.streamSession.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            throw APIClientError.serverError(httpResponse.statusCode)
        }

        for try await line in bytes.lines {
            if Task.isCancelled {
                return
            }

            if line.hasPrefix(":") {
                continue
            }

            if line.hasPrefix("event:") {
                guard let eventName = Self.eventName(from: line) else {
                    continue
                }
                await onEvent(eventName)
            }
        }
    }

    static func eventName(from line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("event:") else { return nil }
        let value = trimmed.dropFirst(6).trimmingCharacters(in: .whitespaces)
        return value.isEmpty ? nil : value
    }

    private func makeURL(path: String) throws -> URL {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIClientError.invalidBaseURL
        }
        return url
    }

    private static let streamSession: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = streamTimeout
        configuration.timeoutIntervalForResource = streamTimeout
        configuration.waitsForConnectivity = true
        return URLSession(configuration: configuration)
    }()
}
