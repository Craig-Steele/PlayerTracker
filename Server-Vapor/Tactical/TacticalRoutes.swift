import Foundation
import Fluent
import Vapor

extension RoutesBuilder {
    func registerTacticalRoutes(
        campaignStore: CampaignStore,
        userStore: UserStore,
        tacticalSessionStore: TacticalSessionStore,
        tacticalMapStore: TacticalMapStore
    ) {
        let tactical = grouped("tactical")

        tactical.get("health") { _ async throws -> String in
            "ok"
        }

        tactical.get("map") { req async throws -> TacticalMapState in
            _ = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            return try await tacticalMapStore.mapState()
        }

        tactical.get("encounter") { req async throws -> TacticalEncounterSnapshot in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let isReferee = try await isRefereeSession(session, in: campaign.id, on: req.db)
            let mapState = try await tacticalMapStore.mapState()
            let characters = await userStore.allCharacters(campaignName: campaign.name)
            let snapshot = try await loadOrBuildTacticalSnapshot(
                campaign: campaign,
                characters: characters,
                mapState: mapState,
                tacticalSessionStore: tacticalSessionStore
            )
            return snapshot.rendered(
                selectedTokenID: await tacticalSessionStore.selectedTokenID(
                    for: campaign.id,
                    sessionID: session.id
                ),
                isReferee: isReferee
            )
        }

        tactical.post("command") { req async throws -> Response in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let isReferee = try await isRefereeSession(session, in: campaign.id, on: req.db)
            let mapState = try await tacticalMapStore.mapState()
            let characters = await userStore.allCharacters(campaignName: campaign.name)
            let command = try req.content.decode(TacticalCommandEnvelope.self)

            let outcome = try await applyTacticalCommand(
                command,
                campaign: campaign,
                session: session,
                isReferee: isReferee,
                characters: characters,
                mapState: mapState,
                tacticalSessionStore: tacticalSessionStore,
                tacticalMapStore: tacticalMapStore
            )

            let response = Response(status: outcome.status)
            try response.content.encode(outcome.response)
            return response
        }
    }
}

private let tacticalPlayerSessionCookieName = "roll4_player_session"
private let tacticalSchemaVersion = 1

private func requireActiveCampaignParticipantSession(
    _ req: Request,
    campaignStore: CampaignStore
) async throws -> (campaign: CampaignState, session: PlayerSessionPersistenceState) {
    guard let campaign = await campaignStore.activeCampaign() else {
        throw Abort(.conflict, reason: "No campaign selected")
    }

    guard let token = req.cookies[tacticalPlayerSessionCookieName]?.string,
          let session = try await DatabasePersistence.loadPlayerSession(token: token, on: req.db) else {
        throw Abort(.unauthorized, reason: "No player session.")
    }

    let memberCampaignIDs = try await DatabasePersistence.loadCampaignIDs(for: session.id, on: req.db)
    if memberCampaignIDs.contains(campaign.id) {
        return (campaign, session)
    }

    let refereeIDs = try await DatabasePersistence.loadCampaignRefereeSessionIDs(
        campaignID: campaign.id,
        on: req.db
    )
    guard refereeIDs.contains(session.id) else {
        throw Abort(.forbidden, reason: "Campaign access required.")
    }

    return (campaign, session)
}

private func isRefereeSession(
    _ session: PlayerSessionPersistenceState,
    in campaignID: UUID,
    on database: any Database
) async throws -> Bool {
    let refereeIDs = try await DatabasePersistence.loadCampaignRefereeSessionIDs(
        campaignID: campaignID,
        on: database
    )
    return refereeIDs.contains(session.id)
}

private func loadOrBuildTacticalSnapshot(
    campaign: CampaignState,
    characters: [PlayerView],
    mapState: TacticalMapState,
    tacticalSessionStore: TacticalSessionStore
) async throws -> TacticalEncounterSnapshot {
    let existingSnapshot = await tacticalSessionStore.snapshot(for: campaign.id)
    let snapshot = buildTacticalSnapshot(
        campaign: campaign,
        characters: characters,
        mapState: mapState,
        previousSnapshot: existingSnapshot
    )
    await tacticalSessionStore.upsertSnapshot(snapshot, for: campaign.id)
    return snapshot
}

private struct TacticalCommandRouteOutcome {
    let status: HTTPStatus
    let response: TacticalCommandResponse
}

private struct TacticalTokenControlRejection {
    let status: HTTPStatus
    let reason: String
}

