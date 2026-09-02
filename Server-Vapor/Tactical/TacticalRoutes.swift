import Vapor

extension RoutesBuilder {
    func registerTacticalRoutes(
        campaignStore: CampaignStore,
        userStore: UserStore,
        campaignEventHub: CampaignEventHub,
        tacticalMapStore: TacticalMapStore,
        tacticalMapSelectionStore: TacticalMapSelectionStore,
        tacticalPlayerPlacementStore: TacticalPlayerPlacementStore,
        tacticalPlacementStore: TacticalPlacementStore,
        tacticalEventHub: TacticalEventHub
    ) {
        let tactical = grouped("tactical")

        tactical.get("health") { req async throws -> String in
            "ok"
        }

        tactical.get("map") { req async throws -> TacticalMapState in
            let (campaign, _) = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let defaultMapID = tacticalMapStore.mapSourceURL.lastPathComponent
            let mapID = await tacticalMapSelectionStore.selectedMapID(for: campaign.id, persistedMapID: campaign.selectedMapID, defaultMapID: defaultMapID)
            if let imported = await tacticalMapSelectionStore.importedMap(mapID: mapID, for: campaign.id) {
                return imported.map
            }
            return try tacticalMapStore.load(mapID: mapID)
        }

        tactical.get("maps") { req async throws -> [TacticalMapSummary] in
            let (campaign, _) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            let defaultMapID = tacticalMapStore.mapSourceURL.lastPathComponent
            let selectedMapID = await tacticalMapSelectionStore.selectedMapID(for: campaign.id, persistedMapID: campaign.selectedMapID, defaultMapID: defaultMapID)
            let bundled = try tacticalMapStore.catalog().map {
                TacticalMapSummary(id: $0.id, name: $0.name, selected: $0.id == selectedMapID)
            }
            let imported = await tacticalMapSelectionStore.importedSummaries(
                for: campaign.id,
                selectedMapID: selectedMapID
            )
            if imported.isEmpty,
               let selectedImported = await tacticalMapSelectionStore.importedMap(mapID: selectedMapID, for: campaign.id) {
                return bundled + [TacticalMapSummary(id: selectedImported.id, name: selectedImported.name, selected: true)]
            }
            return bundled + imported
        }

        tactical.get("player-placement") { req async throws -> TacticalPlayerPlacementResponse in
            let (campaign, _) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            let override = await tacticalPlayerPlacementStore.override(for: campaign.id)
            let defaultMapID = tacticalMapStore.mapSourceURL.lastPathComponent
            let selectedMapID = await tacticalMapSelectionStore.selectedMapID(for: campaign.id, persistedMapID: campaign.selectedMapID, defaultMapID: defaultMapID)
            let map = if let imported = await tacticalMapSelectionStore.importedMap(mapID: selectedMapID, for: campaign.id) {
                imported.map
            } else {
                try tacticalMapStore.load(mapID: selectedMapID)
            }
            return TacticalPlayerPlacementResponse(
                bounds: override != nil ? override! : map.playerPlacement?.defaultBounds,
                isOverride: override != nil
            )
        }

        tactical.put("player-placement") { req async throws -> TacticalPlayerPlacementResponse in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            guard try await isRefereeSession(session, in: campaign.id, on: req.db) else {
                throw Abort(.forbidden, reason: "Only a referee can change player placement bounds.")
            }
            guard await campaignStore.encounterState() == .new else {
                throw Abort(.conflict, reason: "Player placement bounds can only be changed during a new encounter.")
            }
            let input = try req.content.decode(TacticalPlayerPlacementUpdateRequest.self)
            if let bounds = input.bounds {
                guard bounds.west <= bounds.east, bounds.south <= bounds.north else {
                    throw Abort(.badRequest, reason: "Player placement bounds must have west <= east and south <= north.")
                }
                try await tacticalPlayerPlacementStore.set(bounds, for: campaign.id)
            } else {
                try await tacticalPlayerPlacementStore.set(nil, for: campaign.id)
            }
            let selected = input.useMapDefault == true
            if selected { try await tacticalPlayerPlacementStore.clear(for: campaign.id) }
            let defaultMapID = tacticalMapStore.mapSourceURL.lastPathComponent
            let selectedMapID = await tacticalMapSelectionStore.selectedMapID(for: campaign.id, persistedMapID: campaign.selectedMapID, defaultMapID: defaultMapID)
            let map = if let imported = await tacticalMapSelectionStore.importedMap(mapID: selectedMapID, for: campaign.id) {
                imported.map
            } else {
                try tacticalMapStore.load(mapID: selectedMapID)
            }
            let override = await tacticalPlayerPlacementStore.override(for: campaign.id)
            await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: campaignEventHub, event: "player-placement-changed")
            return TacticalPlayerPlacementResponse(bounds: override != nil ? override! : map.playerPlacement?.defaultBounds, isOverride: override != nil)
        }

