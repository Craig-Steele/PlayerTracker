import Foundation
import Fluent
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
        email: user.email
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

private func disableResponseCaching(_ response: inout Response) {
    response.headers.replaceOrAdd(
        name: .cacheControl,
        value: "no-cache, no-store, must-revalidate"
    )
    response.headers.replaceOrAdd(name: .pragma, value: "no-cache")
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

private func requireServerOwnerSession(_ req: Request) async throws -> UserPersistenceState {
    try await requireAuthenticatedUser(req)
}

private func requirePlayerSession(_ req: Request) async throws -> PlayerSessionPersistenceState {
    guard let token = req.cookies[playerSessionCookieName]?.string,
          let session = try await DatabasePersistence.loadPlayerSession(token: token, on: req.db) else {
        throw Abort(.unauthorized, reason: "No player session.")
    }
    return session
}

private func currentPlayerSession(_ req: Request) async throws -> PlayerSessionPersistenceState? {
    guard let token = req.cookies[playerSessionCookieName]?.string else {
        return nil
    }
    guard let session = try await DatabasePersistence.loadPlayerSession(token: token, on: req.db) else {
        return nil
    }
    return session
}

private func playerIdentityResponse(
    from session: PlayerSessionPersistenceState,
    campaignID: UUID,
    isReferee: Bool
) -> PlayerIdentityResponse {
    PlayerIdentityResponse(
        id: session.id,
        campaignID: campaignID,
        loginName: session.loginName,
        displayName: session.displayName,
        isReferee: isReferee
    )
}

private func playerSessionResponse(
    from session: PlayerSessionPersistenceState,
    campaign: CampaignState,
    isReferee: Bool
) -> PlayerSessionResponse {
    PlayerSessionResponse(
        player: playerIdentityResponse(from: session, campaignID: campaign.id, isReferee: isReferee),
        campaign: campaign
    )
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

private func requireActiveCampaignSession(
    _ req: Request,
    campaignStore: CampaignStore
) async throws -> (campaign: CampaignState, session: PlayerSessionPersistenceState) {
    let campaign = try await requireActiveCampaign(campaignStore)
    let session = try await requirePlayerSession(req)
    return (campaign, session)
}

private func requireActiveCampaignMemberSession(
    _ req: Request,
    campaignStore: CampaignStore
) async throws -> (campaign: CampaignState, session: PlayerSessionPersistenceState) {
    let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
    let memberCampaignIDs = try await DatabasePersistence.loadCampaignIDs(
        for: session.id,
        on: req.db
    )
    guard memberCampaignIDs.contains(campaign.id) else {
        throw Abort(.forbidden, reason: "Campaign access required.")
    }
    return (campaign, session)
}

private func requireActiveCampaignParticipantSession(
    _ req: Request,
    campaignStore: CampaignStore
) async throws -> (campaign: CampaignState, session: PlayerSessionPersistenceState) {
    let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
    let memberCampaignIDs = try await DatabasePersistence.loadCampaignIDs(
        for: session.id,
        on: req.db
    )
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

private func currencyUnitLookup(_ system: CurrencySystem?) -> [String: CurrencyUnit] {
    guard let system else { return [:] }
    return Dictionary(uniqueKeysWithValues: system.units.map { ($0.id, $0) })
}

private func totalCommonCurrencyValue(
    _ amounts: [CurrencyAmount],
    system: CurrencySystem?
) -> Double {
    let lookup = currencyUnitLookup(system)
    return amounts.reduce(0) { partialResult, amount in
        guard let unit = lookup[amount.unitId] else {
            return partialResult
        }
        return partialResult + (Double(amount.amount) * unit.valueInCommonCurrency)
    }
}

private func decomposeCommonCurrencyValue(
    _ total: Double,
    system: CurrencySystem?
) -> [CurrencyAmount] {
    guard let system else { return [] }
    let lookup = currencyUnitLookup(system)
    let units = system.units
        .filter { $0.valueInCommonCurrency > 0 }
        .sorted { lhs, rhs in
            if lhs.valueInCommonCurrency == rhs.valueInCommonCurrency {
                return lhs.id < rhs.id
            }
            return lhs.valueInCommonCurrency > rhs.valueInCommonCurrency
        }
    var remaining = max(0, total)
    let epsilon = 1e-9
    var results: [CurrencyAmount] = []

    for unit in units {
        guard unit.valueInCommonCurrency > 0 else { continue }
        let amount = Int(floor((remaining + epsilon) / unit.valueInCommonCurrency))
        guard amount > 0 else { continue }
        results.append(CurrencyAmount(unitId: unit.id, amount: amount))
        remaining -= Double(amount) * unit.valueInCommonCurrency
    }

    if abs(remaining) > epsilon,
       let commonUnit = lookup[system.commonCurrencyId],
       commonUnit.valueInCommonCurrency > 0 {
        let amount = Int(round(remaining / commonUnit.valueInCommonCurrency))
        if amount != 0 {
            if let index = results.firstIndex(where: { $0.unitId == commonUnit.id }) {
                results[index] = CurrencyAmount(unitId: commonUnit.id, amount: results[index].amount + amount)
            } else {
                results.append(CurrencyAmount(unitId: commonUnit.id, amount: amount))
            }
        }
    }

    return results.filter { $0.amount != 0 }
}

private func adjustCurrencyAmounts(
    _ amounts: [CurrencyAmount],
    commonDelta: Double,
    system: CurrencySystem?
) -> [CurrencyAmount]? {
    guard system != nil else {
        return amounts
    }
    let current = totalCommonCurrencyValue(amounts, system: system)
    let nextTotal = current + commonDelta
    if nextTotal < -1e-9 {
        return nil
    }
    return decomposeCommonCurrencyValue(nextTotal, system: system)
}

private func adjustCurrencyAmountsPreferCommonUnit(
    _ amounts: [CurrencyAmount],
    commonDelta: Double,
    system: CurrencySystem?
) -> [CurrencyAmount]? {
    guard let system else {
        return amounts
    }
    let lookup = currencyUnitLookup(system)
    guard let commonUnit = lookup[system.commonCurrencyId] else {
        return adjustCurrencyAmounts(amounts, commonDelta: commonDelta, system: system)
    }

    let epsilon = 1e-9
    let commonUnitValue = commonUnit.valueInCommonCurrency
    if commonUnitValue > 0 {
        let deltaInCommonUnits = commonDelta / commonUnitValue
        let roundedDelta = deltaInCommonUnits.rounded()
        if abs(deltaInCommonUnits - roundedDelta) <= epsilon {
            let commonDeltaUnits = Int(roundedDelta)
            var amountByUnit = Dictionary(uniqueKeysWithValues: amounts.map { ($0.unitId, $0.amount) })
            let sortedUnits = system.units.sorted {
                if $0.valueInCommonCurrency == $1.valueInCommonCurrency {
                    return $0.id < $1.id
                }
                return $0.valueInCommonCurrency > $1.valueInCommonCurrency
            }
            if commonDeltaUnits >= 0 {
                amountByUnit[commonUnit.id, default: 0] += commonDeltaUnits
            } else {
                var remainingCommonUnits = Double(-commonDeltaUnits)
                let currentCommonUnits = amountByUnit[commonUnit.id, default: 0]
                let useFromCommon = min(currentCommonUnits, Int(remainingCommonUnits))
                amountByUnit[commonUnit.id] = currentCommonUnits - useFromCommon
                remainingCommonUnits -= Double(useFromCommon)

                if remainingCommonUnits > epsilon {
                    for unit in sortedUnits where unit.id != commonUnit.id && unit.valueInCommonCurrency > 0 {
                        guard remainingCommonUnits > epsilon else { break }
                        let currentAmount = amountByUnit[unit.id, default: 0]
                        if currentAmount <= 0 { continue }
                        let requiredAmount = Int(ceil(remainingCommonUnits / unit.valueInCommonCurrency))
                        let usedAmount = min(currentAmount, requiredAmount)
                        amountByUnit[unit.id] = currentAmount - usedAmount
                        remainingCommonUnits -= Double(usedAmount) * unit.valueInCommonCurrency
                    }
                }

                if remainingCommonUnits > epsilon {
                    return nil
                }
            }

            return sortedUnits.compactMap { unit in
                let amount = amountByUnit[unit.id] ?? 0
                if amount != 0 || unit.id == commonUnit.id {
                    return CurrencyAmount(unitId: unit.id, amount: amount)
                }
                return nil
            }
        }
    }

    return adjustCurrencyAmounts(amounts, commonDelta: commonDelta, system: system)
}

private func normalizeTreasureEntry(_ entry: InventoryEntry) -> InventoryEntry? {
    let name = entry.name.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty else { return nil }
    let url = entry.url?.trimmingCharacters(in: .whitespacesAndNewlines)
    let category = entry.category?.trimmingCharacters(in: .whitespacesAndNewlines)
    let cappedValue = (entry.value * 100).rounded() / 100
    return InventoryEntry(
        id: entry.id ?? UUID(),
        name: name,
        quantity: max(1, entry.quantity),
        value: cappedValue,
        weight: entry.weight,
        url: url?.isEmpty == false ? url : nil,
        category: category?.isEmpty == false ? category : nil,
        containerId: nil,
        isContainer: false
    )
}

private func treasureEntriesStackTogether(_ lhs: InventoryEntry, _ rhs: InventoryEntry) -> Bool {
    guard !lhs.isContainer, !rhs.isContainer else { return false }
    guard lhs.containerId == rhs.containerId else { return false }
    return normalizedTreasureText(lhs.name) == normalizedTreasureText(rhs.name)
        && normalizedTreasureText(lhs.category) == normalizedTreasureText(rhs.category)
        && normalizedTreasureText(lhs.url) == normalizedTreasureText(rhs.url)
        && lhs.value == rhs.value
        && lhs.weight == rhs.weight
}

private func normalizedTreasureText(_ value: String?) -> String? {
    guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
        return nil
    }
    return trimmed
}

private func stackTreasureEntry(
    into inventory: [InventoryEntry],
    entry: InventoryEntry
) -> [InventoryEntry] {
    let normalizedEntry = InventoryEntry(
        id: entry.id,
        name: entry.name.trimmingCharacters(in: .whitespacesAndNewlines),
        quantity: max(1, entry.quantity),
        value: entry.value,
        weight: entry.weight,
        url: normalizedTreasureText(entry.url),
        category: normalizedTreasureText(entry.category),
        containerId: entry.containerId,
        isContainer: false
    )
    var nextInventory = inventory
    if let index = nextInventory.firstIndex(where: { treasureEntriesStackTogether($0, normalizedEntry) }) {
        let existing = nextInventory[index]
        nextInventory[index] = InventoryEntry(
            id: existing.id ?? normalizedEntry.id,
            name: existing.name,
            quantity: existing.quantity + normalizedEntry.quantity,
            value: existing.value,
            weight: existing.weight,
            url: existing.url,
            category: existing.category,
            containerId: existing.containerId,
            isContainer: false
        )
    } else {
        nextInventory.append(InventoryEntry(
            id: normalizedEntry.id ?? UUID(),
            name: normalizedEntry.name,
            quantity: normalizedEntry.quantity,
            value: normalizedEntry.value,
            weight: normalizedEntry.weight,
            url: normalizedEntry.url,
            category: normalizedEntry.category,
            containerId: nil,
            isContainer: false
        ))
    }
    return nextInventory
}

private func requireRefereeSession(
    _ req: Request,
    campaignStore: CampaignStore
) async throws -> (campaign: CampaignState, session: PlayerSessionPersistenceState) {
    let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
    let refereeIDs = try await DatabasePersistence.loadCampaignRefereeSessionIDs(
        campaignID: campaign.id,
        on: req.db
    )
    guard refereeIDs.contains(session.id) else {
        throw Abort(.forbidden, reason: "Referee access required.")
    }
    return (campaign, session)
}

private func requireInviteManager(
    _ req: Request,
    campaignStore: CampaignStore,
    campaignID: UUID
) async throws -> CampaignSummary {
    let campaigns = try await campaignStore.campaigns()
    guard let campaign = campaigns.first(where: { $0.id == campaignID }) else {
        throw Abort(.notFound, reason: "Campaign not found.")
    }

    if (try? await requireAuthenticatedUser(req)) != nil {
        return campaign
    }

    guard let session = try await currentPlayerSession(req) else {
        throw Abort(.unauthorized, reason: "Not signed in.")
    }
    let refereeIDs = try await DatabasePersistence.loadCampaignRefereeSessionIDs(
        campaignID: campaign.id,
        on: req.db
    )
    guard refereeIDs.contains(session.id) else {
        throw Abort(.forbidden, reason: "Invite access required.")
    }
    return campaign
}

private func refreshPlayerClaimActivity(
    campaign: CampaignState,
    session: PlayerSessionPersistenceState,
    userStore: UserStore
) async {
    await userStore.expireStaleClaims(
        campaignName: campaign.name,
        claimTimeoutMinutes: campaign.claimTimeoutMinutes
    )
    await userStore.touchClaims(
        for: session.id,
        campaignName: campaign.name,
        claimTimeoutMinutes: campaign.claimTimeoutMinutes
    )
}

private enum ServerSentEventStreamFrame<Value> {
    case heartbeat
    case value(Value)
}

private final class ServerSentEventStreamTaskBag: @unchecked Sendable {
    var messageTask: Task<Void, Never>?
    var heartbeatTask: Task<Void, Never>?

    func cancel() {
        messageTask?.cancel()
        heartbeatTask?.cancel()
    }
}

private func makeServerSentEventStream<Value: Sendable>(
    messages: AsyncStream<Value>,
    heartbeatInterval: Duration = .seconds(25)
) -> AsyncStream<ServerSentEventStreamFrame<Value>> {
    let (stream, continuation) = AsyncStream<ServerSentEventStreamFrame<Value>>.makeStream()
    let taskBag = ServerSentEventStreamTaskBag()

    continuation.onTermination = { _ in
        taskBag.cancel()
    }

    taskBag.messageTask = Task {
        for await message in messages {
            if Task.isCancelled {
                break
            }
            continuation.yield(.value(message))
        }
        continuation.finish()
        taskBag.heartbeatTask?.cancel()
    }

    taskBag.heartbeatTask = Task {
        while !Task.isCancelled {
            try? await Task.sleep(for: heartbeatInterval)
            if Task.isCancelled {
                return
            }
            continuation.yield(.heartbeat)
        }
    }

    return stream
}

private func serverSentEvent<T: Encodable>(
    event: String,
    payload: T
) throws -> String {
    let encoder = JSONEncoder()
    let data = try encoder.encode(payload)
    let json = String(decoding: data, as: UTF8.self)
    return "event: \(event)\ndata: \(json)\n\n"
}

private func campaignStreamSnapshot(
    campaign: CampaignState,
    userStore: UserStore
) async -> CampaignStreamSnapshot {
    let gameState = await userStore.state(
        campaignName: campaign.name,
        includeHidden: true,
        encounterState: campaign.encounterState
    )
    return CampaignStreamSnapshot(campaign: campaign, gameState: gameState)
}

private func activeCampaignStreamSnapshot(
    campaignStore: CampaignStore
) async -> ActiveCampaignStreamSnapshot {
    ActiveCampaignStreamSnapshot(campaign: await campaignStore.activeCampaign())
}

private func publishCampaignUpdate(
    campaign: CampaignState,
    userStore: UserStore,
    eventHub: CampaignEventHub,
    event: String = "campaign-updated"
) async {
    let snapshot = await campaignStreamSnapshot(campaign: campaign, userStore: userStore)
        await eventHub.publish(
            campaignID: campaign.id,
            message: CampaignStreamMessage(event: event, snapshot: snapshot)
        )
}

private func publishActiveCampaignUpdate(
    campaignStore: CampaignStore,
    eventHub: ActiveCampaignEventHub,
    event: String = "campaign-updated"
) async {
    let snapshot = await activeCampaignStreamSnapshot(campaignStore: campaignStore)
    await eventHub.publish(
        message: ActiveCampaignStreamMessage(event: event, snapshot: snapshot)
    )
}

func restoreActiveCampaignState(
    campaignStore: CampaignStore,
    userStore: UserStore,
    eventHub: CampaignEventHub,
    activeCampaignEventHub: ActiveCampaignEventHub,
    database: any Database
) async throws {
    guard let activeCampaign = await campaignStore.activeCampaign() else {
        return
    }

    try await userStore.configure(
        campaignName: activeCampaign.name,
        rulesetId: activeCampaign.rulesetId,
        on: database
    )
    await publishCampaignUpdate(campaign: activeCampaign, userStore: userStore, eventHub: eventHub)
    await publishActiveCampaignUpdate(campaignStore: campaignStore, eventHub: activeCampaignEventHub)
}

func routes(
    _ app: Application,
    campaignStore: CampaignStore,
    eventHub: CampaignEventHub,
    activeCampaignEventHub: ActiveCampaignEventHub
) throws {
    let userStore = app.userStore

    app.registerTacticalRoutes()

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
        let user = try await requireServerOwnerSession(req)
        logConnection(req, action: "shutdown", identifier: user.email)
        Task {
            await eventHub.shutdown()
            await activeCampaignEventHub.shutdown()
            try? await Task.sleep(for: .milliseconds(200))
            try? await app.asyncShutdown()
        }
        return .ok
    }

    app.post("player", "join") { req async throws -> Response in
        let input = try req.content.decode(PlayerJoinInput.self)
        let campaign = try await requireActiveCampaign(campaignStore)
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        let session = try await DatabasePersistence.createOrRefreshPlayerSession(
            loginName: input.displayName,
            displayName: input.displayName,
            on: req.db
        )
        let isAlreadyMember = try await DatabasePersistence.isCampaignMember(
            campaignID: campaign.id,
            playerID: session.id,
            on: req.db
        )
        if campaign.isInviteOnly && !isAlreadyMember {
            throw Abort(.forbidden, reason: "Campaign is invite only. Ask the server owner or a referee to add you by name.")
        } else if !isAlreadyMember {
            try await DatabasePersistence.ensureCampaignMember(
                campaignID: campaign.id,
                playerID: session.id,
                role: "player",
                on: req.db
            )
        }
        let refereeAccess = try await isRefereeSession(session, in: campaign.id, on: req.db)
        let response = Response(status: .ok)
        try response.content.encode(playerSessionResponse(from: session, campaign: campaign, isReferee: refereeAccess))
        setPlayerCookie(on: response, token: session.token, expiresAt: session.expiresAt)
        return response
    }

    app.get("player", "session") { req async throws -> Response in
        let (campaign, session) = try await requireActiveCampaignMemberSession(req, campaignStore: campaignStore)
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        let refereeAccess = try await isRefereeSession(session, in: campaign.id, on: req.db)
        var response = Response(status: .ok)
        disableResponseCaching(&response)
        try response.content.encode(playerSessionResponse(from: session, campaign: campaign, isReferee: refereeAccess))
        return response
    }

    app.patch("player", "session") { req async throws -> Response in
        let (campaign, session) = try await requireActiveCampaignMemberSession(req, campaignStore: campaignStore)
        let input = try req.content.decode(PlayerJoinInput.self)
        let token = session.token
        guard let updated = try await DatabasePersistence.renamePlayerSession(
            token: token,
            to: input.displayName,
            on: req.db
        ) else {
            throw Abort(.unauthorized, reason: "No player session.")
        }
        await userStore.renameOwner(
            ownerId: updated.id,
            newName: updated.displayName,
            campaignName: campaign.name
        )
        try await DatabasePersistence.renamePlayerDisplayName(
            playerID: updated.id,
            newDisplayName: updated.displayName,
            on: req.db
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: updated, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        let refereeAccess = try await isRefereeSession(updated, in: campaign.id, on: req.db)
        let response = Response(status: .ok)
        try response.content.encode(playerSessionResponse(from: updated, campaign: campaign, isReferee: refereeAccess))
        setPlayerCookie(on: response, token: token, expiresAt: updated.expiresAt)
        return response
    }

    app.get("me") { req async throws -> Response in
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        let refereeAccess = try await isRefereeSession(session, in: campaign.id, on: req.db)
        var response = Response(status: .ok)
        disableResponseCaching(&response)
        try response.content.encode(playerIdentityResponse(from: session, campaignID: campaign.id, isReferee: refereeAccess))
        return response
    }

    app.get("me", "campaigns") { req async throws -> Response in
        let session = try await requirePlayerSession(req)
        let campaignIDs = try await DatabasePersistence.loadCampaignIDs(
            for: session.id,
            on: req.db
        )
        let campaigns = try await campaignStore.campaigns()
        var response = Response(status: .ok)
        disableResponseCaching(&response)
        try response.content.encode(campaigns.filter { campaignIDs.contains($0.id) })
        return response
    }

    app.get("campaigns", ":campaignId", "events") { req async throws -> Response in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        let response = Response(status: .ok)
        response.headers.replaceOrAdd(name: .contentType, value: "text/event-stream; charset=utf-8")
        response.headers.replaceOrAdd(name: .cacheControl, value: "no-cache, no-transform")
        response.headers.replaceOrAdd(name: .connection, value: "keep-alive")
        let acceptsEventStream = (req.headers.first(name: .accept) ?? "")
            .lowercased()
            .contains("text/event-stream")
        if acceptsEventStream {
            response.body = .init(managedAsyncStream: { writer in
                let messages = await eventHub.subscribe(campaignID: campaign.id)
                let snapshot = await campaignStreamSnapshot(campaign: campaign, userStore: userStore)
                try await writer.writeBuffer(
                    ByteBuffer(string: try serverSentEvent(event: "snapshot", payload: snapshot))
                )
                for await frame in makeServerSentEventStream(messages: messages) {
                    if Task.isCancelled {
                        break
                    }
                    switch frame {
                    case .heartbeat:
                        try await writer.writeBuffer(ByteBuffer(string: ": keepalive\n\n"))
                    case .value(let message):
                        try await writer.writeBuffer(
                            ByteBuffer(string: try serverSentEvent(event: message.event, payload: message.snapshot))
                        )
                    }
                }
            })
        } else {
            let snapshot = await campaignStreamSnapshot(campaign: campaign, userStore: userStore)
            response.body = .init(string: try serverSentEvent(event: "snapshot", payload: snapshot))
        }
        return response
    }

    app.post("campaigns", ":campaignId", "keepalive") { req async throws -> HTTPStatus in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignMemberSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        return .ok
    }

    app.patch("me") { req async throws -> PlayerIdentityResponse in
        let (campaign, session) = try await requireActiveCampaignMemberSession(req, campaignStore: campaignStore)
        let input = try req.content.decode(PlayerJoinInput.self)
        guard let updated = try await DatabasePersistence.renamePlayerSession(
            token: session.token,
            to: input.displayName,
            on: req.db
        ) else {
            throw Abort(.unauthorized, reason: "No player session.")
        }
        await userStore.renameOwner(
            ownerId: updated.id,
            newName: updated.displayName,
            campaignName: campaign.name
        )
        try await DatabasePersistence.renamePlayerDisplayName(
            playerID: updated.id,
            newDisplayName: updated.displayName,
            on: req.db
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: updated, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        let refereeAccess = try await isRefereeSession(updated, in: campaign.id, on: req.db)
        return playerIdentityResponse(from: updated, campaignID: campaign.id, isReferee: refereeAccess)
    }

    app.post("player", "logout") { req async throws -> Response in
        if let session = try await currentPlayerSession(req),
           let campaign = await campaignStore.activeCampaign() {
            await userStore.releaseClaims(for: session.id, campaignName: campaign.name)
        }
        if let token = req.cookies[playerSessionCookieName]?.string {
            try await DatabasePersistence.revokePlayerSession(token: token, on: req.db)
        }
        let response = Response(status: .ok)
        clearPlayerCookie(on: response)
        return response
    }

    app.post("referee", "campaigns", ":campaignId", "characters", ":id", "release") { req async throws -> PlayerView in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString),
              let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireRefereeSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        let released = try await userStore.forceReleaseCharacter(
            id: id,
            campaignName: campaign.name
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return released
    }

    app.post("referee", "campaigns", ":campaignId", "characters", ":id", "release-to-pool") { req async throws -> PlayerView in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString),
              let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireRefereeSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        let released = try await userStore.releaseCharacterToPool(
            id: id,
            campaignName: campaign.name
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return released
    }

    app.post("referee", "campaigns", ":campaignId", "characters", ":id", "claim") { req async throws -> PlayerView in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString),
              let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireRefereeSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        let claimed = try await userStore.claimCharacter(
            id: id,
            ownerId: session.id,
            ownerName: session.displayName,
            campaignName: campaign.name
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return claimed
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
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
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

    app.get("campaigns", ":campaignId", "members") { req async throws -> [CampaignMemberSummary] in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let campaign = try await requireInviteManager(req, campaignStore: campaignStore, campaignID: routeCampaignID)
        return try await DatabasePersistence.loadCampaignMembers(campaignID: campaign.id, on: req.db)
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
        let includeHidden: Bool
        if viewMode == "referee" {
            let (_, refereeSession) = try await requireRefereeSession(req, campaignStore: campaignStore)
            await refreshPlayerClaimActivity(campaign: campaign, session: refereeSession, userStore: userStore)
            includeHidden = true
        } else {
            let (_, playerSession) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
            await refreshPlayerClaimActivity(campaign: campaign, session: playerSession, userStore: userStore)
            includeHidden = false
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        return await userStore.state(
            campaignName: campaign.name,
            includeHidden: includeHidden,
            encounterState: campaign.encounterState
        )
    }

    // POST /turn-complete - advance to next turn
    app.post("turn-complete") { req async throws -> GameState in
        logConnection(req, action: "turn-complete")
        let (campaign, _) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
        let campaignName = campaign.name
        let encounterState = campaign.encounterState
        guard encounterState == .active else {
            throw Abort(.conflict, reason: "Encounter is not active.")
        }
        let state = await userStore.nextTurn(
            campaignName: campaignName,
            includeHidden: false,
            encounterState: encounterState
        )
        await publishCampaignUpdate(
            campaign: campaign,
            userStore: userStore,
            eventHub: eventHub,
            event: "turn-changed"
        )
        return state
    }

    app.post("turn-set", ":id") { req async throws -> GameState in
        guard let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        logConnection(req, action: "turn-set", identifier: id.uuidString)
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let campaignName = campaign.name
        let encounterState = campaign.encounterState
        guard encounterState == .active else {
            throw Abort(.conflict, reason: "Encounter is not active.")
        }
        let state = await userStore.setCurrentTurn(
            campaignName: campaignName,
            characterId: id,
            encounterState: encounterState
        )
        await publishCampaignUpdate(
            campaign: campaign,
            userStore: userStore,
            eventHub: eventHub,
            event: "turn-changed"
        )
        return state
    }

    app.post("encounter", "new") { req async throws -> GameState in
        logConnection(req, action: "encounter-new")
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let campaignName = campaign.name
        await userStore.resetForNewEncounter(campaignName: campaignName)
        _ = await campaignStore.setEncounterState(.new)
        let updatedCampaign = await campaignStore.activeCampaign() ?? campaign
        let state = await userStore.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .new
        )
        await publishCampaignUpdate(campaign: updatedCampaign, userStore: userStore, eventHub: eventHub)
        return state
    }

    app.post("encounter", "start") { req async throws -> GameState in
        logConnection(req, action: "encounter-start")
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let campaignName = campaign.name
        let library = await campaignStore.library()
        await userStore.autoRollUnsetInitiativeForReferee(
            campaignName: campaignName,
            standardDie: library.standardDie
        )
        await userStore.resetTurnState(campaignName: campaignName)
        _ = await campaignStore.setEncounterState(.active)
        let updatedCampaign = await campaignStore.activeCampaign() ?? campaign
        let state = await userStore.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
        await publishCampaignUpdate(
            campaign: updatedCampaign,
            userStore: userStore,
            eventHub: eventHub,
            event: "encounter-start"
        )
        return state
    }

    app.post("encounter", "resume") { req async throws -> GameState in
        logConnection(req, action: "encounter-resume")
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let campaignName = campaign.name
        _ = await campaignStore.setEncounterState(.active)
        let updatedCampaign = await campaignStore.activeCampaign() ?? campaign
        let state = await userStore.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .active
        )
        await publishCampaignUpdate(
            campaign: updatedCampaign,
            userStore: userStore,
            eventHub: eventHub,
            event: "encounter-resume"
        )
        return state
    }

    app.post("encounter", "suspend") { req async throws -> GameState in
        logConnection(req, action: "encounter-suspend")
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let campaignName = campaign.name
        _ = await campaignStore.setEncounterState(.suspended)
        let updatedCampaign = await campaignStore.activeCampaign() ?? campaign
        let state = await userStore.state(
            campaignName: campaignName,
            includeHidden: true,
            encounterState: .suspended
        )
        await publishCampaignUpdate(campaign: updatedCampaign, userStore: userStore, eventHub: eventHub)
        return state
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
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return .ok
    }

    app.get("campaigns", ":campaignId", "me", "characters") { req async throws -> [PlayerView] in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        return await userStore.characters(for: session.id, campaignName: campaign.name)
    }

    app.get("campaigns", ":campaignId", "characters") { req async throws -> [PlayerView] in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        return await userStore.allCharacters(campaignName: campaign.name)
    }

    app.post("campaigns", ":campaignId", "me", "characters") { req async throws -> PlayerView in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        let isAlreadyMember = try await DatabasePersistence.isCampaignMember(
            campaignID: campaign.id,
            playerID: session.id,
            on: req.db
        )
        if campaign.isInviteOnly && !isAlreadyMember {
            throw Abort(.forbidden, reason: "Campaign access required.")
        } else if !isAlreadyMember {
            try await DatabasePersistence.ensureCampaignMember(
                campaignID: campaign.id,
                playerID: session.id,
                role: "player",
                on: req.db
            )
        }
        let input = try req.content.decode(CharacterInput.self)
        let existingCharacter = input.id.flatMap { userStore.characterState(for: $0) }
        let resolvedOwnerId: UUID
        let resolvedOwnerName: String
        if let existingCharacter, existingCharacter.ownerId != session.id {
            resolvedOwnerId = existingCharacter.ownerId
            resolvedOwnerName = existingCharacter.ownerName
        } else {
            resolvedOwnerId = session.id
            resolvedOwnerName = session.displayName
        }
        let created = await userStore.upsertCharacter(
            id: input.id,
            campaignName: campaign.name,
            ownerId: resolvedOwnerId,
            ownerName: resolvedOwnerName,
            characterName: input.name,
            referenceUrl: input.referenceUrl,
            statBlockId: input.statBlockId,
            initiative: input.initiative,
            initiativeGroupId: input.initiativeGroupId,
            initiativeGroupIndex: input.initiativeGroupIndex,
            stats: input.stats,
            currency: input.currency,
            inventory: input.inventory,
            revealStats: input.revealStats,
            autoSkipTurn: input.autoSkipTurn,
            useAppInitiativeRoll: input.useAppInitiativeRoll,
            initiativeBonus: input.initiativeBonus,
            isHidden: input.isHidden,
            revealOnTurn: input.revealOnTurn,
            conditions: input.conditions.map { Set($0) }
        )
        var responseCharacter = created
        if campaign.encounterState == .active,
           try await isRefereeSession(session, in: campaign.id, on: req.db) {
            responseCharacter = await userStore.rollInitiativeForCharacter(
                id: created.id,
                standardDie: (await campaignStore.library()).standardDie
            ) ?? created
        }
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return responseCharacter
    }

    app.post("campaigns", ":campaignId", "me", "characters", ":id", "claim") { req async throws -> PlayerView in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString),
              let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        let claimed = try await userStore.claimCharacter(
            id: id,
            ownerId: session.id,
            ownerName: session.displayName,
            campaignName: campaign.name
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return claimed
    }

    app.post("campaigns", ":campaignId", "me", "characters", ":id", "release") { req async throws -> PlayerView in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString),
              let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        let released = try await userStore.releaseCharacter(
            id: id,
            ownerId: session.id,
            campaignName: campaign.name
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return released
    }

    app.patch("campaigns", ":campaignId", "me", "characters", ":id") { req async throws -> PlayerView in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString),
              let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        await userStore.expireStaleClaims(
            campaignName: campaign.name,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes
        )
        guard let existing = await userStore.characterState(for: id),
              existing.campaignName == campaign.name,
              existing.ownerId == session.id else {
            throw Abort(.unauthorized, reason: "Character not owned by current session.")
        }
        let input = try req.content.decode(CharacterInput.self)
        let updated = await userStore.upsertCharacter(
            id: id,
            campaignName: campaign.name,
            ownerId: session.id,
            ownerName: session.displayName,
            characterName: input.name,
            referenceUrl: input.referenceUrl,
            statBlockId: input.statBlockId,
            initiative: input.initiative,
            initiativeGroupId: input.initiativeGroupId,
            initiativeGroupIndex: input.initiativeGroupIndex,
            stats: input.stats,
            currency: input.currency,
            inventory: input.inventory,
            revealStats: input.revealStats,
            autoSkipTurn: input.autoSkipTurn,
            useAppInitiativeRoll: input.useAppInitiativeRoll,
            initiativeBonus: input.initiativeBonus,
            isHidden: input.isHidden,
            revealOnTurn: input.revealOnTurn,
            conditions: input.conditions.map { Set($0) }
        )
        await refreshPlayerClaimActivity(campaign: campaign, session: session, userStore: userStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return updated
    }

    app.delete("campaigns", ":campaignId", "me", "characters", ":id") { req async throws -> HTTPStatus in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let routeCampaignID = UUID(uuidString: campaignIDString),
              let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let (campaign, session) = try await requireActiveCampaignSession(req, campaignStore: campaignStore)
        guard campaign.id == routeCampaignID else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        guard let character = await userStore.characterState(for: id),
              character.campaignName == campaign.name,
              character.ownerId == session.id else {
            throw Abort(.unauthorized, reason: "Character not owned by current session.")
        }
        let removed = await userStore.deleteCharacter(id: id)
        if !removed {
            throw Abort(.notFound)
        }
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return .ok
    }

    app.patch("characters", ":id", "visibility") { req async throws -> PlayerView in
        guard let idString = req.parameters.get("id"),
              let id = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        logConnection(req, action: "set-visibility", identifier: id.uuidString)
        let _ = try await requireRefereeSession(req, campaignStore: campaignStore)
        let input = try req.content.decode(CharacterVisibilityInput.self)
        guard let updated = await userStore.setVisibility(
            id: id,
            isHidden: input.isHidden,
            revealOnTurn: input.revealOnTurn
        ) else {
            throw Abort(.notFound)
        }
        let campaign = try await requireActiveCampaign(campaignStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
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
        let campaign = try await requireActiveCampaign(campaignStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
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
        let campaign = try await requireActiveCampaign(campaignStore)
        await publishCampaignUpdate(campaign: campaign, userStore: userStore, eventHub: eventHub)
        return .ok
    }

    app.get("conditions-library") { req async throws -> RuleSetLibrary in
        return await campaignStore.library()
    }

    app.get("creature-library") { req async throws -> CreatureLibraryResponse in
        let library = await campaignStore.library()
        let query = req.query[String.self, at: "query"]
        let limit = req.query[Int.self, at: "limit"] ?? 50
        let activeCampaign = await campaignStore.activeCampaign()
        let selectedUserDataFiles = activeCampaign?.userdataFiles ?? []
        return try await CreatureLibraryStore.shared.library(
            rulesetId: library.id,
            rulesetLabel: library.label,
            query: query,
            limit: limit,
            selectedLocalCreatureFiles: selectedUserDataFiles,
            configuration: req.application.creatureLibraryConfiguration
        )
    }

    app.get("equipment-library") { req async throws -> EquipmentLibraryResponse in
        let library = await campaignStore.library()
        let query = req.query[String.self, at: "query"]
        let limit = req.query[Int.self, at: "limit"] ?? 100
        return try await EquipmentLibraryStore.shared.library(
            rulesetId: library.id,
            rulesetLabel: library.label,
            query: query,
            limit: limit
        )
    }

    app.post("creature-library", "import") { req async throws -> CreatureLibraryImportResponse in
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let input = try req.content.decode(CreatureLibraryImportInput.self)
        let destination = AppPaths.userDataDirectory(
            rulesetId: campaign.rulesetId,
            application: req.application
        )
        let response = try CreatureLibraryImportService.importFiles(
            input.files,
            into: destination,
            overwrite: input.overwrite ?? false,
            rulesetId: campaign.rulesetId
        )
        await CreatureLibraryStore.shared.invalidate(rulesetId: campaign.rulesetId)
        return response
    }

    app.get("campaign") { req async throws -> Response in
        guard let campaign = await campaignStore.activeCampaign() else {
            throw Abort(.conflict, reason: "No campaign selected")
        }
        var response = Response(status: .ok)
        disableResponseCaching(&response)
        try response.content.encode(campaign)
        return response
    }

    app.put("campaign", "party-treasure") { req async throws -> CampaignState in
        _ = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
        let input = try req.content.decode(PartyTreasureUpdateInput.self)
        let normalized = input.items.compactMap { normalizeTreasureEntry($0) }
        let updated = try await campaignStore.updatePartyTreasure(normalized, currency: input.currency)
        await publishCampaignUpdate(
            campaign: updated,
            userStore: userStore,
            eventHub: eventHub,
            event: "campaign-updated"
        )
        return updated
    }

    app.post("campaign", "party-treasure", "claim") { req async throws -> CampaignState in
        let (campaign, session) = try await requireActiveCampaignParticipantSession(req, campaignStore: campaignStore)
        let input = try req.content.decode(PartyTreasureClaimInput.self)
        guard let currentCampaign = await campaignStore.activeCampaign(), currentCampaign.id == campaign.id else {
            throw Abort(.conflict, reason: "Campaign is not active.")
        }
        guard var claimant = await userStore.characterState(for: input.characterId),
              claimant.campaignName == campaign.name else {
            throw Abort(.notFound, reason: "Character not found.")
        }
        guard claimant.ownerId == session.id || claimant.claimedSessionId == session.id else {
            throw Abort(.forbidden, reason: "Claim access required.")
        }
        let treasure = await campaignStore.partyTreasure()
        guard let itemIndex = treasure.firstIndex(where: { $0.id == input.itemId }) else {
            throw Abort(.notFound, reason: "Party treasure item not found.")
        }
        let claimedItem = treasure[itemIndex]
        let requestedQuantity = max(1, input.quantity ?? 1)
        guard requestedQuantity <= claimedItem.quantity else {
            throw Abort(.badRequest, reason: "Requested quantity exceeds available party treasure.")
        }
        let remainingQuantity = claimedItem.quantity - requestedQuantity
        var updatedTreasure = treasure
        if remainingQuantity > 0 {
            updatedTreasure[itemIndex] = InventoryEntry(
                id: claimedItem.id,
                name: claimedItem.name,
                quantity: remainingQuantity,
                value: claimedItem.value,
                weight: claimedItem.weight,
                url: claimedItem.url,
                category: claimedItem.category,
                containerId: claimedItem.containerId,
                isContainer: claimedItem.isContainer
            )
        } else {
            updatedTreasure.remove(at: itemIndex)
        }

        let claimedInventoryItem = InventoryEntry(
            id: UUID(),
            name: claimedItem.name,
            quantity: requestedQuantity,
            value: claimedItem.value,
            weight: claimedItem.weight,
            url: claimedItem.url,
            category: claimedItem.category,
            containerId: nil,
            isContainer: false
        )

        claimant.inventory = stackTreasureEntry(into: claimant.inventory, entry: claimedInventoryItem)

        _ = try await userStore.replaceCharacterState(claimant)
        let updatedCampaign = try await campaignStore.updatePartyTreasure(updatedTreasure)
        await publishCampaignUpdate(
            campaign: updatedCampaign,
            userStore: userStore,
            eventHub: eventHub,
            event: "campaign-updated"
        )
        return updatedCampaign
    }

    app.get("campaign", "userdata") { req async throws -> CampaignUserDataResponse in
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let selected = Set(campaign.userdataFiles)
        let available = try await CreatureLibraryStore.shared.availableLocalCreatureFiles(
            rulesetId: campaign.rulesetId,
            configuration: req.application.creatureLibraryConfiguration
        )
        var seen = Set<String>()
        let files = available.map { name -> CampaignUserDataFileSummary in
            seen.insert(name)
            return CampaignUserDataFileSummary(
                name: name,
                selected: selected.contains(name),
                missing: false
            )
        }
        let missingFiles = campaign.userdataFiles
            .filter { seen.contains($0) == false }
            .map { name in
                CampaignUserDataFileSummary(
                    name: name,
                    selected: true,
                    missing: true
                )
            }
        return CampaignUserDataResponse(
            rulesetId: campaign.rulesetId,
            files: files + missingFiles
        )
    }

    app.put("campaign", "userdata") { req async throws -> CampaignState in
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let input = try req.content.decode(CampaignUserDataUpdateInput.self)
        let updated = try await campaignStore.updateUserdataFiles(input.files)
        await CreatureLibraryStore.shared.invalidate(rulesetId: campaign.rulesetId)
        await publishCampaignUpdate(
            campaign: updated,
            userStore: userStore,
            eventHub: eventHub,
            event: "campaign-updated"
        )
        return updated
    }

    app.post("campaign", "userdata", "open-folders") { req async throws -> HTTPStatus in
        let (campaign, _) = try await requireRefereeSession(req, campaignStore: campaignStore)
        let rulesetsDirectory = AppPaths.webClientDirectory()
            .appendingPathComponent("rulesets", isDirectory: true)
        let userdataDirectory = AppPaths.userDataDirectory(
            rulesetId: campaign.rulesetId,
            application: req.application
        )
        try FileManager.default.createDirectory(
            at: userdataDirectory,
            withIntermediateDirectories: true
        )
        try DirectoryLauncher.launch(url: rulesetsDirectory)
        try DirectoryLauncher.launch(url: userdataDirectory)
        await logServerEvent("open-folders rulesets=\(rulesetsDirectory.path) userdata=\(userdataDirectory.path)")
        return .ok
    }

    app.get("campaign", "events") { req async throws -> Response in
        let response = Response(status: .ok)
        response.headers.replaceOrAdd(name: .contentType, value: "text/event-stream; charset=utf-8")
        response.headers.replaceOrAdd(name: .cacheControl, value: "no-cache, no-transform")
        response.headers.replaceOrAdd(name: .connection, value: "keep-alive")
        let acceptsEventStream = (req.headers.first(name: .accept) ?? "")
            .lowercased()
            .contains("text/event-stream")
        if acceptsEventStream {
            response.body = .init(managedAsyncStream: { writer in
                let messages = await activeCampaignEventHub.subscribe()
                let snapshot = await activeCampaignStreamSnapshot(campaignStore: campaignStore)
                try await writer.writeBuffer(
                    ByteBuffer(string: try serverSentEvent(event: "snapshot", payload: snapshot))
                )
                for await frame in makeServerSentEventStream(messages: messages) {
                    if Task.isCancelled {
                        break
                    }
                    switch frame {
                    case .heartbeat:
                        try await writer.writeBuffer(ByteBuffer(string: ": keepalive\n\n"))
                    case .value(let message):
                        try await writer.writeBuffer(
                            ByteBuffer(string: try serverSentEvent(event: message.event, payload: message.snapshot))
                        )
                    }
                }
            })
        } else {
            let snapshot = await activeCampaignStreamSnapshot(campaignStore: campaignStore)
            response.body = .init(string: try serverSentEvent(event: "snapshot", payload: snapshot))
        }
        return response
    }

    app.post("campaign") { req async throws -> CampaignState in
        let input = try req.content.decode(CampaignUpdateInput.self)
        logConnection(req, action: "update-campaign", identifier: input.name)
        let updated = try await campaignStore.update(
            name: input.name,
            rulesetId: input.rulesetId,
            claimTimeoutMinutes: input.claimTimeoutMinutes,
            isInviteOnly: input.isInviteOnly ?? false
        )
        try await userStore.configure(
            campaignName: updated.name,
            rulesetId: updated.rulesetId,
            on: req.application.db
        )
        if let activeCampaign = await campaignStore.activeCampaign(), activeCampaign.id == updated.id {
            await publishCampaignUpdate(campaign: activeCampaign, userStore: userStore, eventHub: eventHub)
            await publishActiveCampaignUpdate(campaignStore: campaignStore, eventHub: activeCampaignEventHub)
        }
        return updated
    }

    app.post("campaigns") { req async throws -> CampaignSummary in
        let input = try req.content.decode(CampaignUpdateInput.self)
        logConnection(req, action: "create-campaign", identifier: input.name)
        return try await campaignStore.createCampaign(
            name: input.name,
            rulesetId: input.rulesetId,
            claimTimeoutMinutes: input.claimTimeoutMinutes,
            isInviteOnly: input.isInviteOnly ?? false
        )
    }

    app.get("campaigns") { req async throws -> [CampaignSummary] in
        try await campaignStore.campaigns()
    }

    app.post("campaigns", ":campaignId", "invites") { req async throws -> CampaignInviteResponse in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let campaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let input = (try? req.content.decode(CampaignInviteCreateInput.self)) ?? CampaignInviteCreateInput()
        let campaign = try await requireInviteManager(req, campaignStore: campaignStore, campaignID: campaignID)
        let playerName = input.playerName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let authenticatedUser = try? await requireAuthenticatedUser(req)
        let refereeSession = authenticatedUser == nil ? try await currentPlayerSession(req) : nil
        guard authenticatedUser != nil || refereeSession != nil else {
            throw Abort(.unauthorized, reason: "Not signed in.")
        }
        let token = try await DatabasePersistence.createCampaignInvite(
            campaignID: campaign.id,
            createdByUserID: authenticatedUser?.id ?? UUID(uuidString: "00000000-0000-0000-0000-000000000000")!,
            invitedPlayerName: playerName?.isEmpty == false ? playerName : nil,
            on: req.db
        )
        return CampaignInviteResponse(
            campaign: campaign,
            token: token,
            playerName: playerName?.isEmpty == false ? playerName : nil
        )
    }

    app.post("campaigns", ":campaignId", "members") { req async throws -> CampaignMemberSummary in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let campaignID = UUID(uuidString: campaignIDString) else {
            throw Abort(.badRequest)
        }
        let input = try req.content.decode(CampaignMemberCreateInput.self)
        _ = try await requireInviteManager(req, campaignStore: campaignStore, campaignID: campaignID)
        let member = try await DatabasePersistence.ensureCampaignMember(
            campaignID: campaignID,
            playerName: input.playerName,
            role: "player",
            on: req.db
        )
        return member
    }

    app.delete("campaigns", ":campaignId", "members", ":membershipId") { req async throws -> HTTPStatus in
        guard let campaignIDString = req.parameters.get("campaignId"),
              let campaignID = UUID(uuidString: campaignIDString),
              let membershipIDString = req.parameters.get("membershipId"),
              let membershipID = UUID(uuidString: membershipIDString) else {
            throw Abort(.badRequest)
        }
        let campaign = try await requireInviteManager(req, campaignStore: campaignStore, campaignID: campaignID)
        guard let playerID = try await DatabasePersistence.deleteCampaignMember(
            membershipID: membershipID,
            campaignID: campaignID,
            on: req.db
        ) else {
            throw Abort(.notFound, reason: "Campaign member not found.")
        }
        await userStore.releaseClaims(for: playerID, campaignName: campaign.name)
        let refereeSessionIDs = try await DatabasePersistence.loadCampaignRefereeSessionIDs(
            campaignID: campaignID,
            on: req.db
        )
        await userStore.setCampaignRefereeSessionIDs(
            campaignName: campaign.name,
            refereeSessionIDs: refereeSessionIDs
        )
        if let activeCampaign = await campaignStore.activeCampaign(), activeCampaign.id == campaign.id {
            await publishCampaignUpdate(campaign: activeCampaign, userStore: userStore, eventHub: eventHub)
        }
        return .noContent
    }

    app.post("invites", ":token", "accept") { req async throws -> CampaignSummary in
        guard let token = req.parameters.get("token") else {
            throw Abort(.badRequest)
        }
        let session = try await requirePlayerSession(req)
        guard let campaignID = try await DatabasePersistence.acceptCampaignInvite(
            token: token,
            playerID: session.id,
            playerLoginName: session.loginName,
            playerDisplayName: session.displayName,
            on: req.db
        ) else {
            throw Abort(.notFound, reason: "Invite not found.")
        }
        let campaigns = try await campaignStore.campaigns()
        guard let campaign = campaigns.first(where: { $0.id == campaignID }) else {
            throw Abort(.notFound, reason: "Campaign not found.")
        }
        return campaign
    }

    app.patch("campaigns", ":campaignId") { req async throws -> CampaignSummary in
        guard let idString = req.parameters.get("campaignId"),
              let campaignID = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let input = try req.content.decode(CampaignUpdateInput.self)
        logConnection(req, action: "edit-campaign", identifier: campaignID.uuidString)
        let previousActiveCampaign = await campaignStore.activeCampaign()
        let updated = try await campaignStore.updateCampaign(
            id: campaignID,
            name: input.name,
            rulesetId: input.rulesetId,
            claimTimeoutMinutes: input.claimTimeoutMinutes,
            isInviteOnly: input.isInviteOnly
        )
        if previousActiveCampaign?.id == campaignID {
            await userStore.rebindActiveCampaign(
                from: previousActiveCampaign?.name ?? updated.name,
                to: updated.name,
                rulesetId: updated.rulesetId
            )
        }
        if let refereeSessionIDs = input.refereeSessionIds {
            try await DatabasePersistence.setCampaignRefereeSessionIDs(
                campaignID: campaignID,
                refereeSessionIDs: refereeSessionIDs,
                on: req.db
            )
            await userStore.setCampaignRefereeSessionIDs(
                campaignName: updated.name,
                refereeSessionIDs: Set(refereeSessionIDs)
            )
        }
        if let activeCampaign = await campaignStore.activeCampaign(), activeCampaign.id == updated.id {
            await publishCampaignUpdate(campaign: activeCampaign, userStore: userStore, eventHub: eventHub)
        }
        return updated
    }

    app.post("campaigns", ":campaignId", "select") { req async throws -> CampaignState in
        guard let idString = req.parameters.get("campaignId"),
              let campaignID = UUID(uuidString: idString) else {
            throw Abort(.badRequest)
        }
        let user = try await requireServerOwnerSession(req)
        logConnection(req, action: "select-campaign", identifier: "\(user.email) \(campaignID.uuidString)")
        let previousActiveCampaign = await campaignStore.activeCampaign()
        let selected = try await campaignStore.selectCampaign(id: campaignID)
        try await userStore.configure(
            campaignName: selected.name,
            rulesetId: selected.rulesetId,
            on: req.application.db
        )
        if let previousActiveCampaign, previousActiveCampaign.id != selected.id {
            await publishCampaignUpdate(campaign: previousActiveCampaign, userStore: userStore, eventHub: eventHub)
        }
        await publishCampaignUpdate(
            campaign: selected,
            userStore: userStore,
            eventHub: eventHub,
            event: "campaign-updated"
        )
        await publishActiveCampaignUpdate(campaignStore: campaignStore, eventHub: activeCampaignEventHub)
        return selected
    }

    app.get("rulesets") { req async throws -> [RulesetSummary] in
        return RuleSetLibraryLoader.availableRulesets()
    }
}
