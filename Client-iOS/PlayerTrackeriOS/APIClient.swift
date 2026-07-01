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
    let playerSessionToken: String?
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(baseURLString: String, playerSessionToken: String? = nil) throws {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalized = trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
            ? trimmed
            : "http://\(trimmed)"
        guard let url = URL(string: normalized) else {
            throw APIClientError.invalidBaseURL
        }
        self.baseURL = url
        self.playerSessionToken = playerSessionToken
    }

    func fetchCampaign() async throws -> CampaignStateDTO {
        try await get("campaign")
    }

    func fetchConditionLibrary() async throws -> RuleSetLibraryDTO {
        try await get("conditions-library")
    }

    func fetchEquipmentLibrary(limit: Int = 0) async throws -> EquipmentLibraryResponseDTO {
        try await get("equipment-library?limit=\(limit)")
    }

    func fetchState() async throws -> GameStateDTO {
        try await get("state")
    }

    func fetchPlayerSession() async throws -> PlayerSessionDTO {
        try await get("player/session")
    }

    func joinPlayerSession(displayName: String) async throws -> PlayerSessionResult {
        try await sendPlayerSession(
            "player/join",
            method: "POST",
            body: PlayerJoinInputDTO(displayName: displayName)
        )
    }

    func renamePlayerSession(displayName: String) async throws -> PlayerSessionResult {
        try await sendPlayerSession(
            "player/session",
            method: "PATCH",
            body: PlayerJoinInputDTO(displayName: displayName)
        )
    }

    func logoutPlayerSession() async throws {
        let _: EmptyResponse = try await send("player/logout", method: "POST", body: Optional<Data>.none)
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

    func upsertCharacter(_ input: CharacterInputDTO, campaignID: UUID) async throws -> PlayerViewDTO {
        try await send("campaigns/\(campaignID.uuidString.lowercased())/me/characters", method: "POST", body: input)
    }

    func deleteCharacter(id: UUID, campaignID: UUID) async throws {
        let _: EmptyResponse = try await send(
            "campaigns/\(campaignID.uuidString.lowercased())/me/characters/\(id.uuidString.lowercased())",
            method: "DELETE",
            body: Optional<Data>.none
        )
    }

    func claimCharacter(id: UUID, campaignID: UUID) async throws -> PlayerViewDTO {
        try await send(
            "campaigns/\(campaignID.uuidString.lowercased())/me/characters/\(id.uuidString.lowercased())/claim",
            method: "POST",
            body: Optional<Data>.none
        )
    }

    func releaseCharacter(id: UUID, campaignID: UUID) async throws -> PlayerViewDTO {
        try await send(
            "campaigns/\(campaignID.uuidString.lowercased())/me/characters/\(id.uuidString.lowercased())/release",
            method: "POST",
            body: Optional<Data>.none
        )
    }

    func completeTurn() async throws -> GameStateDTO {
        try await send("turn-complete", method: "POST", body: Optional<Data>.none)
    }

    func updatePartyTreasure(items: [InventoryEntryDTO], currency: [CurrencyAmountDTO]? = nil) async throws -> CampaignStateDTO {
        try await send(
            "campaign/party-treasure",
            method: "PUT",
            body: PartyTreasureUpdateInputDTO(items: items, currency: currency)
        )
    }

    func claimPartyTreasureItem(characterId: UUID, itemId: UUID, quantity: Int? = nil) async throws -> CampaignStateDTO {
        try await send(
            "campaign/party-treasure/claim",
            method: "POST",
            body: PartyTreasureClaimInputDTO(characterId: characterId, itemId: itemId, quantity: quantity)
        )
    }

    private func makeURL(path: String) throws -> URL {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIClientError.invalidBaseURL
        }
        return url
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let url = try makeURL(path: path)
        let request = makeRequest(url: url)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try decode(data: data, response: response)
    }

    private func send<T: Decodable, Body: Encodable>(_ path: String, method: String, body: Body) async throws -> T {
        let url = try makeURL(path: path)
        var request = makeRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        return try decode(data: data, response: response)
    }

    private func send<T: Decodable>(_ path: String, method: String, body: Data?) async throws -> T {
        let url = try makeURL(path: path)
        var request = makeRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        return try decode(data: data, response: response)
    }

    private func sendPlayerSession<Body: Encodable>(
        _ path: String,
        method: String,
        body: Body
    ) async throws -> PlayerSessionResult {
        let url = try makeURL(path: path)
        var request = makeRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        let session: PlayerSessionDTO = try decode(data: data, response: response)
        let token = extractPlayerSessionToken(from: response) ?? playerSessionToken
        guard let token, !token.isEmpty else {
            throw APIClientError.invalidResponse
        }
        return PlayerSessionResult(sessionToken: token, session: session)
    }

    private func makeRequest(url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        if let playerSessionToken, !playerSessionToken.isEmpty {
            request.setValue("roll4_player_session=\(playerSessionToken)", forHTTPHeaderField: "Cookie")
        }
        return request
    }

    private func extractPlayerSessionToken(from response: URLResponse) -> String? {
        guard let httpResponse = response as? HTTPURLResponse else { return nil }
        let headerFields = httpResponse.allHeaderFields.reduce(into: [String: String]()) { partialResult, element in
            guard let key = element.key as? String, let value = element.value as? String else { return }
            partialResult[key] = value
        }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: headerFields, for: baseURL)
        return cookies.first(where: { $0.name == "roll4_player_session" })?.value
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
