import Foundation

public actor GameSession {
    public struct CharacterInput: Codable, Sendable, Equatable {
        public let id: UUID?
        public let ownerID: UUID?
        public let ownerName: String
        public let name: String
        public let initiative: Int
        public let stats: [StatEntry]?
        public let revealStats: Bool?
        public let isHidden: Bool?
        public let revealOnTurn: Bool?
        public let conditions: [String]?

        public init(
            id: UUID? = nil,
            ownerID: UUID? = nil,
            ownerName: String,
            name: String,
            initiative: Int,
            stats: [StatEntry]? = nil,
            revealStats: Bool? = nil,
            isHidden: Bool? = nil,
            revealOnTurn: Bool? = nil,
            conditions: [String]? = nil
        ) {
            self.id = id
            self.ownerID = ownerID
            self.ownerName = ownerName
            self.name = name
            self.initiative = initiative
            self.stats = stats
            self.revealStats = revealStats
            self.isHidden = isHidden
            self.revealOnTurn = revealOnTurn
            self.conditions = conditions
        }
    }

    private struct TurnState {
        var roundIndex: Int = 1
        var turnIndex: Int = 0
    }

    private var campaignName: String
    private var ruleset: RuleSet
    private var encounterState: EncounterState
    private var characters: [UUID: CharacterRecord]
    private var turnState: TurnState

    public init(
        campaignName: String = "Campaign",
        ruleset: RuleSet = RuleSet(id: "none", label: ""),
        encounterState: EncounterState = .new,
        characters: [UUID: CharacterRecord] = [:]
    ) {
        self.campaignName = campaignName
        self.ruleset = ruleset
        self.encounterState = encounterState
        self.characters = characters
        self.turnState = TurnState()
    }

    public func campaign() -> CampaignState {
        CampaignState(
            name: campaignName,
            rulesetID: ruleset.id,
            rulesetLabel: ruleset.label,
            encounterState: encounterState
        )
    }

    public func updateCampaign(name: String, ruleset: RuleSet) {
        campaignName = name
        self.ruleset = ruleset
    }

    public func currentRuleset() -> RuleSet {
        ruleset
    }

    public func upsertCharacter(_ input: CharacterInput) -> PlayerView {
        let resolvedID = input.id ?? UUID()
        let resolvedOwnerID = input.ownerID ?? characters[resolvedID]?.ownerID ?? UUID()

        var state = characters[resolvedID] ?? CharacterRecord(
            id: resolvedID,
            campaignName: campaignName,
            ownerID: resolvedOwnerID,
            ownerName: input.ownerName,
            characterName: input.name,
            initiative: input.initiative
        )

        state.campaignName = campaignName
        state.ownerID = resolvedOwnerID
        state.ownerName = input.ownerName
        state.characterName = input.name
        state.initiative = input.initiative
        if let stats = input.stats {
            state.stats = Dictionary(uniqueKeysWithValues: stats.map { ($0.key, $0) })
        }
        if let revealStats = input.revealStats {
            state.revealStats = revealStats
        }
        if let isHidden = input.isHidden {
            state.isHidden = isHidden
        }
        if let revealOnTurn = input.revealOnTurn {
            state.revealOnTurn = revealOnTurn
        }
        if let conditions = input.conditions {
            state.conditions = Set(conditions)
        }

        if !isReferee(ownerName: state.ownerName) {
            state.isHidden = false
            state.revealOnTurn = false
        }

        characters[resolvedID] = state
        return view(from: state)
    }

    public func characters(for ownerID: UUID) -> [PlayerView] {
        characters.values
            .filter { $0.campaignName == campaignName && $0.ownerID == ownerID }
            .map(view(from:))
            .sorted { $0.name < $1.name }
    }

    public func renameOwner(ownerID: UUID, to newName: String) {
        for (id, var record) in characters where record.campaignName == campaignName && record.ownerID == ownerID {
            record.ownerName = newName
            if !isReferee(ownerName: newName) {
                record.isHidden = false
                record.revealOnTurn = false
            }
            characters[id] = record
        }
    }

    public func renameCharacter(id: UUID, to newName: String) {
        guard var record = characters[id] else { return }
        record.characterName = newName
        characters[id] = record
    }

    public func deleteCharacter(id: UUID) -> Bool {
        characters.removeValue(forKey: id) != nil
    }

    public func setEncounterState(_ state: EncounterState) {
        encounterState = state
    }

    public func resetForNewEncounter() {
        let entries = characters.filter { $0.value.campaignName == campaignName }
        var idsToRemove: [UUID] = []

        for (id, var record) in entries {
            if isReferee(ownerName: record.ownerName) {
                idsToRemove.append(id)
                continue
            }
            record.initiative = 0
            characters[id] = record
        }

        for id in idsToRemove {
            characters.removeValue(forKey: id)
        }

        turnState = TurnState()
        encounterState = .new
    }

    public func startEncounter() -> GameState {
        turnState = TurnState()
        encounterState = .active
        return state(for: .referee)
    }

    public func suspendEncounter() -> GameState {
        encounterState = .suspended
        return state(for: .referee)
    }

    public func setCurrentTurn(characterID: UUID) -> GameState {
        guard var target = characters[characterID], target.campaignName == campaignName else {
            return state(for: .referee)
        }

        if target.isHidden {
            target.isHidden = false
            target.revealOnTurn = false
            characters[target.id] = target
        }

        let candidates = sortedRecords(includeHidden: false, includeRevealOnTurn: true)
        if let index = candidates.firstIndex(where: { $0.id == target.id }) {
            turnState.turnIndex = index
        }

        return state(for: .referee)
    }

    public func advanceTurn(for role: ViewerRole = .player) -> GameState {
        let turnCandidates = sortedRecords(includeHidden: false, includeRevealOnTurn: true)
        var players = sortedViews(includeHidden: role == .referee)

        guard !turnCandidates.isEmpty else {
            turnState = TurnState()
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnID: nil,
                currentTurnName: nil,
                players: players
            )
        }

        if turnState.turnIndex + 1 >= turnCandidates.count {
            turnState.roundIndex += 1
            turnState.turnIndex = 0
        } else {
            turnState.turnIndex += 1
        }

        var currentPlayer = turnCandidates[turnState.turnIndex]
        if currentPlayer.isHidden && currentPlayer.revealOnTurn {
            var updated = currentPlayer
            updated.isHidden = false
            updated.revealOnTurn = false
            characters[updated.id] = updated
            currentPlayer = updated
            players = sortedViews(includeHidden: role == .referee)
        }

        let currentView = view(from: currentPlayer)
        return GameState(
            round: turnState.roundIndex,
            encounterState: encounterState,
            currentTurnID: currentView.id,
            currentTurnName: currentView.name,
            players: players
        )
    }

    public func state(for role: ViewerRole) -> GameState {
        let includeHidden = role == .referee
        var players = sortedViews(includeHidden: includeHidden)
        let turnCandidates = sortedRecords(includeHidden: false, includeRevealOnTurn: true)

        if encounterState == .new {
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnID: nil,
                currentTurnName: nil,
                players: players
            )
        }

        guard !turnCandidates.isEmpty else {
            turnState = TurnState()
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnID: nil,
                currentTurnName: nil,
                players: players
            )
        }

        if turnState.turnIndex >= turnCandidates.count {
            turnState.turnIndex = 0
        }

        var currentPlayer = turnCandidates[turnState.turnIndex]
        if encounterState == .active && currentPlayer.isHidden && currentPlayer.revealOnTurn {
            var updated = currentPlayer
            updated.isHidden = false
            updated.revealOnTurn = false
            characters[updated.id] = updated
            currentPlayer = updated
            players = sortedViews(includeHidden: includeHidden)
        }

        let currentView = view(from: currentPlayer)
        return GameState(
            round: turnState.roundIndex,
            encounterState: encounterState,
            currentTurnID: currentView.id,
            currentTurnName: currentView.name,
            players: players
        )
    }

    private func isReferee(ownerName: String) -> Bool {
        ownerName.caseInsensitiveCompare("Referee") == .orderedSame
    }

    private func sortedRecords(includeHidden: Bool, includeRevealOnTurn: Bool) -> [CharacterRecord] {
        characters.values
            .filter { record in
                guard record.campaignName == campaignName else { return false }
                if includeHidden {
                    return true
                }
                if record.isHidden {
                    return includeRevealOnTurn && record.revealOnTurn
                }
                return true
            }
            .sorted { a, b in
                if a.initiative == b.initiative {
                    if a.ownerName == b.ownerName {
                        return a.characterName < b.characterName
                    }
                    return a.ownerName < b.ownerName
                }
                return a.initiative > b.initiative
            }
    }

    private func sortedViews(includeHidden: Bool) -> [PlayerView] {
        sortedRecords(includeHidden: includeHidden, includeRevealOnTurn: false)
            .map(view(from:))
    }

    private func view(from record: CharacterRecord) -> PlayerView {
        PlayerView(
            id: record.id,
            ownerID: record.ownerID,
            ownerName: record.ownerName,
            name: record.characterName,
            initiative: record.initiative,
            stats: record.stats.values.sorted { $0.key < $1.key },
            revealStats: record.revealStats,
            isHidden: record.isHidden,
            revealOnTurn: record.revealOnTurn,
            conditions: Array(record.conditions).sorted()
        )
    }
}
