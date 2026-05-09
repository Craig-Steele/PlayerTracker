import Foundation
import Vapor

func routes(_ app: Application, campaignStore: CampaignStore) throws {
    app.post("conditions") { req async throws -> HTTPStatus in
        let input = try req.content.decode(ConditionsInput.self)
        logConnection(req, action: "set-conditions", identifier: input.name)
        let campaignName = await campaignStore.currentCampaignName()
        await userStore.setConditions(
            name: input.name,
            conditions: Set(input.conditions),
            campaignName: campaignName
        )
        return .ok
    }

    // GET /user/:name
    app.get("user", ":name") { req async throws -> UserData in
        guard let name = req.parameters.get("name") else {
            throw Abort(.badRequest)
        }

        let campaignName = await campaignStore.currentCampaignName()
        let initiative = await userStore.get(name: name, campaignName: campaignName)?.initiative
        return UserData(name: name, initiative: initiative)
    }

    // GET /users
    app.get("users") { req async throws -> [UserData] in
        let campaignName = await campaignStore.currentCampaignName()
        let all = await userStore.all(campaignName: campaignName)
        return all.map { (key, value) in
            UserData(name: key, initiative: value.initiative)
        }
    }

    app.get { req in
        logConnection(req, action: "root-redirect")
        let hostHeader = req.headers.first(name: .host) ?? ""
        let hostname = hostHeader.split(separator: ":").first.map(String.init)?.lowercased() ?? ""
        let redirectPath = (hostname == "localhost" || hostname == "127.0.0.1")
            ? "/display.html"
            : "/index.html"
        return req.redirect(to: redirectPath)
    }

    // DELETE /users - clear all players
    app.delete("users") { req async throws -> HTTPStatus in
        logConnection(req, action: "clear-users")
        await userStore.clear()
        return .ok
    }

    app.get("server-ip") { req async throws -> ServerAddressResponse in
        let localIP = getLocalIPv4Address()
        let publicIP = await getPublicIPv4Address()
        return ServerAddressResponse(
            ip: localIP,
            localIP: localIP,
            publicIP: publicIP
        )
    }

    // GET /state - full game state (round, current turn, players)
    app.get("state") { req async throws -> GameState in
        let campaignName = await campaignStore.currentCampaignName()
        let viewMode = req.query[String.self, at: "view"] ?? "player"
        let includeHidden = viewMode == "referee"
        let encounterState = await campaignStore.encounterState()
        return await userStore.state(
            campaignName: campaignName,
            includeHidden: includeHidden,
            encounterState: encounterState
        )
    }

    // POST /turn-complete - advance to next turn
    app.post("turn-complete") { req async throws -> GameState in
        logConnection(req, action: "turn-complete")
        let campaignName = await campaignStore.currentCampaignName()
        let encounterState = await campaignStore.encounterState()
        guard encounterState == .active else {
            throw Abort(.conflict, reason: "Encounter is not active.")
        }
        return await userStore.nextTurn(
            campaignName: campaignName,
            includeHidden: false,
            encounterState: encounterState
        )
    }

    app.post("turn-set", ":id") { req async throws -> GameState in
        guard let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        logConnection(req, action: "turn-set", identifier: id.uuidString)
        let campaignName = await campaignStore.currentCampaignName()
        let encounterState = await campaignStore.encounterState()
        guard encounterState == .active else {
            throw Abort(.conflict, reason: "Encounter is not active.")
        }
        return await userStore.setCurrentTurn(
            campaignName: campaignName,
            characterId: id,
            encounterState: encounterState
        )
    }

    app.post("encounter", "new") { req async throws -> GameState in
        logConnection(req, action: "encounter-new")
        let campaignName = await campaignStore.currentCampaignName()
        await userStore.resetForNewEncounter(campaignName: campaignName)
        await campaignStore.setEncounterState(.new)
        return await userStore.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .new
        )
    }

    app.post("encounter", "start") { req async throws -> GameState in
        logConnection(req, action: "encounter-start")
        let campaignName = await campaignStore.currentCampaignName()
        let library = await campaignStore.library()
        await userStore.autoRollUnsetInitiativeForReferee(
            campaignName: campaignName,
            standardDie: library.standardDie
        )
        await userStore.resetTurnState(campaignName: campaignName)
        await campaignStore.setEncounterState(.active)
        return await userStore.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
    }

    app.post("encounter", "suspend") { req async throws -> GameState in
        logConnection(req, action: "encounter-suspend")
        let campaignName = await campaignStore.currentCampaignName()
        await campaignStore.setEncounterState(.suspended)
        return await userStore.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .suspended
        )
    }

    app.get("players", ":owner", "characters") { req async throws -> [PlayerView] in
        guard
            let ownerParam = req.parameters.get("owner"),
            let ownerId = UUID(uuidString: ownerParam)
        else {
            throw Abort(.badRequest)
        }
        let campaignName: String
        if let queryCampaign = req.query[String.self, at: "campaign"] {
            campaignName = queryCampaign
        } else {
            campaignName = await campaignStore.currentCampaignName()
        }
        return await userStore.characters(for: ownerId, campaignName: campaignName)
    }

    app.post("players", ":owner", "rename") { req async throws -> HTTPStatus in
        guard
            let ownerParam = req.parameters.get("owner"),
            let ownerId = UUID(uuidString: ownerParam)
        else {
            throw Abort(.badRequest)
        }
        let input = try req.content.decode(CharacterRenameInput.self)
        let campaignName = await campaignStore.currentCampaignName()
        let previousName = await userStore.ownerName(for: ownerId, campaignName: campaignName) ?? "unknown"
        let renameIdentifier = "\(ownerId.uuidString) owner=\(previousName)->\(input.name)"
        logConnection(req, action: "rename-owner", identifier: renameIdentifier)
        await userStore.renameOwner(ownerId: ownerId, newName: input.name, campaignName: campaignName)
        return .ok
    }

    app.post("characters") { req async throws -> PlayerView in
        let input = try req.content.decode(CharacterInput.self)
        let campaignName: String
        if let providedName = input.campaignName {
            campaignName = providedName
        } else {
            campaignName = await campaignStore.currentCampaignName()
        }
        let resolvedOwnerId: UUID
        if let providedOwnerId = input.ownerId {
            resolvedOwnerId = providedOwnerId
        } else if let existingId = input.id, let existingOwnerId = await userStore.ownerId(for: existingId) {
            resolvedOwnerId = existingOwnerId
        } else {
            resolvedOwnerId = UUID()
        }
        let previousCharacterState: CharacterState?
        if let existingId = input.id {
            previousCharacterState = await userStore.characterState(for: existingId)
        } else {
            previousCharacterState = nil
        }
        let previousOwnerName = previousCharacterState?.ownerName ?? input.ownerName
        let previousCharacterName = previousCharacterState?.characterName ?? input.name
        let upsertIdentifier =
            "\(resolvedOwnerId.uuidString) owner=\(previousOwnerName)->\(input.ownerName) " +
            "character=\(previousCharacterName)->\(input.name)"
        logConnection(req, action: "upsert-character", identifier: upsertIdentifier)
        return await userStore.upsertCharacter(
            id: input.id,
            campaignName: campaignName,
            ownerId: resolvedOwnerId,
            ownerName: input.ownerName,
            characterName: input.name,
            initiative: input.initiative,
            stats: input.stats,
            revealStats: input.revealStats,
            autoSkipTurn: input.autoSkipTurn,
            useAppInitiativeRoll: input.useAppInitiativeRoll,
            initiativeBonus: input.initiativeBonus,
            isHidden: input.isHidden,
            revealOnTurn: input.revealOnTurn,
            conditions: input.conditions.map { Set($0) }
        )
    }

    app.patch("characters", ":id", "visibility") { req async throws -> PlayerView in
        guard let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        logConnection(req, action: "set-visibility", identifier: id.uuidString)
        let input = try req.content.decode(CharacterVisibilityInput.self)
        guard let updated = await userStore.setVisibility(
            id: id,
            isHidden: input.isHidden,
            revealOnTurn: input.revealOnTurn
        ) else {
            throw Abort(.notFound)
        }
        return updated
    }

    app.patch("characters", ":id", "rename") { req async throws -> HTTPStatus in
        guard let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let input = try req.content.decode(CharacterRenameInput.self)
        logConnection(req, action: "rename-character", identifier: id.uuidString)
        await userStore.renameCharacter(id: id, characterName: input.name)
        return .ok
    }

    app.delete("characters", ":id") { req async throws -> HTTPStatus in
        guard let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        logConnection(req, action: "delete-character", identifier: id.uuidString)
        let removed = await userStore.deleteCharacter(id: id)
        if !removed {
            throw Abort(.notFound)
        }
        return .ok
    }

    app.get("conditions-library") { req async throws -> RuleSetLibrary in
        return await campaignStore.library()
    }

    app.get("campaign") { req async throws -> CampaignState in
        return await campaignStore.state()
    }

    app.post("campaign") { req async throws -> CampaignState in
        let input = try req.content.decode(CampaignUpdateInput.self)
        logConnection(req, action: "update-campaign", identifier: input.name)
        let updated = try await campaignStore.update(name: input.name, rulesetId: input.rulesetId)
        try await userStore.configure(
            campaignName: updated.name,
            rulesetId: updated.rulesetId,
            on: req.application.db
        )
        return updated
    }

    app.get("rulesets") { req async throws -> [RulesetSummary] in
        return RuleSetLibraryLoader.availableRulesets()
    }
}