        tactical.on(.POST, "maps", "import", body: .collect(maxSize: "50mb")) { req async throws -> TacticalMapSummary in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            guard try await isRefereeSession(session, in: campaign.id, on: req.db) else {
                throw Abort(.forbidden, reason: "Only a referee can import a tactical map.")
            }
            guard await campaignStore.encounterState() == .new else {
                throw Abort(.conflict, reason: "A map can only be imported during a new encounter.")
            }
            let input = try req.content.decode(TacticalMapImportRequest.self)
            guard input.filename.lowercased().hasSuffix(".png"),
                  let imageData = Data(base64Encoded: input.imageBase64),
                  imageData.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
                  imageData.count <= 20 * 1024 * 1024,
                  input.map.grid.eastWestSquareCount > 0,
                  input.map.grid.northSouthSquareCount > 0,
                  input.map.grid.squareSizeFt > 0 else {
                throw Abort(.badRequest, reason: "The PNG and required map metadata are invalid.")
            }
            let name = input.filename.replacingOccurrences(of: ".png", with: "", options: [.caseInsensitive, .anchored])
            let imported = try await tacticalMapSelectionStore.importMap(
                name: name,
                map: input.map,
                imageData: imageData,
                for: campaign.id
            )
            let updatedCampaign = try await campaignStore.selectMap(imported.id)
            try await tacticalPlacementStore.clear(campaignID: campaign.id)
            try await tacticalPlayerPlacementStore.clear(for: campaign.id)
            await publishCampaignUpdate(campaign: updatedCampaign, userStore: userStore, eventHub: campaignEventHub, event: "map-changed")
            return TacticalMapSummary(id: imported.id, name: imported.name, selected: true)
        }