private func applyTacticalCommand(
    _ command: TacticalCommandEnvelope,
    campaign: CampaignState,
    session: PlayerSessionPersistenceState,
    isReferee: Bool,
    characters: [PlayerView],
    mapState: TacticalMapState,
    tacticalSessionStore: TacticalSessionStore,
    tacticalMapStore: TacticalMapStore
) async throws -> TacticalCommandRouteOutcome {
    let baseSnapshot = try await loadOrBuildTacticalSnapshot(
        campaign: campaign,
        characters: characters,
        mapState: mapState,
        tacticalSessionStore: tacticalSessionStore
    )

    switch command.type {
    case "select-token":
        let tokenId = try requireTokenID(from: command.payload)
        if let rejection = tokenControlRejection(
            tokenID: tokenId,
            sessionID: session.id,
            isReferee: isReferee,
            snapshot: baseSnapshot
        ) {
            return TacticalCommandRouteOutcome(
                status: rejection.status,
                response: TacticalCommandResponse(
                    accepted: false,
                    rejectionReason: rejection.reason,
                    snapshot: snapshotWithSelection(
                        baseSnapshot,
                        selectedTokenID: await tacticalSessionStore.selectedTokenID(
                            for: campaign.id,
                            sessionID: session.id
                        )
                    )
                )
            )
        }
        await tacticalSessionStore.selectTokenID(tokenId, for: campaign.id, sessionID: session.id)
        return TacticalCommandRouteOutcome(
            status: .ok,
            response: TacticalCommandResponse(
                accepted: true,
                rejectionReason: nil,
                snapshot: snapshotWithSelection(
                    baseSnapshot,
                    selectedTokenID: tokenId
                )
            )
        )

    case "move-token":
        let tokenId = try await tokenIDForMove(
            from: command.payload,
            tacticalSessionStore: tacticalSessionStore,
            campaignID: campaign.id,
            sessionID: session.id
        )
        if let rejection = tokenControlRejection(
            tokenID: tokenId,
            sessionID: session.id,
            isReferee: isReferee,
            snapshot: baseSnapshot
        ) {
            return TacticalCommandRouteOutcome(
                status: rejection.status,
                response: TacticalCommandResponse(
                    accepted: false,
                    rejectionReason: rejection.reason,
                    snapshot: snapshotWithSelection(
                        baseSnapshot,
                        selectedTokenID: await tacticalSessionStore.selectedTokenID(
                            for: campaign.id,
                            sessionID: session.id
                        )
                    )
                )
            )
        }

        let target = try requireTacticalPosition(from: command.payload)
        let validation = try await validateMove(
            target: target,
            mapState: mapState,
            tacticalMapStore: tacticalMapStore
        )

        guard validation.accepted else {
            return TacticalCommandRouteOutcome(
                status: .conflict,
                response: TacticalCommandResponse(
                    accepted: false,
                    rejectionReason: validation.rejectionReason,
                    snapshot: snapshotWithSelection(
                        baseSnapshot,
                        selectedTokenID: await tacticalSessionStore.selectedTokenID(
                            for: campaign.id,
                            sessionID: session.id
                        )
                    )
                )
            )
        }

        guard let updatedToken = updateToken(
            tokenID: tokenId,
            to: target,
            in: baseSnapshot,
            mapState: mapState
        ) else {
            return TacticalCommandRouteOutcome(
                status: .notFound,
                response: TacticalCommandResponse(
                    accepted: false,
                    rejectionReason: "Token not found.",
                    snapshot: snapshotWithSelection(
                        baseSnapshot,
                        selectedTokenID: await tacticalSessionStore.selectedTokenID(
                            for: campaign.id,
                            sessionID: session.id
                        )
                    )
                )
            )
        }
        let updatedSnapshot = replaceToken(updatedToken, in: baseSnapshot)
        await tacticalSessionStore.upsertSnapshot(updatedSnapshot, for: campaign.id)
        await tacticalSessionStore.selectTokenID(tokenId, for: campaign.id, sessionID: session.id)
        return TacticalCommandRouteOutcome(
            status: .ok,
            response: TacticalCommandResponse(
                accepted: true,
                rejectionReason: nil,
                snapshot: snapshotWithSelection(
                    updatedSnapshot,
                    selectedTokenID: tokenId
                )
            )
        )

    default:
        throw Abort(.badRequest, reason: "Unsupported tactical command type: \(command.type)")
    }
}

