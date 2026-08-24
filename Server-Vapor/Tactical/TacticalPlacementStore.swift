import Foundation

actor TacticalPlacementStore {
    private var tokens: [String: TacticalTokenSnapshot] = [:]

    func tokens(for campaignID: UUID, characters: [PlayerView] = []) -> [TacticalTokenSnapshot] {
        let charactersByID = Dictionary(uniqueKeysWithValues: characters.map { ($0.id, $0) })
        return tokens.values
            .filter { $0.id.hasPrefix("\(campaignID.uuidString):") }
            .sorted { $0.id < $1.id }
            .map { token in
                TacticalTokenSnapshot(
                    id: token.id,
                    characterId: token.characterId,
                    displayName: charactersByID[token.characterId]?.name ?? token.displayName,
                    ownerName: charactersByID[token.characterId]?.ownerName ?? token.ownerName,
                    tokenDescription: charactersByID[token.characterId]?.tokenDescription,
                    conditions: charactersByID[token.characterId]?.conditions ?? token.conditions,
                    ownerId: token.ownerId,
                    team: token.team,
                    x: token.x,
                    y: token.y,
                    z: token.z,
                    isHidden: charactersByID[token.characterId]?.isHidden ?? token.isHidden
                )
            }
    }

    func place(
        campaignID: UUID,
        session: PlayerSessionPersistenceState,
        characterId: UUID,
        characterName: String,
        ownerName: String,
        tokenDescription: String?,
        conditions: [String],
        team: String,
        isHidden: Bool,
        at point: TacticalMapPoint
    ) throws -> TacticalTokenSnapshot {
        let tokenID = "\(campaignID.uuidString):character:\(characterId.uuidString)"
        guard tokens[tokenID] == nil else {
            throw TacticalPlacementError.alreadyPlaced
        }
        guard !tokens.values.contains(where: { $0.id.hasPrefix("\(campaignID.uuidString):") && Int($0.x) == point.x && Int($0.y) == point.y }) else {
            throw TacticalPlacementError.occupied
        }

        let token = TacticalTokenSnapshot(
            id: tokenID,
            characterId: characterId,
            displayName: characterName,
            ownerName: ownerName,
            tokenDescription: tokenDescription,
            conditions: conditions,
            ownerId: session.id.uuidString,
            team: team,
            x: Double(point.x),
            y: Double(point.y),
            z: 0,
            isHidden: isHidden
        )
        tokens[tokenID] = token
        return token
    }
}

enum TacticalPlacementError: Error {
    case alreadyPlaced
    case occupied
}