        tactical.on(.POST, "maps", "import-archive", body: .collect(maxSize: "50mb")) { req async throws -> TacticalMapSummary in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            guard try await isRefereeSession(session, in: campaign.id, on: req.db) else {
                throw Abort(.forbidden, reason: "Only a referee can import a tactical map.")
            }
            guard await campaignStore.encounterState() == .new else {
                throw Abort(.conflict, reason: "A map can only be imported during a new encounter.")
            }
            let input = try req.content.decode(TacticalMapArchiveImportRequest.self)
            guard input.filename.lowercased().hasSuffix(".map.zip"),
                  let archiveData = Data(base64Encoded: input.archiveBase64),
                  archiveData.count <= 35 * 1024 * 1024 else {
                throw Abort(.badRequest, reason: "The map archive is invalid or too large.")
            }

            let temporaryDirectory = FileManager.default.temporaryDirectory
                .appendingPathComponent("roll4initiative-map-import-(UUID().uuidString)", isDirectory: true)
            let archiveURL = temporaryDirectory.appendingPathComponent(input.filename)
            defer { try? FileManager.default.removeItem(at: temporaryDirectory) }
            try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
            try archiveData.write(to: archiveURL, options: .atomic)

            let unzip = Process()
            unzip.executableURL = URL(fileURLWithPath: "/usr/bin/unzip")
            unzip.arguments = ["-qq", archiveURL.path, "-d", temporaryDirectory.path]
            try unzip.run()
            unzip.waitUntilExit()
            guard unzip.terminationStatus == 0 else {
                throw Abort(.badRequest, reason: "Unable to open the map archive.")
            }

            let extractedFiles = FileManager.default.enumerator(
                at: temporaryDirectory,
                includingPropertiesForKeys: [.isRegularFileKey],
                options: [.skipsHiddenFiles, .skipsPackageDescendants]
            )?.compactMap { $0 as? URL }.filter {
                (try? $0.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true &&
                !$0.path.contains("/__MACOSX/")
            } ?? []
            let imageURLs = extractedFiles.filter { $0.pathExtension.lowercased() == "png" }
            let mapURLs = extractedFiles.filter { $0.lastPathComponent.lowercased().hasSuffix(".map.json") }
            guard imageURLs.count == 1 else {
                throw Abort(.badRequest, reason: "The archive must contain exactly one PNG map image.")
            }
            guard mapURLs.count == 1 else {
                throw Abort(.badRequest, reason: "The archive must contain exactly one .map.json sidecar.")
            }
            let imageURL = imageURLs[0]
            let mapURL = mapURLs[0]
            guard let imageData = try? Data(contentsOf: imageURL),
                  imageData.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) else {
                throw Abort(.badRequest, reason: "The archive's map image is not a valid PNG.")
            }
            guard imageData.count <= 20 * 1024 * 1024 else {
                throw Abort(.badRequest, reason: "The map PNG is too large. Maximum size is 20 MB.")
            }
            guard let mapData = try? Data(contentsOf: mapURL),
                  var map = try? JSONDecoder().decode(TacticalMapState.self, from: mapData) else {
                throw Abort(.badRequest, reason: "The archive's .map.json sidecar is invalid JSON or does not match the map format.")
            }
            guard map.grid.eastWestSquareCount > 0,
                  map.grid.northSouthSquareCount > 0,
                  map.grid.squareSizeFt > 0 else {
                throw Abort(.badRequest, reason: "The map sidecar must define positive grid dimensions and square size.")
            }

            map = TacticalMapState(
                version: map.version,
                imagePath: imageURL.lastPathComponent,
                grid: map.grid,
                blockedTiles: map.blockedTiles,
                terrain: map.terrain,
                elevation: map.elevation,
                mapPresentation: map.mapPresentation,
                playerPlacement: map.playerPlacement
            )
            let imported = try await tacticalMapSelectionStore.importMap(
                name: imageURL.deletingPathExtension().lastPathComponent,
                map: map,
                imageData: imageData,
                for: campaign.id
            )
            let updatedCampaign = try await campaignStore.selectMap(imported.id)
            try await tacticalPlacementStore.clear(campaignID: campaign.id)
            try await tacticalPlayerPlacementStore.clear(for: campaign.id)
            await publishCampaignUpdate(campaign: updatedCampaign, userStore: userStore, eventHub: campaignEventHub, event: "map-changed")
            return TacticalMapSummary(id: imported.id, name: imported.name, selected: true)
        }