private func buildTacticalSnapshot(
    campaign: CampaignState,
    characters: [PlayerView],
    mapState: TacticalMapState,
    previousSnapshot: TacticalEncounterSnapshot?
) -> TacticalEncounterSnapshot {
    let previousTokens = Dictionary(uniqueKeysWithValues: (previousSnapshot?.tokens ?? []).map { ($0.id, $0) })
    let openSquares = openSquares(in: mapState)
    let orderedCharacters = characters.sorted { lhs, rhs in
        if lhs.name == rhs.name {
            return lhs.id.uuidString < rhs.id.uuidString
        }
        return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
    }

    let tokens = orderedCharacters.enumerated().map { index, character in
        let tokenID = character.id.uuidString.lowercased()
        let existingToken = previousTokens[tokenID]
        let ownerSessionID = character.claimedSessionId ?? character.ownerId
        let ownerDisplayName = character.claimedDisplayName ?? character.ownerName
        let defaultPosition = defaultTacticalPosition(
            for: index,
            mapState: mapState,
            openSquares: openSquares
        )

        return TacticalTokenSnapshot(
            id: tokenID,
            displayName: character.name,
            ownerSessionId: ownerSessionID,
            ownerDisplayName: ownerDisplayName,
            team: character.isReferee ? "referee" : "player",
            x: existingToken?.x ?? defaultPosition.x,
            y: existingToken?.y ?? defaultPosition.y,
            z: existingToken?.z ?? defaultPosition.z,
            isHidden: character.isHidden
        )
    }

    return TacticalEncounterSnapshot(
        schemaVersion: tacticalSchemaVersion,
        encounterId: campaign.id,
        name: campaign.name,
        roundNumber: 1,
        activeTokenId: previousSnapshot?.activeTokenId,
        selectedTokenId: previousSnapshot?.selectedTokenId,
        tokens: tokens
    )
}

private func snapshotWithSelection(
    _ snapshot: TacticalEncounterSnapshot,
    selectedTokenID: String?
) -> TacticalEncounterSnapshot {
    TacticalEncounterSnapshot(
        schemaVersion: snapshot.schemaVersion,
        encounterId: snapshot.encounterId,
        name: snapshot.name,
        roundNumber: snapshot.roundNumber,
        activeTokenId: snapshot.activeTokenId,
        selectedTokenId: selectedTokenID,
        tokens: snapshot.tokens
    )
}

private func openSquares(in mapState: TacticalMapState) -> [TacticalMapPoint] {
    let blocked = Set(mapState.blockedTiles)
    var squares: [TacticalMapPoint] = []
    squares.reserveCapacity(mapState.gridWidth * mapState.gridHeight - blocked.count)

    for y in 0..<mapState.gridHeight {
        for x in 0..<mapState.gridWidth {
            let point = TacticalMapPoint(x: x, y: y)
            if blocked.contains(point) {
                continue
            }
            squares.append(point)
        }
    }

    return squares
}

private func defaultTacticalPosition(
    for index: Int,
    mapState: TacticalMapState,
    openSquares: [TacticalMapPoint]
) -> (x: Double, y: Double, z: Double) {
    if index < openSquares.count {
        let square = openSquares[index]
        return (
            x: Double(square.x),
            y: Double(square.y),
            z: heightFeet(atX: square.x, y: square.y, in: mapState)
        )
    }

    let fallbackX = index % max(1, mapState.gridWidth)
    let fallbackY = (index / max(1, mapState.gridWidth)) % max(1, mapState.gridHeight)
    return (
        x: Double(fallbackX),
        y: Double(fallbackY),
        z: heightFeet(atX: fallbackX, y: fallbackY, in: mapState)
    )
}

private func heightFeet(atX x: Int, y: Int, in mapState: TacticalMapState) -> Double {
    guard x >= 0,
          x < mapState.gridWidth,
          y >= 0,
          y < mapState.gridHeight else {
        return mapState.defaultHeightFt
    }
    return mapState.squareHeights[(y * mapState.gridWidth) + x]
}

private func requireTokenID(from payload: [String: String]) throws -> String {
    guard let tokenID = normalizedTokenID(payload["tokenId"] ?? payload["tokenID"]) else {
        throw Abort(.badRequest, reason: "tokenId is required.")
    }
    return tokenID
}

private func tokenIDForMove(
    from payload: [String: String],
    tacticalSessionStore: TacticalSessionStore,
    campaignID: UUID,
    sessionID: UUID
) async throws -> String {
    if let tokenID = normalizedTokenID(payload["tokenId"] ?? payload["tokenID"]) {
        return tokenID
    }
    if let selectedTokenID = await tacticalSessionStore.selectedTokenID(for: campaignID, sessionID: sessionID) {
        return selectedTokenID
    }
    throw Abort(.badRequest, reason: "tokenId is required for move-token.")
}

