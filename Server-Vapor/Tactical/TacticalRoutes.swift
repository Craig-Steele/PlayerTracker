import Vapor

extension RoutesBuilder {
    func registerTacticalRoutes(
        campaignStore: CampaignStore,
        userStore: UserStore,
        tacticalMapStore: TacticalMapStore,
        tacticalPlacementStore: TacticalPlacementStore,
        tacticalEventHub: TacticalEventHub
    ) {
        let tactical = grouped("tactical")

        tactical.get("health") { req async throws -> String in
            "ok"
        }

        tactical.get("map") { req async throws -> TacticalMapState in
            _ = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            return try tacticalMapStore.load()
        }

        tactical.get("map", "image") { req async throws -> Response in
            _ = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let map = try tacticalMapStore.load()
            let imageURL = try tacticalMapStore.imageURL(for: map)
            let response = Response(status: .ok)
            response.headers.replaceOrAdd(name: .contentType, value: "image/png")
            response.body = .init(data: try Data(contentsOf: imageURL))
            return response
        }

        tactical.get("tokens") { req async throws -> [TacticalTokenSnapshot] in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let viewerIsReferee = try await isRefereeSession(session, in: campaign.id, on: req.db)
            let characters = await userStore.allCharacters(campaignName: campaign.name)
            let tokens = await tacticalPlacementStore.tokens(
                for: campaign.id,
                characters: characters
            )
            guard viewerIsReferee else {
                return tokens.filter { !$0.isHidden }
            }
            return tokens
        }

        tactical.get("characters") { req async throws -> [PlayerView] in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let allCharacters = await userStore.allCharacters(campaignName: campaign.name)
            if try await isRefereeSession(session, in: campaign.id, on: req.db) {
                return allCharacters
            }
            return allCharacters.filter { $0.claimedSessionId == session.id }
        }

        tactical.get("events") { req async throws -> Response in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            let viewerIsReferee = try await isRefereeSession(session, in: campaign.id, on: req.db)
            let response = Response(status: .ok)
            response.headers.replaceOrAdd(name: .contentType, value: "text/event-stream; charset=utf-8")
            response.headers.replaceOrAdd(name: .cacheControl, value: "no-cache, no-transform")
            response.headers.replaceOrAdd(name: .connection, value: "keep-alive")
            let acceptsEventStream = (req.headers.first(name: .accept) ?? "")
                .lowercased()
                .contains("text/event-stream")
            if acceptsEventStream {
                response.body = .init(managedAsyncStream: { writer in
                    let messages = await tacticalEventHub.subscribe()
                    for await message in messages {
                        if Task.isCancelled { break }
                        if message.payload.token.isHidden && !viewerIsReferee { continue }
                        let data = try JSONEncoder().encode(message.payload)
                        let json = String(decoding: data, as: UTF8.self)
                        try await writer.writeBuffer(
                            ByteBuffer(string: "event: \(message.event)\ndata: \(json)\n\n")
                        )
                    }
                })
            } else {
                response.body = .init(string: "")
            }
            return response
        }

        tactical.post("tokens", "place") { req async throws -> TacticalTokenSnapshot in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let input = try req.content.decode(TacticalPlacementRequest.self)
            let allCharacters = await userStore.allCharacters(campaignName: campaign.name)
            let isReferee = try await isRefereeSession(session, in: campaign.id, on: req.db)
            guard let character = allCharacters.first(where: {
                $0.id == input.characterId &&
                (isReferee || $0.claimedSessionId == session.id)
            }) else {
                throw Abort(.forbidden, reason: "That character is not controlled by this player.")
            }
            let map = try tacticalMapStore.load()
            guard input.x >= 0,
                  input.x < map.grid.eastWestSquareCount,
                  input.y >= 0,
                  input.y < map.grid.northSouthSquareCount else {
                throw Abort(.badRequest, reason: "Placement must be inside the map bounds.")
            }
            guard !map.blockedTiles.contains(where: { $0.x == input.x && $0.y == input.y }) else {
                throw Abort(.conflict, reason: "That square is blocked.")
            }
            do {
                let token = try await tacticalPlacementStore.place(
                    campaignID: campaign.id,
                    session: session,
                    characterId: character.id,
                    characterName: character.name,
                    ownerName: character.ownerName,
                    tokenDescription: character.tokenDescription,
                    conditions: character.conditions,
                    team: isReferee ? "enemy" : "player",
                    isHidden: character.isHidden,
                    at: TacticalMapPoint(x: input.x, y: input.y)
                )
                await tacticalEventHub.publish(token: token)
                return token
            } catch TacticalPlacementError.alreadyPlaced {
                throw Abort(.conflict, reason: "Your token has already been placed.")
            } catch TacticalPlacementError.occupied {
                throw Abort(.conflict, reason: "That square is occupied.")
            }
        }
    }
}
