import Foundation
import Fluent
import Vapor

// Concurrency-safe store for character and turn state.
actor UserStore {
    private var storage: [UUID: CharacterState] = [:]
    private var campaignTurns: [String: TurnState] = [:]
    private var database: (any Database)?
    private var currentCampaignID: UUID?
    private var currentCampaignName: String?
    private var currentRulesetId: String?
    private var currentEncounterState: EncounterState = .new

    private struct TurnState {
        var roundIndex: Int
        var turnIndex: Int
        var currentTurnID: UUID?
    }

    func resetMemoryForTesting() {
        storage.removeAll()
        campaignTurns.removeAll()
        database = nil
        currentCampaignID = nil
        currentCampaignName = nil
        currentRulesetId = nil
        currentEncounterState = .new
    }

    private func configuredCampaignTurnState() -> TurnState {
        guard let campaignName = currentCampaignName else {
            return TurnState(roundIndex: 1, turnIndex: 0, currentTurnID: nil)
        }
        return campaignTurns[campaignName] ?? TurnState(roundIndex: 1, turnIndex: 0, currentTurnID: nil)
    }

    private func persistConfiguredCampaignCharacters() async throws {
        guard let database, let campaignID = currentCampaignID, let campaignName = currentCampaignName else {
            return
        }
        try await DatabasePersistence.deleteCampaignCharacters(campaignID: campaignID, on: database)
        for state in storage.values where state.campaignName == campaignName {
            try await DatabasePersistence.persistCharacter(
                state,
                campaignID: campaignID,
                on: database
            )
        }
    }

    private func persistConfiguredCampaignEncounter(
        currentTurnID: UUID?
    ) async throws {
        guard let database,
              let campaignName = currentCampaignName,
              let campaignID = currentCampaignID,
              let rulesetId = currentRulesetId else {
            return
        }
        let turnState = configuredCampaignTurnState()
        try await DatabasePersistence.upsertCampaign(
            name: campaignName,
            rulesetId: rulesetId,
            encounterState: currentEncounterState,
            roundIndex: turnState.roundIndex,
            turnIndex: turnState.turnIndex,
            currentTurnID: currentTurnID ?? turnState.currentTurnID,
            on: database
        )
        currentCampaignID = campaignID
    }

    func configure(
        campaignName: String,
        rulesetId: String,
        on database: any Database
    ) async throws {
        self.database = database
        self.currentCampaignName = campaignName
        self.currentRulesetId = rulesetId

        guard let loaded = try await DatabasePersistence.loadCampaign(named: campaignName, on: database) else {
            currentCampaignID = try await DatabasePersistence.upsertCampaignMetadata(
                name: campaignName,
                rulesetId: rulesetId,
                on: database
            )
            storage.removeAll()
            campaignTurns[campaignName] = TurnState(roundIndex: 1, turnIndex: 0, currentTurnID: nil)
            currentEncounterState = .new
            return
        }

        currentCampaignID = loaded.id
        currentRulesetId = loaded.rulesetId
        currentEncounterState = loaded.encounterState
        campaignTurns[campaignName] = TurnState(
            roundIndex: loaded.roundIndex,
            turnIndex: loaded.turnIndex,
            currentTurnID: loaded.currentTurnID
        )

        let loadedCharacters = try await DatabasePersistence.loadCharacters(
            campaignID: loaded.id,
            campaignName: campaignName,
            on: database
        )

        storage = Dictionary(uniqueKeysWithValues: loadedCharacters.map { ($0.id, $0) })
    }

    func rebindActiveCampaign(from oldName: String, to newName: String, rulesetId: String) {
        guard oldName != newName else {
            currentCampaignName = newName
            currentRulesetId = rulesetId
            return
        }

        currentCampaignName = newName
        currentRulesetId = rulesetId

        if let turnState = campaignTurns.removeValue(forKey: oldName) {
            campaignTurns[newName] = turnState
        }

        let affectedIDs = storage.values.filter { $0.campaignName == oldName }.map(\.id)
        for id in affectedIDs {
            guard var state = storage[id] else { continue }
            state.campaignName = newName
            storage[id] = state
        }
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

    func autoRollUnsetInitiativeForReferee(campaignName: String, standardDie: String?) async {
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
        if campaignName == currentCampaignName {
            do {
                try await persistConfiguredCampaignCharacters()
            } catch {
                print("Failed to persist referee initiative rolls:", error)
            }
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
    ) async -> PlayerView {
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
        if currentCampaignName == campaignName {
            if let campaignID = currentCampaignID {
                if let database {
                    do {
                        try await DatabasePersistence.persistCharacter(
                            state,
                            campaignID: campaignID,
                            on: database
                        )
                    } catch {
                        print("Failed to persist character:", error)
                    }
                }
            }
        }
        return view(from: state)
    }

    func renameCharacter(id: UUID, characterName: String) async {
        guard var state = storage[id] else { return }
        state.characterName = characterName
        storage[id] = state
        if state.campaignName == currentCampaignName, let database, let campaignID = currentCampaignID {
            do {
                try await DatabasePersistence.persistCharacter(
                    state,
                    campaignID: campaignID,
                    on: database
                )
            } catch {
                print("Failed to persist character rename:", error)
            }
        }
    }

    private func turnState(for campaignName: String) -> TurnState {
        if let existing = campaignTurns[campaignName] {
            return existing
        }
        let initial = TurnState(roundIndex: 1, turnIndex: 0, currentTurnID: nil)
        campaignTurns[campaignName] = initial
        return initial
    }

    private func alignTurnStateToCurrentTurnID(
        turnState: inout TurnState,
        candidates: [CharacterState]
    ) {
        guard !candidates.isEmpty else { return }

        if let currentTurnID = turnState.currentTurnID,
           let index = candidates.firstIndex(where: { $0.id == currentTurnID }) {
            turnState.turnIndex = index
        }

        if turnState.turnIndex >= candidates.count {
            turnState.turnIndex = 0
        }
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

    func clear() async {
        storage.removeAll()
        campaignTurns.removeAll()
        if let database, let campaignID = currentCampaignID {
            do {
                try await DatabasePersistence.deleteCampaignCharacters(campaignID: campaignID, on: database)
            } catch {
                print("Failed to clear campaign characters:", error)
            }
        }
    }

    func resetForNewEncounter(campaignName: String) async {
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
        if campaignName == currentCampaignName {
            do {
                try await persistConfiguredCampaignCharacters()
            } catch {
                print("Failed to persist reset encounter:", error)
            }
        }
    }

    func resetTurnState(campaignName: String, roundIndex: Int = 1, turnIndex: Int = 0) {
        let updated = TurnState(roundIndex: roundIndex, turnIndex: turnIndex, currentTurnID: nil)
        saveTurnState(updated, for: campaignName)
    }

    func deleteCharacter(id: UUID) async -> Bool {
        if storage.removeValue(forKey: id) != nil {
            if let database {
                do {
                    try await DatabasePersistence.deleteCharacter(id: id, on: database)
                } catch {
                    print("Failed to delete character:", error)
                }
            }
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

    func renameOwner(ownerId: UUID, newName: String, campaignName: String) async {
        for (id, var state) in storage {
            guard state.campaignName == campaignName, state.ownerId == ownerId else { continue }
            state.ownerName = newName
            storage[id] = state
        }
        if campaignName == currentCampaignName {
            do {
                try await persistConfiguredCampaignCharacters()
            } catch {
                print("Failed to persist owner rename:", error)
            }
        }
    }

    func setConditions(name: String, conditions: Set<String>, campaignName: String) async {
        guard let existingId = storage.values.first(where: { $0.campaignName == campaignName && $0.characterName == name })?.id else {
            _ = await upsertCharacter(
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
        _ = await upsertCharacter(
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

    func addCondition(name: String, condition: String, campaignName: String) async {
        guard let existingId = storage.values.first(where: { $0.campaignName == campaignName && $0.characterName == name })?.id else {
            _ = await upsertCharacter(
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
        _ = await upsertCharacter(
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

    func removeCondition(name: String, condition: String, campaignName: String) async {
        guard let existingId = storage.values.first(where: { $0.campaignName == campaignName && $0.characterName == name })?.id else {
            return
        }
        var conditions = storage[existingId]?.conditions ?? []
        conditions.remove(condition)
        let existingOwnerId = storage[existingId]?.ownerId ?? UUID()
        _ = await upsertCharacter(
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
    ) async -> PlayerView? {
        guard var state = storage[id] else { return nil }
        let campaignName = state.campaignName
        let previousCandidates = sortedStates(
            campaignName: campaignName,
            includeHidden: false,
            includeRevealOnTurn: true
        )
        let previousTurnState = turnState(for: campaignName)
        let previousIndex = min(previousTurnState.turnIndex, max(previousCandidates.count - 1, 0))
        let previousCurrentId = previousTurnState.currentTurnID
            ?? (previousCandidates.isEmpty ? nil : previousCandidates[previousIndex].id)
        if state.ownerName.caseInsensitiveCompare("Referee") != .orderedSame {
            state.isHidden = false
            state.revealOnTurn = false
            storage[id] = state
            if campaignName == currentCampaignName {
                do {
                    try await persistConfiguredCampaignCharacters()
                } catch {
                    print("Failed to persist visibility change:", error)
                }
            }
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
                updatedTurnState.currentTurnID = previousCurrentId
                saveTurnState(updatedTurnState, for: campaignName)
            } else if updatedCandidates.isEmpty {
                var updatedTurnState = previousTurnState
                updatedTurnState.turnIndex = 0
                updatedTurnState.currentTurnID = nil
                saveTurnState(updatedTurnState, for: campaignName)
            }
        }
        if campaignName == currentCampaignName {
            do {
                try await persistConfiguredCampaignCharacters()
            } catch {
                print("Failed to persist visibility change:", error)
            }
        }
        return view(from: state)
    }

    func setCurrentTurn(campaignName: String, characterId: UUID, encounterState: EncounterState) async -> GameState {
        guard var target = storage[characterId], target.campaignName == campaignName else {
            return await state(campaignName: campaignName, includeHidden: true, encounterState: encounterState)
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
            turnState.currentTurnID = target.id
            saveTurnState(turnState, for: campaignName)
        }

        return await state(campaignName: campaignName, includeHidden: true, encounterState: encounterState)
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

    func state(campaignName: String, includeHidden: Bool, encounterState: EncounterState) async -> GameState {
        currentEncounterState = encounterState
        var players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        let turnCandidates = visibleTurnCandidates(campaignName: campaignName)
        var turnState = turnState(for: campaignName)
        alignTurnStateToCurrentTurnID(turnState: &turnState, candidates: turnCandidates)

        if encounterState == .new {
            if campaignName == currentCampaignName {
                do {
                    try await persistConfiguredCampaignEncounter(currentTurnID: nil)
                } catch {
                    print("Failed to persist new encounter state:", error)
                }
            }
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
            turnState.currentTurnID = nil
            saveTurnState(turnState, for: campaignName)
            if campaignName == currentCampaignName {
                do {
                    try await persistConfiguredCampaignEncounter(currentTurnID: nil)
                } catch {
                    print("Failed to persist empty encounter state:", error)
                }
            }
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
            turnState.currentTurnID = turnCandidates.first?.id
        }

        if encounterState == .active,
           !advanceTurnStatePastAutoSkip(&turnState, candidates: turnCandidates) {
            turnState.currentTurnID = nil
            saveTurnState(turnState, for: campaignName)
            if campaignName == currentCampaignName {
                do {
                    try await persistConfiguredCampaignEncounter(currentTurnID: nil)
                } catch {
                    print("Failed to persist skipped encounter state:", error)
                }
            }
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }

        guard turnState.turnIndex < turnCandidates.count else {
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }
        let currentPlayer = turnCandidates[turnState.turnIndex]
        if encounterState == .active && currentPlayer.isHidden && currentPlayer.revealOnTurn {
            var updated = currentPlayer
            updated.isHidden = false
            updated.revealOnTurn = false
            storage[updated.id] = updated
            players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        }

        turnState.currentTurnID = currentPlayer.id
        saveTurnState(turnState, for: campaignName)
        let currentView = view(from: currentPlayer)
        if campaignName == currentCampaignName {
            do {
                try await persistConfiguredCampaignCharacters()
                try await persistConfiguredCampaignEncounter(currentTurnID: currentView.id)
            } catch {
                print("Failed to persist encounter state:", error)
            }
        }
        return GameState(
            round: turnState.roundIndex,
            encounterState: encounterState,
            currentTurnId: currentView.id,
            currentTurnName: currentView.name,
            players: players
        )
    }

    func nextTurn(campaignName: String, includeHidden: Bool, encounterState: EncounterState) async -> GameState {
        currentEncounterState = encounterState
        var players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        let turnCandidates = visibleTurnCandidates(campaignName: campaignName)
        var turnState = turnState(for: campaignName)
        alignTurnStateToCurrentTurnID(turnState: &turnState, candidates: turnCandidates)

        if turnCandidates.isEmpty {
            turnState.roundIndex = 1
            turnState.turnIndex = 0
            turnState.currentTurnID = nil
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
            turnState.currentTurnID = nil
            saveTurnState(turnState, for: campaignName)
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }

        guard turnState.turnIndex < turnCandidates.count else {
            return GameState(
                round: turnState.roundIndex,
                encounterState: encounterState,
                currentTurnId: nil,
                currentTurnName: nil,
                players: players
            )
        }
        let currentPlayer = turnCandidates[turnState.turnIndex]
        if currentPlayer.isHidden && currentPlayer.revealOnTurn {
            var updated = currentPlayer
            updated.isHidden = false
            updated.revealOnTurn = false
            storage[updated.id] = updated
            players = sortedViews(campaignName: campaignName, includeHidden: includeHidden)
        }

        turnState.currentTurnID = currentPlayer.id
        saveTurnState(turnState, for: campaignName)
        let currentView = view(from: currentPlayer)
        if campaignName == currentCampaignName {
            do {
                try await persistConfiguredCampaignCharacters()
                try await persistConfiguredCampaignEncounter(currentTurnID: currentView.id)
            } catch {
                print("Failed to persist next turn state:", error)
            }
        }
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
