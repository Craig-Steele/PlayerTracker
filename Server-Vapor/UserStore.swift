import Foundation

// Concurrency-safe store for character and turn state.
actor UserStore {
    private var storage: [UUID: CharacterState] = [:]
    private var campaignTurns: [String: TurnState] = [:]

    private struct TurnState {
        var roundIndex: Int
        var turnIndex: Int
    }

    private func parseStandardDie(_ spec: String?) -> (count: Int, sides: Int)? {
        guard let spec,
              let match = spec.trimmingCharacters(in: .whitespacesAndNewlines)
                .wholeMatch(of: /(\d+)[dD](\d+)/) else {
            return nil
        }
        guard let count = Int(match.output.1),
              let sides = Int(match.output.2),
              count > 0,
              sides > 0 else {
            return nil
        }
        return (count, sides)
    }

    func autoRollUnsetInitiativeForReferee(campaignName: String, standardDie: String?) {
        guard let die = parseStandardDie(standardDie) else { return }
        for (id, var state) in storage {
            guard state.campaignName == campaignName else { continue }
            guard state.ownerName.caseInsensitiveCompare("Referee") == .orderedSame else { continue }
            guard state.initiative == nil else { continue }
            guard state.useAppInitiativeRoll else { continue }
            let roll = (0..<die.count).reduce(0) { partialResult, _ in
                partialResult + Int.random(in: 1...die.sides)
            }
            state.initiative = Double(roll + state.initiativeBonus)
            storage[id] = state
        }
    }

    func upsertCharacter(
        id: UUID?,
        campaignName: String,
        ownerId: UUID,
        ownerName: String,
        characterName: String,
        initiative: Double?,
        stats: [StatEntry]?,
        revealStats: Bool?,
        autoSkipTurn: Bool?,
        useAppInitiativeRoll: Bool?,
        initiativeBonus: Int?,
        isHidden: Bool?,
        revealOnTurn: Bool?,
        conditions: Set<String>?
    ) -> PlayerView {
        let resolvedId = id ?? UUID()
        var state = storage[resolvedId] ?? CharacterState(
            id: resolvedId,
            campaignName: campaignName,
            ownerId: ownerId,
            ownerName: ownerName,
            characterName: characterName,
            initiative: initiative,
            stats: stats.map { Dictionary(uniqueKeysWithValues: $0.map { ($0.key, $0) }) } ?? [:],
            revealStats: revealStats ?? false,
            autoSkipTurn: autoSkipTurn ?? false,
            useAppInitiativeRoll: useAppInitiativeRoll ?? true,
            initiativeBonus: initiativeBonus ?? 0,
            isHidden: isHidden ?? false,
            revealOnTurn: revealOnTurn ?? false,
            conditions: []
        )

        state.campaignName = campaignName
        state.ownerId = ownerId
        state.ownerName = ownerName
        state.characterName = characterName
        state.initiative = initiative
        if let stats {
            state.stats = Dictionary(uniqueKeysWithValues: stats.map { ($0.key, $0) })
        }
        if let revealStats {
            state.revealStats = revealStats
        }
        if let autoSkipTurn {
            state.autoSkipTurn = autoSkipTurn
        }
        if let useAppInitiativeRoll {
            state.useAppInitiativeRoll = useAppInitiativeRoll
        }
        if let initiativeBonus {
            state.initiativeBonus = initiativeBonus
        }
        if let isHidden {
            state.isHidden = isHidden
        }
        if let revealOnTurn {
            state.revealOnTurn = revealOnTurn
        }
        if state.ownerName.caseInsensitiveCompare("Referee") != .orderedSame {
            state.isHidden = false
            state.revealOnTurn = false
        }
        if let conditions {
            state.conditions = conditions
        }

        storage[resolvedId] = state
        return view(from: state)
    }

    func renameCharacter(id: UUID, characterName: String) {
        guard var state = storage[id] else { return }
        state.characterName = characterName
        storage[id] = state
    }

    private func turnState(for campaignName: String) -> TurnState {
        if let existing = campaignTurns[campaignName] {
            return existing
        }
        let initial = TurnState(roundIndex: 1, turnIndex: 0)
        campaignTurns[campaignName] = initial
        return initial
    }

    private func saveTurnState(_ state: TurnState, for campaignName: String) {
        campaignTurns[campaignName] = state
    }

    func characters(for ownerId: UUID, campaignName: String) -> [PlayerView] {
        storage.values
            .filter {
                $0.campaignName == campaignName &&
                $0.ownerId == ownerId
            }
            .map { view(from: $0) }
            .sorted { $0.name < $1.name }
    }

    func get(name: String, campaignName: String) -> CharacterState? {
        storage.values.first(where: { $0.campaignName == campaignName && $0.characterName == name })
    }

    func all(campaignName: String) -> [String: CharacterState] {
        Dictionary(
            uniqueKeysWithValues: storage.values
                .filter { $0.campaignName == campaignName }
                .map { ($0.characterName, $0) }
        )
    }

    func clear() {
        storage.removeAll()
        campaignTurns.removeAll()
    }

    func resetForNewEncounter(campaignName: String) {
        let entries = storage.filter { $0.value.campaignName == campaignName }
        var idsToRemove: [UUID] = []
        for (id, var state) in entries {
            if state.ownerName.caseInsensitiveCompare("Referee") == .orderedSame {
                idsToRemove.append(id)
                continue
            }
            state.initiative = nil
            storage[id] = state
        }
        for id in idsToRemove {
            storage.removeValue(forKey: id)
        }
        resetTurnState(campaignName: campaignName)
    }

    func resetTurnState(campaignName: String, roundIndex: Int = 1, turnIndex: Int = 0) {
        let updated = TurnState(roundIndex: roundIndex, turnIndex: turnIndex)
        saveTurnState(updated, for: campaignName)
    }

    func deleteCharacter(id: UUID) -> Bool {
        if storage.removeValue(forKey: id) != nil {
            return true
        }
        return false
    }

    func ownerId(for id: UUID) -> UUID? {
        storage[id]?.ownerId
    }

    func ownerName(for ownerId: UUID, campaignName: String) -> String? {
        storage.values.first {
            $0.campaignName == campaignName && $0.ownerId == ownerId
        }?.ownerName
    }

    func characterState(for id: UUID) -> CharacterState? {
        storage[id]
    }

    func renameOwner(ownerId: UUID, newName: String, campaignName: String) {
        for (id, var state) in storage {
            guard state.campaignName == campaignName, state.ownerId == ownerId else { continue }
            state.ownerName = newName
            storage[id] = state
        }
    }

    func setConditions(name: String, conditions: Set<String>, campaignName: String) {
        guard let existingId = storage.values.first(where: { $0.campaignName == campaignName && $0.characterName == name })?.id else {
            _ = upsertCharacter(
                id: nil,
                campaignName: campaignName,
                ownerId: UUID(),
                ownerName: name,
                characterName: name,
                initiative: nil,
                stats: [],
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 0,
                isHidden: false,
                revealOnTurn: false,
                conditions: conditions
            )
            return
        }
        let existingOwnerId = storage[existingId]?.ownerId ?? UUID()
        _ = upsertCharacter(
            id: existingId,
            campaignName: campaignName,
            ownerId: existingOwnerId,
            ownerName: name,
            characterName: name,
            initiative: storage[existingId]?.initiative,
            stats: storage[existingId]?.stats.map { $0.value },
            revealStats: storage[existingId]?.revealStats,
            autoSkipTurn: storage[existingId]?.autoSkipTurn,
            useAppInitiativeRoll: storage[existingId]?.useAppInitiativeRoll,
            initiativeBonus: storage[existingId]?.initiativeBonus,
            isHidden: storage[existingId]?.isHidden,
            revealOnTurn: storage[existingId]?.revealOnTurn,
            conditions: conditions
        )
    }

    func addCondition(name: String, condition: String, campaignName: String) {
        guard let existingId = storage.values.first(where: { $0.campaignName == campaignName && $0.characterName == name })?.id else {
            _ = upsertCharacter(
                id: nil,
                campaignName: campaignName,
                ownerId: UUID(),
                ownerName: name,
                characterName: name,
                initiative: nil,
                stats: [],
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 0,
                isHidden: false,
                revealOnTurn: false,
                conditions: [condition]
            )
            return
        }
        var conditions = storage[existingId]?.conditions ?? []
        conditions.insert(condition)
        let existingOwnerId = storage[existingId]?.ownerId ?? UUID()
        _ = upsertCharacter(
            id: existingId,
            campaignName: campaignName,
            ownerId: existingOwnerId,
            ownerName: name,
            characterName: name,
            initiative: storage[existingId]?.initiative,
            stats: storage[existingId]?.stats.map { $0.value },
            revealStats: storage[existingId]?.revealStats,
            autoSkipTurn: storage[existingId]?.autoSkipTurn,
            useAppInitiativeRoll: storage[existingId]?.useAppInitiativeRoll,
            initiativeBonus: storage[existingId]?.initiativeBonus,
            isHidden: storage[existingId]?.isHidden,
            revealOnTurn: storage[existingId]?.revealOnTurn,
            conditions: conditions
        )
    }

    func removeCondition(name: String, condition: String, campaignName: String) {
        guard let existingId = storage.values.first(where: { $0.campaignName == campaignName && $0.characterName == name })?.id else {
            return
        }
        var conditions = storage[existingId]?.conditions ?? []
        conditions.remove(condition)
        let existingOwnerId = storage[existingId]?.ownerId ?? UUID()
        _ = upsertCharacter(
            id: existingId,
            campaignName: campaignName,
            ownerId: existingOwnerId,
            ownerName: name,
            characterName: name,
            initiative: storage[existingId]?.initiative,
            stats: storage[existingId]?.stats.map { $0.value },
            revealStats: storage[existingId]?.revealStats,
            autoSkipTurn: storage[existingId]?.autoSkipTurn,
            useAppInitiativeRoll: storage[existingId]?.useAppInitiativeRoll,
            initiativeBonus: storage[existingId]?.initiativeBonus,
            isHidden: storage[existingId]?.isHidden,
            revealOnTurn: storage[existingId]?.revealOnTurn,
            conditions: conditions
        )
    }

    func setVisibility(
        id: UUID,
        isHidden: Bool?,
        revealOnTurn: Bool?
    ) -> PlayerView? {
        guard var state = storage[id] else { return nil }
        let campaignName = state.campaignName
        let previousCandidates = sortedStates(
            campaignName: campaignName,
            includeHidden: false,
            includeRevealOnTurn: true
        )
        let previousTurnState = turnState(for: campaignName)
        let previousIndex = min(previousTurnState.turnIndex, max(previousCandidates.count - 1, 0))
        let previousCurrentId = previousCandidates.isEmpty ? nil : previousCandidates[previousIndex].id
        if state.ownerName.caseInsensitiveCompare("Referee") != .orderedSame {
            state.isHidden = false
            state.revealOnTurn = false
            storage[id] = state
            return view(from: state)
        }
        if let isHidden {
            state.isHidden = isHidden
        }
        if let revealOnTurn {
            state.revealOnTurn = revealOnTurn
        }
        storage[id] = state
        if let previousCurrentId {
            let updatedCandidates = sortedStates(
                campaignName: campaignName,
                includeHidden: false,
                includeRevealOnTurn: true
            )
            if let newIndex = updatedCandidates.firstIndex(where: { $0.id == previousCurrentId }) {
                var updatedTurnState = previousTurnState
                updatedTurnState.turnIndex = newIndex
                saveTurnState(updatedTurnState, for: campaignName)
            } else if updatedCandidates.isEmpty {
                var updatedTurnState = previousTurnState
                updatedTurnState.turnIndex = 0
                saveTurnState(updatedTurnState, for: campaignName)
            }
        }
        return view(from: state)
    }

    func setCurrentTurn(campaignName: String, characterId: UUID, encounterState: EncounterState) -> GameState {
        guard var target = storage[characterId], target.campaignName == campaignName else {
            return state(campaignName: campaignName, includeHidden: true, encounterState: encounterState)
        }

        if target.isHidden {
            target.isHidden = false
            target.revealOnTurn = false
            storage[target.id] = target
        }

        let candidates = sortedStates(
            campaignName: campaignName,
            includeHidden: false,
            includeRevealOnTurn: true
        )
        if let index = candidates.firstIndex(where: { $0.id == target.id }) {
            var turnState = turnState(for: campaignName)
            turnState.turnIndex = index
            saveTurnState(turnState, for: campaignName)
        }

        return state(campaignName: campaignName, includeHidden: true, encounterState: encounterState)
    }

    private func view(from state: CharacterState) -> PlayerView {
        PlayerView(
            id: state.id,
            ownerId: state.ownerId,
            ownerName: state.ownerName,
            name: state.characterName,
            initiative: state.initiative,
            stats: state.stats.values.sorted { $0.key < $1.key },
            revealStats: state.revealStats,
            autoSkipTurn: state.autoSkipTurn,
            useAppInitiativeRoll: state.useAppInitiativeRoll,
            initiativeBonus: state.initiativeBonus,
            isHidden: state.isHidden,
            revealOnTurn: state.revealOnTurn,
            conditions: Array(state.conditions).sorted()
        )
    }

    private func visibleTurnCandidates(campaignName: String) -> [CharacterState] {
        sortedStates(
            campaignName: campaignName,
            includeHidden: false,
            includeRevealOnTurn: true
        )
        .filter { $0.initiative != nil }
    }

    private func advanceTurnStatePastAutoSkip(
        _ turnState: inout TurnState,
        candidates: [CharacterState]
    ) -> Bool {
        guard !candidates.isEmpty else { return false }
        var attempts = 0
        while attempts < candidates.count && candidates[turnState.turnIndex].autoSkipTurn {
            if turnState.turnIndex + 1 >= candidates.count {
                turnState.roundIndex += 1
                turnState.turnIndex = 0
            } else {
                turnState.turnIndex += 1
            }
            attempts += 1
        }
        return attempts < candidates.count
    }

    private func sortedStates(
        campaignName: String,
        includeHidden: Bool,
        includeRevealOnTurn: Bool
    ) -> [CharacterState] {
        storage.values
            .filter { state in
                guard state.campaignName == campaignName else { return false }
                if includeHidden {
                    return true
                }
                if state.isHidden {
                    return includeRevealOnTurn && state.revealOnTurn
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
                switch (a.initiative, b.initiative) {
                case let (lhs?, rhs?):
                    return lhs > rhs
                case (.some, .none):
                    return true
                case (.none, .some):
                    return false
                case (.none, .none):
                    if a.ownerName == b.ownerName {
                        return a.characterName < b.characterName
                    }
                    return a.ownerName < b.ownerName
                }
            }
    }

    private func sortedViews(
        campaignName: String,
        includeHidden: Bool
    ) -> [PlayerView] {
        sortedStates(campaignName: campaignName, includeHidden: includeHidden, includeRevealOnTurn: false)
            .map { view(from: $0) }
    }

    func state(campaignName: String, includeHidden: Bool, encounterState: EncounterState) -> GameState {
        var players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        let turnCandidates = visibleTurnCandidates(campaignName: campaignName)
        var turnState = turnState(for: campaignName)

        if encounterState == .new {
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }

        if turnCandidates.isEmpty {
            turnState.roundIndex = 1
            turnState.turnIndex = 0
            saveTurnState(turnState, for: campaignName)
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }

        if turnState.turnIndex >= turnCandidates.count {
            turnState.turnIndex = 0
        }

        if encounterState == .active,
           !advanceTurnStatePastAutoSkip(&turnState, candidates: turnCandidates) {
            saveTurnState(turnState, for: campaignName)
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }

        var currentPlayer = turnCandidates[turnState.turnIndex]
        if encounterState == .active && currentPlayer.isHidden && currentPlayer.revealOnTurn {
            var updated = currentPlayer
            updated.isHidden = false
            updated.revealOnTurn = false
            storage[updated.id] = updated
            currentPlayer = updated
            players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        }

        saveTurnState(turnState, for: campaignName)
        let currentView = view(from: currentPlayer)
        return GameState(
            round: turnState.roundIndex,
            encounterState: encounterState,
            currentTurnId: currentView.id,
            currentTurnName: currentView.name,
            players: players
        )
    }

    func nextTurn(campaignName: String, includeHidden: Bool, encounterState: EncounterState) -> GameState {
        var players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        let turnCandidates = visibleTurnCandidates(campaignName: campaignName)
        var turnState = turnState(for: campaignName)

        if turnCandidates.isEmpty {
            turnState.roundIndex = 1
            turnState.turnIndex = 0
            saveTurnState(turnState, for: campaignName)
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
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

        if encounterState == .active,
           !advanceTurnStatePastAutoSkip(&turnState, candidates: turnCandidates) {
            saveTurnState(turnState, for: campaignName)
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }

        var currentPlayer = turnCandidates[turnState.turnIndex]
        if currentPlayer.isHidden && currentPlayer.revealOnTurn {
            var updated = currentPlayer
            updated.isHidden = false
            updated.revealOnTurn = false
            storage[updated.id] = updated
            currentPlayer = updated
            players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        }

        saveTurnState(turnState, for: campaignName)
        let currentView = view(from: currentPlayer)
        return GameState(
            round: turnState.roundIndex,
            encounterState: encounterState,
            currentTurnId: currentView.id,
            currentTurnName: currentView.name,
            players: players
        )
    }
}

let userStore = UserStore()
