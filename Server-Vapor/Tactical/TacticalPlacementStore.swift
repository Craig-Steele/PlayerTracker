import Foundation

actor TacticalPlacementStore {
    private let storageDirectory: URL
    private var tokens: [String: TacticalTokenSnapshot] = [:]
    private var loadedCampaigns: Set<UUID> = []

    init(storageDirectory: URL = AppPaths.appDataDirectory().appendingPathComponent("tactical-tokens", isDirectory: true)) {
        self.storageDirectory = storageDirectory
    }

    func clear(campaignID: UUID) throws {
        try loadIfNeeded(campaignID: campaignID)
        let campaignPrefix = "\(campaignID.uuidString):"
        tokens = tokens.filter { !$0.key.hasPrefix(campaignPrefix) }
        try persist(campaignID: campaignID)
    }

    func tokens(for campaignID: UUID, characters: [PlayerView] = []) throws -> [TacticalTokenSnapshot] {
        try loadIfNeeded(campaignID: campaignID)
        let charactersByID = Dictionary(uniqueKeysWithValues: characters.map { ($0.id, $0) })
        return tokens.values
            .filter { $0.id.hasPrefix("\(campaignID.uuidString):") }
            .sorted { $0.id < $1.id }
            .map { token in
                let character = charactersByID[token.characterId]
                let characterOwnerID = character?.claimedSessionId?.uuidString
                return TacticalTokenSnapshot(
                    id: token.id,
                    characterId: token.characterId,
                    displayName: charactersByID[token.characterId]?.name ?? token.displayName,
                    ownerName: charactersByID[token.characterId]?.ownerName ?? token.ownerName,
                    tokenDescription: charactersByID[token.characterId]?.tokenDescription,
                    conditions: charactersByID[token.characterId]?.conditions ?? token.conditions,
                    ownerId: characterOwnerID,
                    team: characterOwnerID == nil ? token.team : "player",
                    x: token.x,
                    y: token.y,
                    z: token.z,
                    isHidden: charactersByID[token.characterId]?.isHidden ?? token.isHidden
                )
            }
    }

    func place(
        campaignID: UUID,
        ownerId: String?,
        characterId: UUID,
        characterName: String,
        ownerName: String,
        tokenDescription: String?,
        conditions: [String],
        team: String,
        isHidden: Bool,
        at point: TacticalMapPoint
        , allowReposition: Bool = false
    ) async throws -> TacticalTokenSnapshot {
        try loadIfNeeded(campaignID: campaignID)
        let tokenID = "\(campaignID.uuidString):character:\(characterId.uuidString)"
        guard allowReposition || tokens[tokenID] == nil else {
            throw TacticalPlacementError.alreadyPlaced
        }
        guard !tokens.values.contains(where: {
            $0.id != tokenID &&
            $0.id.hasPrefix("\(campaignID.uuidString):") &&
            Int($0.x) == point.x &&
            Int($0.y) == point.y
        }) else {
            throw TacticalPlacementError.occupied
        }

        let token = TacticalTokenSnapshot(
            id: tokenID,
            characterId: characterId,
            displayName: characterName,
            ownerName: ownerName,
            tokenDescription: tokenDescription,
            conditions: conditions,
            ownerId: ownerId,
            team: team,
            x: Double(point.x),
            y: Double(point.y),
            z: 0,
            isHidden: isHidden
        )
        tokens[tokenID] = token
        try persist(campaignID: campaignID)
        return token
    }

    private func loadIfNeeded(campaignID: UUID) throws {
        guard loadedCampaigns.insert(campaignID).inserted else { return }
        let fileURL = storageDirectory.appendingPathComponent("\(campaignID.uuidString).json")
        guard let data = try? Data(contentsOf: fileURL) else { return }
        let storedTokens = try JSONDecoder().decode([TacticalTokenSnapshot].self, from: data)
        for token in storedTokens {
            tokens[token.id] = token
        }
    }

    private func persist(campaignID: UUID) throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        let prefix = "\(campaignID.uuidString):"
        let campaignTokens = tokens.values.filter { $0.id.hasPrefix(prefix) }
        let data = try JSONEncoder().encode(campaignTokens)
        try data.write(to: storageDirectory.appendingPathComponent("\(campaignID.uuidString).json"), options: .atomic)
    }
}

enum TacticalPlacementError: Error {
    case alreadyPlaced
    case occupied
}
