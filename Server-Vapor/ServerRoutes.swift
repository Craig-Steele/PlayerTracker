import Foundation
import Vapor

private let authSessionCookieName = "roll4_session"
private let playerSessionCookieName = "roll4_player_session"

private func requireActiveCampaign(_ campaignStore: CampaignStore) async throws -> CampaignState {
    guard let activeCampaign = await campaignStore.activeCampaign() else {
        throw Abort(.conflict, reason: "No campaign selected")
    }
    return activeCampaign
}

private func authUserResponse(from user: UserPersistenceState) -> AuthUserResponse {
    AuthUserResponse(
        id: user.id,
        email: user.email,
        displayName: user.displayName
    )
}

private func setAuthCookie(on response: Response, token: String, expiresAt: Date) {
    response.cookies[authSessionCookieName] = .init(
        string: token,
        expires: expiresAt,
        path: "/",
        isSecure: false,
        isHTTPOnly: true,
        sameSite: .lax
    )
}

private func clearAuthCookie(on response: Response) {
    response.cookies[authSessionCookieName] = .expired
}

private func setPlayerCookie(on response: Response, token: String, expiresAt: Date) {
    response.cookies[playerSessionCookieName] = .init(
        string: token,
        expires: expiresAt,
        path: "/",
        isSecure: false,
        isHTTPOnly: true,
        sameSite: .lax
    )
}

private func clearPlayerCookie(on response: Response) {
    response.cookies[playerSessionCookieName] = .expired
}

private func requireAuthenticatedUser(_ req: Request) async throws -> UserPersistenceState {
    guard let token = req.cookies[authSessionCookieName]?.string,
          let user = try await DatabasePersistence.sessionUser(token: token, on: req.db) else {
        throw Abort(.unauthorized, reason: "Not signed in.")
    }
    return user
}

private func requirePlayerSession(_ req: Request, campaignID: UUID? = nil) async throws -> PlayerSessionPersistenceState {
    guard let token = req.cookies[playerSessionCookieName]?.string,
          let session = try await DatabasePersistence.loadPlayerSession(token: token, on: req.db) else {
        throw Abort(.unauthorized, reason: "No player session.")
    }
    if let campaignID, session.campaignID != campaignID {
        throw Abort(.unauthorized, reason: "Player session does not match the active campaign.")
    }
    return session
}

private func currentPlayerSession(_ req: Request, campaignID: UUID? = nil) async throws -> PlayerSessionPersistenceState? {
    guard let token = req.cookies[playerSessionCookieName]?.string else {
        return nil
    }
    guard let session = try await DatabasePersistence.loadPlayerSession(token: token, on: req.db) else {
        return nil
    }
    if let campaignID, session.campaignID != campaignID {
        return nil
    }
    return session
}

private func playerIdentityResponse(from session: PlayerSessionPersistenceState) -> PlayerIdentityResponse {
    PlayerIdentityResponse(
        id: session.id,
        campaignID: session.campaignID,
        displayName: session.displayName
    )
}

private func playerSessionResponse(
    from session: PlayerSessionPersistenceState,
    campaign: CampaignState
) -> PlayerSessionResponse {
    PlayerSessionResponse(
        player: playerIdentityResponse(from: session),
        campaign: campaign
    )
}