private func requireTacticalPosition(from payload: [String: String]) throws -> (x: Double, y: Double, z: Double) {
    guard let x = parseDouble(payload, keys: ["squareX", "x"]),
          let y = parseDouble(payload, keys: ["squareY", "y"]) else {
        throw Abort(.badRequest, reason: "Movement requires squareX and squareY coordinates.")
    }
    let z = parseDouble(payload, keys: ["z", "squareZ", "elevationFeet"]) ?? 0.0
    return (x: x, y: y, z: z)
}

private func parseDouble(_ payload: [String: String], keys: [String]) -> Double? {
    for key in keys {
        if let value = payload[key]?.trimmingCharacters(in: .whitespacesAndNewlines),
           let parsed = Double(value) {
            return parsed
        }
    }
    return nil
}

private func normalizedTokenID(_ value: String?) -> String? {
    guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
        return nil
    }
    return value.lowercased()
}

private func tokenControlRejection(
    tokenID: String,
    sessionID: UUID,
    isReferee: Bool,
    snapshot: TacticalEncounterSnapshot
) -> TacticalTokenControlRejection? {
    guard let token = snapshot.tokens.first(where: { $0.id == tokenID }) else {
        return TacticalTokenControlRejection(status: .notFound, reason: "Token not found.")
    }
    guard isReferee || token.ownerSessionId == sessionID else {
        return TacticalTokenControlRejection(
            status: .forbidden,
            reason: "Token is controlled by a different player."
        )
    }
    return nil
}

private struct TacticalMoveValidationOutcome {
    let accepted: Bool
    let rejectionReason: String?
}

private func validateMove(
    target: (x: Double, y: Double, z: Double),
    mapState: TacticalMapState,
    tacticalMapStore: TacticalMapStore
) async throws -> TacticalMoveValidationOutcome {
    let squareX = Int(target.x.rounded())
    let squareY = Int(target.y.rounded())

    guard squareX >= 0,
          squareX < mapState.gridWidth,
          squareY >= 0,
          squareY < mapState.gridHeight else {
        return TacticalMoveValidationOutcome(
            accepted: false,
            rejectionReason: "Move rejected: out of bounds."
        )
    }

    if try await tacticalMapStore.isBlocked(squareX: squareX, squareY: squareY) {
        return TacticalMoveValidationOutcome(
            accepted: false,
            rejectionReason: "Move rejected: blocked square."
        )
    }

    return TacticalMoveValidationOutcome(accepted: true, rejectionReason: nil)
}

private func updateToken(
    tokenID: String,
    to position: (x: Double, y: Double, z: Double),
    in snapshot: TacticalEncounterSnapshot,
    mapState: TacticalMapState
) -> TacticalTokenSnapshot? {
    guard let token = snapshot.tokens.first(where: { $0.id == tokenID }) else {
        return nil
    }

    let squareX = Int(position.x.rounded())
    let squareY = Int(position.y.rounded())

    return TacticalTokenSnapshot(
        id: token.id,
        displayName: token.displayName,
        ownerSessionId: token.ownerSessionId,
        ownerDisplayName: token.ownerDisplayName,
        team: token.team,
        x: Double(squareX),
        y: Double(squareY),
        z: heightFeet(atX: squareX, y: squareY, in: mapState),
        isHidden: token.isHidden
    )
}

private func replaceToken(
    _ updatedToken: TacticalTokenSnapshot,
    in snapshot: TacticalEncounterSnapshot
) -> TacticalEncounterSnapshot {
    var tokens = snapshot.tokens
    guard let index = tokens.firstIndex(where: { $0.id == updatedToken.id }) else {
        return snapshot
    }
    tokens[index] = updatedToken
    return TacticalEncounterSnapshot(
        schemaVersion: snapshot.schemaVersion,
        encounterId: snapshot.encounterId,
        name: snapshot.name,
        roundNumber: snapshot.roundNumber,
        activeTokenId: snapshot.activeTokenId,
        selectedTokenId: snapshot.selectedTokenId,
        tokens: tokens
    )
}

private extension TacticalEncounterSnapshot {
    func rendered(selectedTokenID: String?, isReferee: Bool) -> TacticalEncounterSnapshot {
        TacticalEncounterSnapshot(
            schemaVersion: schemaVersion,
            encounterId: encounterId,
            name: name,
            roundNumber: roundNumber,
            activeTokenId: activeTokenId,
            selectedTokenId: selectedTokenID,
            tokens: tokens
        )
    }
}