        tactical.put("map") { req async throws -> TacticalMapSummary in
            let (campaign, session) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            guard try await isRefereeSession(session, in: campaign.id, on: req.db) else {
                throw Abort(.forbidden, reason: "Only a referee can select the tactical map.")
            }
            guard await campaignStore.encounterState() == .new else {
                throw Abort(.conflict, reason: "The tactical map can only be changed during a new encounter.")
            }
            let input = try req.content.decode(TacticalMapSelectionRequest.self)
            if let imported = await tacticalMapSelectionStore.importedMap(mapID: input.mapID, for: campaign.id) {
                let updatedCampaign = try await campaignStore.selectMap(imported.id)
                await tacticalMapSelectionStore.select(mapID: imported.id, for: campaign.id)
            try await tacticalPlacementStore.clear(campaignID: campaign.id)
            try await tacticalPlayerPlacementStore.clear(for: campaign.id)
                await publishCampaignUpdate(campaign: updatedCampaign, userStore: userStore, eventHub: campaignEventHub, event: "map-changed")
                return TacticalMapSummary(id: imported.id, name: imported.name, selected: true)
            }
            guard let map = try tacticalMapStore.catalog().first(where: { $0.id == input.mapID }) else {
                throw Abort(.notFound, reason: "Map not found.")
            }
            _ = try tacticalMapStore.load(mapID: map.id)
            await tacticalMapSelectionStore.select(mapID: map.id, for: campaign.id)
            let updatedCampaign = try await campaignStore.selectMap(map.id)
            try await tacticalPlacementStore.clear(campaignID: campaign.id)
            try await tacticalPlayerPlacementStore.clear(for: campaign.id)
            await publishCampaignUpdate(campaign: updatedCampaign, userStore: userStore, eventHub: campaignEventHub, event: "map-changed")
            return TacticalMapSummary(id: map.id, name: map.name, selected: true)
        }

        tactical.get("map", "image") { req async throws -> Response in
            let (campaign, _) = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let defaultMapID = tacticalMapStore.mapSourceURL.lastPathComponent
            let mapID = await tacticalMapSelectionStore.selectedMapID(for: campaign.id, persistedMapID: campaign.selectedMapID, defaultMapID: defaultMapID)
            if let imported = await tacticalMapSelectionStore.importedMap(mapID: mapID, for: campaign.id) {
                let response = Response(status: .ok)
                response.headers.replaceOrAdd(name: .contentType, value: "image/png")
                response.body = .init(data: imported.imageData)
                return response
            }
            let map = try tacticalMapStore.load(mapID: mapID)
            let imageURL = try tacticalMapStore.imageURL(for: map, mapID: mapID)
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
            let tokens = try await tacticalPlacementStore.tokens(
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
            let defaultMapID = tacticalMapStore.mapSourceURL.lastPathComponent
            let selectedMapID = await tacticalMapSelectionStore.selectedMapID(
                for: campaign.id,
                persistedMapID: campaign.selectedMapID,
                defaultMapID: defaultMapID
            )
            let map: TacticalMapState
            if let imported = await tacticalMapSelectionStore.importedMap(
                mapID: selectedMapID,
                for: campaign.id
            ) {
                map = imported.map
            } else {
                map = try tacticalMapStore.load(mapID: selectedMapID)
            }
            let isInfiniteTerrain = map.grid.boundaryBehavior == "infinite"
            guard isInfiniteTerrain || (
                input.x >= 0 &&
                input.x < map.grid.eastWestSquareCount &&
                input.y >= 0 &&
                input.y < map.grid.northSouthSquareCount
            ) else {
                throw Abort(.badRequest, reason: "Placement must be inside the map bounds.")
            }
            let placementOverride = await tacticalPlayerPlacementStore.override(for: campaign.id)
            let playerBounds = placementOverride != nil ? placementOverride! : map.playerPlacement?.defaultBounds
            if character.claimedSessionId != nil, let playerBounds,
               (input.x < playerBounds.west || input.x > playerBounds.east || input.y < playerBounds.south || input.y > playerBounds.north) {
                throw Abort(.forbidden, reason: "That square is outside the player placement area.")
            }
            guard !map.blockedTiles.contains(where: { $0.x == input.x && $0.y == input.y }) else {
                throw Abort(.conflict, reason: "That square is blocked.")
            }
            do {
                let token = try await tacticalPlacementStore.place(
                    campaignID: campaign.id,
                    ownerId: character.claimedSessionId?.uuidString,
                    characterId: character.id,
                    characterName: character.name,
                    ownerName: character.ownerName,
                    tokenDescription: character.tokenDescription,
                    conditions: character.conditions,
                    team: character.claimedSessionId == nil ? "enemy" : "player",
                    isHidden: character.isHidden,
                    at: TacticalMapPoint(x: input.x, y: input.y),
                    allowReposition: campaign.encounterState == .new
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
