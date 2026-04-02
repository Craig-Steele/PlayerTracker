import Foundation
import Observation

@MainActor
@Observable
final class PlayerAppModel {
    var serverURLString: String {
        didSet { UserDefaults.standard.set(serverURLString, forKey: Self.serverURLKey) }
    }
    var playerName: String {
        didSet { UserDefaults.standard.set(playerName, forKey: Self.playerNameKey) }
    }
    var ownerId: UUID {
        didSet { UserDefaults.standard.set(ownerId.uuidString, forKey: Self.ownerIdKey) }
    }

    var campaign: CampaignStateDTO?
    var ruleSet: RuleSetLibraryDTO?
    var gameState: GameStateDTO?
    var myCharacters: [PlayerViewDTO] = []
    var statusMessage = "Not connected"
    var isLoading = false
    var lastError: String?

    private var refreshTask: Task<Void, Never>?

    private static let serverURLKey = "ios.serverURL"
    private static let playerNameKey = "ios.playerName"
    private static let ownerIdKey = "ios.ownerId"

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
    }

    func startPolling() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                await self.refreshAll(showStatus: false)
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    func stopPolling() {
        refreshTask?.cancel()
        refreshTask = nil
    }

    func connect() async {
        await refreshAll(showStatus: true)
        startPolling()
    }

    var hasPlayerName: Bool {
        !playerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var normalizedServerURL: String {
        serverURLString.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func refreshAll(showStatus: Bool) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let client = try APIClient(baseURLString: serverURLString)
            async let campaign = client.fetchCampaign()
            async let ruleSet = client.fetchConditionLibrary()
            async let state = client.fetchState()
            let resolvedCampaign = try await campaign
            let resolvedRuleSet = try await ruleSet
            let resolvedState = try await state
            let characters = try await client.fetchCharacters(ownerId: ownerId, campaignName: resolvedCampaign.name)

            self.campaign = resolvedCampaign
            self.ruleSet = resolvedRuleSet
            self.gameState = resolvedState
            self.myCharacters = characters
            self.lastError = nil
            if showStatus {
                self.statusMessage = "Connected to \(client.baseURL.absoluteString)"
            }
        } catch {
            self.lastError = error.localizedDescription
            if showStatus || self.campaign == nil {
                self.statusMessage = error.localizedDescription
            }
        }
    }

    func savePlayerName() async {
        guard !playerName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            statusMessage = "Enter a player name."
            return
        }
        do {
            let client = try APIClient(baseURLString: serverURLString)
            try await client.renameOwner(ownerId: ownerId, name: playerName.trimmingCharacters(in: .whitespacesAndNewlines))
            statusMessage = "Player name saved."
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
        guard !trimmedName.isEmpty, let initiative = Int(draft.initiative) else {
            statusMessage = "Character name and initiative are required."
            return
        }

        do {
            let client = try APIClient(baseURLString: serverURLString)
            let payload = CharacterInputDTO(
                id: draft.id,
                campaignName: campaign.name,
                ownerId: ownerId,
                ownerName: trimmedOwnerName,
                name: trimmedName,
                initiative: initiative,
                stats: draft.buildStatsPayload(allowNegativeHealth: ruleSet?.allowNegativeHealth ?? false),
                revealStats: draft.revealStats,
                autoSkipTurn: draft.autoSkipTurn,
                isHidden: false,
                revealOnTurn: false,
                conditions: Array(draft.selectedConditions).sorted()
            )
            _ = try await client.upsertCharacter(payload)
            statusMessage = draft.id == nil ? "Character added." : "Character saved."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func deleteCharacter(id: UUID) async {
        do {
            let client = try APIClient(baseURLString: serverURLString)
            try await client.deleteCharacter(id: id)
            statusMessage = "Character deleted."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    func completeTurn() async {
        do {
            let client = try APIClient(baseURLString: serverURLString)
            _ = try await client.completeTurn()
            statusMessage = "Turn advanced."
            await refreshAll(showStatus: false)
        } catch {
            statusMessage = error.localizedDescription
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

    var isMyTurn: Bool {
        guard let gameState else { return false }
        return gameState.players.contains(where: { $0.ownerId == ownerId && $0.id == gameState.currentTurnId })
    }

    func isCurrentTurn(for character: PlayerViewDTO) -> Bool {
        gameState?.currentTurnId == character.id
    }
}
