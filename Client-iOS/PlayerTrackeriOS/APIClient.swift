import Foundation

enum APIClientError: LocalizedError {
    case invalidBaseURL
    case invalidResponse
    case serverError(Int)

    var errorDescription: String? {
        switch self {
        case .invalidBaseURL:
            return "Enter a valid server URL."
        case .invalidResponse:
            return "The server returned an invalid response."
        case .serverError(let status):
            return "Server returned \(status)."
        }
    }
}

struct APIClient {
    let baseURL: URL
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(baseURLString: String) throws {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
            ? trimmed
            : "http://\(trimmed)"
        guard let url = URL(string: normalized) else {
            throw APIClientError.invalidBaseURL
        }
        self.baseURL = url
    }

    func fetchCampaign() async throws -> CampaignStateDTO {
        try await get("campaign")
    }

    func fetchConditionLibrary() async throws -> RuleSetLibraryDTO {
        try await get("conditions-library")
    }

    func fetchState() async throws -> GameStateDTO {
        try await get("state")
    }

    func fetchCharacters(ownerId: UUID, campaignName: String?) async throws -> [PlayerViewDTO] {
        var path = "players/\(ownerId.uuidString.lowercased())/characters"
        if let campaignName, !campaignName.isEmpty {
            let encoded = campaignName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? campaignName
            path += "?campaign=\(encoded)"
        }
        return try await get(path)
    }

    func renameOwner(ownerId: UUID, name: String) async throws {
        let payload = CharacterRenameInputDTO(name: name)
        let _: EmptyResponse = try await send(
            "players/\(ownerId.uuidString.lowercased())/rename",
            method: "POST",
            body: payload
        )
    }

    func upsertCharacter(_ input: CharacterInputDTO) async throws -> PlayerViewDTO {
        try await send("characters", method: "POST", body: input)
    }

    func deleteCharacter(id: UUID) async throws {
        let _: EmptyResponse = try await send("characters/\(id.uuidString.lowercased())", method: "DELETE", body: Optional<Data>.none)
    }

    func completeTurn() async throws -> GameStateDTO {
        try await send("turn-complete", method: "POST", body: Optional<Data>.none)
    }

    private func makeURL(path: String) throws -> URL {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIClientError.invalidBaseURL
        }
        return url
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = try makeURL(path: path)
        let (data, response) = try await URLSession.shared.data(from: url)
        return try decode(data: data, response: response)
    }

    private func send<T: Decodable, Body: Encodable>(_ path: String, method: String, body: Body) async throws -> T {
        let url = try makeURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try decode(data: data, response: response)
    }

    private func send<T: Decodable>(_ path: String, method: String, body: Data?) async throws -> T {
        let url = try makeURL(path: path)
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        return try decode(data: data, response: response)
    }

    private func decode<T: Decodable>(data: Data, response: URLResponse) throws -> T {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIClientError.invalidResponse
        }
        guard (200 ..< 300).contains(httpResponse.statusCode) else {
            throw APIClientError.serverError(httpResponse.statusCode)
        }
        if T.self == EmptyResponse.self {
            return EmptyResponse() as! T
        }
        return try decoder.decode(T.self, from: data)
    }
}

private struct EmptyResponse: Decodable {}