func routes(_ app: Application, campaignStore: CampaignStore) throws {
    app.post("auth", "signup") { req async throws -> Response in
        let input = try req.content.decode(AuthSignupInput.self)
        let email = input.email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            throw Abort(.badRequest, reason: "Email is required.")
        }
        guard !input.password.isEmpty else {
            throw Abort(.badRequest, reason: "Password is required.")
        }

        let passwordHash = try await req.application.password.async.hash(input.password)
        let userID = try await DatabasePersistence.createUser(
            email: email,
            passwordHash: passwordHash,
            displayName: input.displayName?.trimmingCharacters(in: .whitespacesAndNewlines),
            on: req.db
        )
        guard let user = try await DatabasePersistence.loadUser(id: userID, on: req.db) else {
            throw Abort(.internalServerError, reason: "Failed to load created user.")
        }
        let sessionExpires = Date().addingTimeInterval(60 * 60 * 24 * 30)
        let sessionToken = try await DatabasePersistence.createSession(
            userID: userID,
            expiresAt: sessionExpires,
            on: req.db
        )
        let res = Response(status: .ok)
        try res.content.encode(AuthSessionResponse(user: authUserResponse(from: user)))
        setAuthCookie(on: res, token: sessionToken, expiresAt: sessionExpires)
        return res
    }

    app.post("auth", "login") { req async throws -> Response in
        let input = try req.content.decode(AuthLoginInput.self)
        let email = input.email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            throw Abort(.badRequest, reason: "Email is required.")
        }
        guard !input.password.isEmpty else {
            throw Abort(.badRequest, reason: "Password is required.")
        }

        guard let user = try await DatabasePersistence.loadUser(email: email, on: req.db) else {
            throw Abort(.unauthorized, reason: "Invalid email or password.")
        }
        let passwordMatches = try await req.application.password.async.verify(
            input.password,
            created: user.passwordHash
        )
        guard passwordMatches else {
            throw Abort(.unauthorized, reason: "Invalid email or password.")
        }

        let sessionExpires = Date().addingTimeInterval(60 * 60 * 24 * 30)
        let sessionToken = try await DatabasePersistence.createSession(
            userID: user.id,
            expiresAt: sessionExpires,
            on: req.db
        )
        let res = Response(status: .ok)
        try res.content.encode(AuthSessionResponse(user: authUserResponse(from: user)))
        setAuthCookie(on: res, token: sessionToken, expiresAt: sessionExpires)
        return res
    }

    app.post("auth", "logout") { req async throws -> Response in
        if let token = req.cookies[authSessionCookieName]?.string {
            try await DatabasePersistence.revokeSession(token: token, on: req.db)
        }
        let response = Response(status: .ok)
        clearAuthCookie(on: response)
        return response
    }

    app.get("auth", "session") { req async throws -> AuthSessionResponse in
        let user = try await requireAuthenticatedUser(req)
        return AuthSessionResponse(user: authUserResponse(from: user))
    }

    app.post("admin", "shutdown") { req async throws -> HTTPStatus in
        let user = try await requireAuthenticatedUser(req)
        logConnection(req, action: "shutdown", identifier: user.email)
        Task {
            try? await Task.sleep(for: .milliseconds(200))
            try? await app.asyncShutdown()
        }
        return .ok
    }

    app.post("player", "join") { req async throws -> Response in
        let input = try req.content.decode(PlayerJoinInput.self)
        let campaign = try await requireActiveCampaign(campaignStore)
        let session = try await DatabasePersistence.createOrRefreshPlayerSession(
            campaignID: campaign.id,
            displayName: input.displayName,
            on: req.db
        )
        let response = Response(status: .ok)
        try response.content.encode(playerSessionResponse(from: session, campaign: campaign))
        setPlayerCookie(on: response, token: session.token, expiresAt: session.expiresAt)
        return response
    }

    app.get("player", "session") { req async throws -> PlayerSessionResponse in
        let campaign = try await requireActiveCampaign(campaignStore)
        let session = try await requirePlayerSession(req, campaignID: campaign.id)
        return playerSessionResponse(from: session, campaign: campaign)
    }

    app.patch("player", "session") { req async throws -> Response in
        let campaign = try await requireActiveCampaign(campaignStore)
        let input = try req.content.decode(PlayerJoinInput.self)
        guard let token = req.cookies[playerSessionCookieName]?.string else {
            throw Abort(.unauthorized, reason: "No player session.")
        }
        guard let updated = try await DatabasePersistence.renamePlayerSession(
            token: token,
            to: input.displayName,
            on: req.db
        ) else {
            throw Abort(.unauthorized, reason: "No player session.")
        }
        let response = Response(status: .ok)
        try response.content.encode(playerSessionResponse(from: updated, campaign: campaign))
        setPlayerCookie(on: response, token: token, expiresAt: updated.expiresAt)
        return response
    }

    app.post("player", "logout") { req async throws -> Response in
        if let token = req.cookies[playerSessionCookieName]?.string {
            try await DatabasePersistence.revokePlayerSession(token: token, on: req.db)
        }
        let response = Response(status: .ok)
        clearPlayerCookie(on: response)
        return response
    }

    app.post("conditions") { req async throws -> HTTPStatus in
        let input = try req.content.decode(ConditionsInput.self)
        logConnection(req, action: "set-conditions", identifier: input.name)
        let campaign = try await requireActiveCampaign(campaignStore)
        await userStore.setConditions(
            name: input.name,
            conditions: Set(input.conditions),
            campaignName: campaign.name
        )
        return .ok
    }

    // GET /user/:name
    app.get("user", ":name") { req async throws -> UserData in
        guard let name = req.parameters.get("name") else {
            throw Abort(.badRequest)
        }

        let campaign = try await requireActiveCampaign(campaignStore)
        let initiative = await userStore.get(name: name, campaignName: campaign.name)?.initiative
        return UserData(name: name, initiative: initiative)
    }

    // GET /users
    app.get("users") { req async throws -> [UserData] in
        let campaign = try await requireActiveCampaign(campaignStore)
        let all = await userStore.all(campaignName: campaign.name)
        return all.map { (key, value) in
            UserData(name: key, initiative: value.initiative)
        }
    }

    app.get { req in
        logConnection(req, action: "root-redirect")
        let hostHeader = req.headers.first(name: .host) ?? ""
        let hostname = hostHeader.split(separator: ":").first.map(String.init)?.lowercased() ?? ""
        let redirectPath = (hostname == "localhost" || hostname == "127.0.0.1")
            ? "/admin.html"
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
        let campaign = try await requireActiveCampaign(campaignStore)
        let viewMode = req.query[String.self, at: "view"] ?? "player"
        let includeHidden = viewMode == "referee"
        return await userStore.state(
            campaignName: campaign.name,
            includeHidden: includeHidden,
            encounterState: campaign.encounterState
        )
    }

    // POST /turn-complete - advance to next turn
    app.post("turn-complete") { req async throws -> GameState in
        logConnection(req, action: "turn-complete")
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
        let encounterState = campaign.encounterState
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
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
        let encounterState = campaign.encounterState
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
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
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
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
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
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
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
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
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
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
        let previousName = await userStore.ownerName(for: ownerId, campaignName: campaignName) ?? "unknown"
        let renameIdentifier = "\(ownerId.uuidString) owner=\(previousName)->\(input.name)"
        logConnection(req, action: "rename-owner", identifier: renameIdentifier)
        await userStore.renameOwner(ownerId: ownerId, newName: input.name, campaignName: campaignName)
        return .ok
    }

    app.post("characters") { req async throws -> PlayerView in
        let input = try req.content.decode(CharacterInput.self)
        let campaign = try await requireActiveCampaign(campaignStore)
        let campaignName = campaign.name
        let resolvedOwnerId: UUID
        if let session = try await currentPlayerSession(req, campaignID: campaign.id) {
            resolvedOwnerId = session.id
        } else if let providedOwnerId = input.ownerId {
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
        guard let campaign = await campaignStore.activeCampaign() else {
            throw Abort(.conflict, reason: "No campaign selected")
        }
        return campaign
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

    app.post("campaigns") { req async throws -> CampaignSummary in
        let input = try req.content.decode(CampaignUpdateInput.self)
        logConnection(req, action: "create-campaign", identifier: input.name)
        return try await campaignStore.createCampaign(name: input.name, rulesetId: input.rulesetId)
    }

    app.get("campaigns") { req async throws -> [CampaignSummary] in
        try await campaignStore.campaigns()
    }

    app.patch("campaigns", ":id") { req async throws -> CampaignSummary in
        guard let idString = req.parameters.get("id"),
              let campaignID = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let input = try req.content.decode(CampaignUpdateInput.self)
        logConnection(req, action: "edit-campaign", identifier: campaignID.uuidString)
        let previousActiveCampaign = await campaignStore.activeCampaign()
        let updated = try await campaignStore.updateCampaign(
            id: campaignID,
            name: input.name,
            rulesetId: input.rulesetId
        )
        if previousActiveCampaign?.id == campaignID {
            await userStore.rebindActiveCampaign(
                from: previousActiveCampaign?.name ?? updated.name,
                to: updated.name,
                rulesetId: updated.rulesetId
            )
        }
        return updated
    }

    app.post("campaigns", ":id", "select") { req async throws -> CampaignState in
        guard let idString = req.parameters.get("id"),
              let campaignID = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        logConnection(req, action: "select-campaign", identifier: campaignID.uuidString)
        let selected = try await campaignStore.selectCampaign(id: campaignID)
        try await userStore.configure(
            campaignName: selected.name,
            rulesetId: selected.rulesetId,
            on: req.application.db
        )
        return selected
    }

    app.get("rulesets") { req async throws -> [RulesetSummary] in
        return RuleSetLibraryLoader.availableRulesets()
    }
}
