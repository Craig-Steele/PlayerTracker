import Foundation
import Observation
import Security

@MainActor
@Observable
final class PlayerAppModel {
    enum LaunchPhase {
        case connection
        case playerName
        case campaign
    }

    var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: Self.serverURLKey) }
    }
    var playerName: String {
        didSet { UserDefaults.standard.set(playerName, forKey: Self.playerNameKey) }
    }
    var ownerId: UUID {
        didSet { UserDefaults.standard.set(ownerId.uuidString, forKey: Self.ownerIdKey) }
    }
    var showPlayerNames: Bool {
        didSet { UserDefaults.standard.set(showPlayerNames, forKey: Self.showPlayerNamesKey) }
    }
    var showCharacterConditions: Bool {
        didSet { UserDefaults.standard.set(showCharacterConditions, forKey: Self.showCharacterConditionsKey) }
    }
    var playerSessionStatusMessage = "Not joined"
    var playerSession: PlayerSessionDTO?

    var campaign: CampaignStateDTO?
    var ruleSet: RuleSetLibraryDTO?
    var gameState: GameStateDTO?
    var myCharacters: [PlayerViewDTO] = []
    var statusMessage = "Not connected"
    var isLoading = false
    var isCompletingTurn = false
    var lastError: String?
    var hasServerConnection = false

    private var refreshTask: Task<Void, Never>?
    private var campaignStreamTask: Task<Void, Never>?
    private var campaignStreamCampaignID: UUID?

    private static let serverURLKey = "ios.serverURL"
    private static let playerNameKey = "ios.playerName"
    private static let ownerIdKey = "ios.ownerId"
    private static let showPlayerNamesKey = "ios.showPlayerNames"
    private static let showCharacterConditionsKey = "ios.showCharacterConditions"
    private let playerSessionStore = PlayerSessionStore()
    private var playerSessionToken: String?

    init() {
        self.serverURLString = UserDefaults.standard.string(forKey: Self.serverURLKey) ?? "http://localhost:8080"
        self.playerName = UserDefaults.standard.string(forKey: Self.playerNameKey) ?? ""
        if let raw = UserDefaults.standard.string(forKey: Self.ownerIdKey), let existing = UUID(uuidString: raw) {
            self.ownerId = existing
        } else {
            let fresh = UUID()
            self.ownerId = fresh
            UserDefaults.standard.set(fresh.uuidString, forKey: Self.ownerIdKey)
        }
        self.showPlayerNames = UserDefaults.standard.object(forKey: Self.showPlayerNamesKey) as? Bool ?? true
        self.showCharacterConditions = UserDefaults.standard.object(forKey: Self.showCharacterConditionsKey) as? Bool ?? true
        self.playerSessionToken = try? playerSessionStore.loadToken()
        if playerSessionToken != nil {
            playerSessionStatusMessage = "Restoring player session..."
        }
    }

    func startPolling() {
        // The web client now relies on server push updates rather than a timer.
        // Keep this as a no-op until the iOS client has the same SSE path.
    }

    func stopPolling() {
        refreshTask?.cancel()
        refreshTask = nil
    }

    func startCampaignStream() {
        guard let campaignID = campaign?.id, let playerSessionToken, !playerSessionToken.isEmpty else {
            stopCampaignStream()
            return
        }
        if campaignStreamTask != nil, campaignStreamCampaignID == campaignID {
            return
        }

        stopCampaignStream()
        campaignStreamCampaignID = campaignID
        campaignStreamTask = Task { [weak self] in
            guard let self else { return }
            await self.runCampaignStream(campaignID: campaignID)
        }
    }

    func stopCampaignStream() {
        campaignStreamTask?.cancel()
        campaignStreamTask = nil
        campaignStreamCampaignID = nil
    }

    func connect() async {
        await restorePlayerSession()
    }

    var hasPlayerName: Bool {
        !playerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var normalizedServerURL: String {
        serverURLString.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var currentPlayerID: UUID {
        playerSession?.player.id ?? ownerId
    }

    var currentPlayerDisplayName: String {
        let sessionName = playerSession?.player.displayName.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !sessionName.isEmpty {
            return sessionName
        }
        let localName = playerName.trimmingCharacters(in: .whitespacesAndNewlines)
        return localName.isEmpty ? "Not set" : localName
    }

    var isRefereeSession: Bool {
        playerSession?.player.isReferee == true
    }

    var launchPhase: LaunchPhase {
        if !hasServerConnection {
            return .connection
        }
        if playerSession == nil || campaign == nil {
            return .playerName
        }
        return .campaign
    }

    func refreshAll(showStatus: Bool) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            var resolvedCampaign: CampaignStateDTO?
            var resolvedRuleSet: RuleSetLibraryDTO?
            var resolvedPlayerSession: PlayerSessionDTO?
            var connectionError: Error?

            do {
                resolvedRuleSet = try await client.fetchConditionLibrary()
                hasServerConnection = true
            } catch {
                connectionError = error
            }

            do {
                resolvedCampaign = try await client.fetchCampaign()
                hasServerConnection = true
            } catch {
                connectionError = connectionError ?? error
            }

            if !hasServerConnection {
                throw connectionError ?? APIClientError.invalidResponse
            }

            if playerSessionToken != nil {
                resolvedPlayerSession = try? await client.fetchPlayerSession()
                if let resolvedPlayerSession {
                    self.playerSession = resolvedPlayerSession
                    self.ownerId = resolvedPlayerSession.player.id
                    self.playerName = resolvedPlayerSession.player.displayName
                    self.playerSessionStatusMessage = resolvedPlayerSession.player.isReferee
                        ? "Joined as referee \(resolvedPlayerSession.player.displayName)"
                        : "Joined as \(resolvedPlayerSession.player.displayName)"
                    self.lastError = nil
                } else {
                    await clearPlayerSession(reason: "Saved player session expired. Please rejoin.")
                }
            } else {
                self.playerSession = nil
                self.playerSessionStatusMessage = "Not joined"
            }

            let resolvedState: GameStateDTO?
            if resolvedCampaign != nil && (resolvedPlayerSession != nil || playerSessionToken != nil) {
                resolvedState = try? await client.fetchState()
            } else {
                resolvedState = nil
            }

            let characters = (resolvedCampaign != nil && (resolvedPlayerSession != nil || playerSessionToken != nil))
                ? try await client.fetchCharacters(ownerId: currentPlayerID, campaignName: resolvedCampaign?.name)
                : []

            self.campaign = resolvedCampaign
            self.ruleSet = resolvedRuleSet
            self.gameState = resolvedState
            self.myCharacters = characters
            self.lastError = nil
            if showStatus {
                self.statusMessage = resolvedCampaign == nil
                    ? "Connected to \(client.baseURL.absoluteString)"
                    : "Connected to \(client.baseURL.absoluteString)"
            }
            syncCampaignStream()
        } catch {
            hasServerConnection = false
            self.lastError = error.localizedDescription
            self.campaign = nil
            self.ruleSet = nil
            self.gameState = nil
            self.myCharacters = []
            if showStatus || self.campaign == nil {
                self.statusMessage = error.localizedDescription
            }
        }
    }

    func restorePlayerSession() async {
        await refreshAll(showStatus: true)
    }

    func joinOrRejoinPlayerSession() async {
        await savePlayerName()
    }

    func signOut() async {
        do {
            if playerSessionToken != nil {
                let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
                try await client.logoutPlayerSession()
            }
        } catch {
            lastError = error.localizedDescription
        }
        await clearPlayerSession(reason: "Signed out.")
        playerName = ""
        statusMessage = "Signed out."
        stopPolling()
        stopCampaignStream()
    }

    func savePlayerName() async {
        guard !playerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            statusMessage = "Enter a player name."
            return
        }
        guard campaign != nil else {
            statusMessage = "Connect to a server first."
            return
        }

        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            let trimmedName = playerName.trimmingCharacters(in: .whitespacesAndNewlines)
            let result: PlayerSessionResult
            let joinedSession = playerSessionToken == nil
            if playerSessionToken == nil {
                result = try await client.joinPlayerSession(displayName: trimmedName)
                statusMessage = "Player joined."
            } else {
                result = try await client.renamePlayerSession(displayName: trimmedName)
                statusMessage = "Player name saved."
            }
            try playerSessionStore.saveToken(result.sessionToken)
            playerSessionToken = result.sessionToken
            playerSession = result.session
            ownerId = result.session.player.id
            playerSessionStatusMessage = result.session.player.isReferee
                ? "Joined as referee \(result.session.player.displayName)"
                : "Joined as \(result.session.player.displayName)"
            if joinedSession {
                statusMessage = "Player joined."
            }
            lastError = nil
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func saveCharacter(_ draft: CharacterDraft) async {
        guard let campaign else {
            statusMessage = "Connect to a server first."
            return
        }
        let trimmedOwnerName = playerName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedOwnerName.isEmpty else {
            statusMessage = "Save a player name before creating characters."
            return
        }
        let trimmedName = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            statusMessage = "Character name is required."
            return
        }
        let trimmedBonus = draft.initiativeBonus.trimmingCharacters(in: .whitespacesAndNewlines)
        let initiativeBonus = trimmedBonus.isEmpty ? 0 : Int(trimmedBonus)
        guard let initiativeBonus else {
            statusMessage = "Initiative bonus must be a valid number."
            return
        }

        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            let payload = CharacterInputDTO(
                id: draft.id,
                campaignName: campaign.name,
                ownerId: currentPlayerID,
                ownerName: trimmedOwnerName,
                name: trimmedName,
                initiative: draft.id.flatMap { existingCharacter(with: $0)?.initiative },
                stats: draft.buildStatsPayload(allowNegativeHealth: ruleSet?.allowNegativeHealth ?? false),
                currency: draft.id.flatMap { existingCharacter(with: $0)?.currency },
                revealStats: draft.revealStats,
                autoSkipTurn: draft.autoSkipTurn,
                useAppInitiativeRoll: draft.useAppInitiativeRoll,
                initiativeBonus: initiativeBonus,
                isHidden: false,
                revealOnTurn: false,
                conditions: Array(draft.selectedConditions).sorted()
            )
            _ = try await client.upsertCharacter(payload, campaignID: campaign.id)
            statusMessage = draft.id == nil ? "Character added." : "Character saved."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func deleteCharacter(id: UUID) async {
        guard let campaign else {
            statusMessage = "Connect to a server first."
            return
        }
        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            try await client.deleteCharacter(id: id, campaignID: campaign.id)
            statusMessage = "Character deleted."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func claimCharacter(_ character: PlayerViewDTO) async {
        guard let campaign else {
            statusMessage = "Connect to a server first."
            return
        }
        guard character.canBeClaimed else {
            statusMessage = "Character cannot be claimed."
            return
        }
        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            _ = try await client.claimCharacter(id: character.id, campaignID: campaign.id)
            statusMessage = "Character claimed."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func releaseCharacter(_ character: PlayerViewDTO) async {
        guard let campaign else {
            statusMessage = "Connect to a server first."
            return
        }
        guard character.isClaimed(by: currentPlayerID) else {
            statusMessage = "Character is not claimed by you."
            return
        }
        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            _ = try await client.releaseCharacter(id: character.id, campaignID: campaign.id)
            statusMessage = "Character released."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func completeTurn() async {
        guard !isCompletingTurn else { return }
        isCompletingTurn = true
        defer { isCompletingTurn = false }
        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            _ = try await client.completeTurn()
            statusMessage = "Turn advanced."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func rollInitiativeForMyCharacters() async {
        guard gameState?.encounterState == .active else {
            statusMessage = "Start the encounter first."
            return
        }

        let charactersToRoll = myCharacters.filter { $0.initiative == nil }
        guard !charactersToRoll.isEmpty else {
            statusMessage = "No initiatives need rolling."
            return
        }

        var rolledCount = 0
        var skippedCount = 0
        for character in charactersToRoll {
            guard character.useAppInitiativeRoll else {
                skippedCount += 1
                continue
            }
            let bonus = character.initiativeBonus
            let rolled = rollInitiative(standardDie: ruleSet?.standardDie, bonus: bonus)
            guard let rolled else {
                statusMessage = "Unable to roll initiative."
                return
            }
            await setInitiative(for: character, initiative: rolled)
            rolledCount += 1
        }

        if skippedCount > 0 && rolledCount == 0 {
            statusMessage = "Use each character's initiative editor to finish rolling."
        } else if skippedCount > 0 {
            statusMessage = "Rolled initiative for \(rolledCount) character\(rolledCount == 1 ? "" : "s")."
        }
    }

    func adjustStat(for character: PlayerViewDTO, statKey: String, delta: Int) async {
        guard campaign != nil else {
            statusMessage = "Connect to a server first."
            return
        }

        var draft = CharacterDraft(player: character, ruleSet: ruleSet)
        draft.adjustStat(
            named: statKey,
            delta: delta,
            allowNegativeHealth: ruleSet?.allowNegativeHealth ?? false
        )
        await saveCharacter(draft)
    }

    func saveConditions(for draft: CharacterDraft) async {
        await saveCharacter(draft)
    }

    func setInitiative(for character: PlayerViewDTO, initiative: Double?) async {
        guard let campaign else {
            statusMessage = "Connect to a server first."
            return
        }
        do {
            let client = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
            let payload = CharacterInputDTO(
                id: character.id,
                campaignName: campaign.name,
                ownerId: currentPlayerID,
                ownerName: character.ownerName,
                name: character.name,
                initiative: initiative,
                stats: character.stats,
                currency: character.currency,
                revealStats: character.revealStats,
                autoSkipTurn: character.autoSkipTurn,
                useAppInitiativeRoll: character.useAppInitiativeRoll,
                initiativeBonus: character.initiativeBonus,
                isHidden: character.isHidden,
                revealOnTurn: character.revealOnTurn,
                conditions: character.conditions
            )
            _ = try await client.upsertCharacter(payload, campaignID: campaign.id)
            statusMessage = initiative == nil ? "Initiative cleared." : "Initiative set."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func clearInitiative(for character: PlayerViewDTO) async {
        await setInitiative(for: character, initiative: nil)
    }

    var isMyTurn: Bool {
        guard let gameState else { return false }
        return gameState.players.contains(where: { $0.ownerId == currentPlayerID && $0.id == gameState.currentTurnId })
    }

    func isCurrentTurn(for character: PlayerViewDTO) -> Bool {
        gameState?.currentTurnId == character.id
    }

    private func existingCharacter(with id: UUID) -> PlayerViewDTO? {
        myCharacters.first(where: { $0.id == id })
    }

    private func clearPlayerSession(reason: String) async {
        playerSessionToken = nil
        playerSession = nil
        gameState = nil
        myCharacters = []
        playerSessionStatusMessage = reason
        do {
            try playerSessionStore.clearToken()
        } catch {
            lastError = error.localizedDescription
        }
        stopPolling()
        stopCampaignStream()
    }

    private func syncCampaignStream() {
        guard let campaignID = campaign?.id,
              let playerSessionToken,
              !playerSessionToken.isEmpty else {
            stopCampaignStream()
            return
        }
        if campaignStreamTask != nil, campaignStreamCampaignID == campaignID {
            return
        }
        startCampaignStream()
    }

    private func runCampaignStream(campaignID: UUID) async {
        while !Task.isCancelled {
            do {
                let streamClient = try APIClient(baseURLString: serverURLString, playerSessionToken: playerSessionToken)
                let campaignStream = CampaignEventStreamClient(
                    baseURL: streamClient.baseURL,
                    playerSessionToken: playerSessionToken ?? ""
                )
                try await campaignStream.listen(campaignID: campaignID) { [weak self] _ in
                    guard let self else { return }
                    await self.refreshAll(showStatus: false)
                }
                if Task.isCancelled {
                    return
                }
            } catch {
                if Task.isCancelled {
                    return
                }
                if campaign?.id != campaignID || playerSessionToken == nil {
                    return
                }
                try? await Task.sleep(for: .seconds(2))
            }
        }
    }
}

private final class PlayerSessionStore {
    private let service = "com.csteele.PlayerTrackeriOS.player-session"
    private let account = "roll4_player_session"

    func loadToken() throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw PlayerSessionStoreError.keychain(status)
        }
        guard let data = result as? Data, let token = String(data: data, encoding: .utf8), !token.isEmpty else {
            return nil
        }
        return token
    }

    func saveToken(_ token: String) throws {
        let data = Data(token.utf8)
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let updateAttributes: [String: Any] = [
            kSecValueData as String: data
        ]

        let updateStatus = SecItemUpdate(baseQuery as CFDictionary, updateAttributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        if updateStatus != errSecItemNotFound {
            throw PlayerSessionStoreError.keychain(updateStatus)
        }

        var addQuery = baseQuery
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw PlayerSessionStoreError.keychain(addStatus)
        }
    }

    func clearToken() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw PlayerSessionStoreError.keychain(status)
        }
    }
}

private enum PlayerSessionStoreError: LocalizedError {
    case keychain(OSStatus)

    var errorDescription: String? {
        switch self {
        case .keychain(let status):
            return "Keychain error (\(status))."
        }
    }
}
