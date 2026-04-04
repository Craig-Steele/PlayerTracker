import Vapor
import Foundation

private struct ServerAddressResponse: Content {
    let ip: String
    let localIP: String
    let publicIP: String?
}

private actor ConnectionLogWriter {
    private let logFileURL: URL

    init() {
        let logsDirectory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/PlayerTracker", isDirectory: true)
        self.logFileURL = logsDirectory.appendingPathComponent("connections.log")
    }

    func append(_ line: String) {
        do {
            let directoryURL = logFileURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directoryURL, withIntermediateDirectories: true)

            if !FileManager.default.fileExists(atPath: logFileURL.path) {
                try Data().write(to: logFileURL)
            }

            let data = Data((line + "\n").utf8)
            let handle = try FileHandle(forWritingTo: logFileURL)
            defer {
                try? handle.close()
            }
            try handle.seekToEnd()
            try handle.write(contentsOf: data)
        } catch {
            fputs("Failed to append connection log: \(error)\n", stderr)
        }
    }

    func path() -> String {
        logFileURL.path
    }
}

private let connectionLogWriter = ConnectionLogWriter()

private func clientConnectionInfo(for req: Request) -> (ip: String, port: String) {
    if let forwarded = req.headers.first(name: "X-Forwarded-For")?
        .split(separator: ",")
        .first?
        .trimmingCharacters(in: .whitespacesAndNewlines),
       !forwarded.isEmpty {
        return (forwarded, "unknown")
    }

    if let peerAddress = req.peerAddress,
       let ipAddress = peerAddress.ipAddress,
       !ipAddress.isEmpty {
        let port = peerAddress.port.map(String.init) ?? "unknown"
        return (ipAddress, port)
    }

    if let remoteAddress = req.remoteAddress,
       let ipAddress = remoteAddress.ipAddress,
       !ipAddress.isEmpty {
        let port = remoteAddress.port.map(String.init) ?? "unknown"
        return (ipAddress, port)
    }

    return ("unknown", "unknown")
}

private func logConnection(_ req: Request, action: String, identifier: String? = nil) {
    let resolvedIdentifier = (identifier?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false)
        ? identifier!
        : "anonymous"
    let connection = clientConnectionInfo(for: req)
    let formatter = ISO8601DateFormatter()
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let timestamp = formatter.string(from: Date())
    let line = "\(timestamp) connection action=\(action) ip=\(connection.ip) port=\(connection.port) identifier=\(resolvedIdentifier) path=\(req.url.path)"
    req.logger.info("\(line)")
    Task {
        await connectionLogWriter.append(line)
    }
}

private func logServerEvent(_ message: String) async {
    let formatter = ISO8601DateFormatter()
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let timestamp = formatter.string(from: Date())
    await connectionLogWriter.append("\(timestamp) server \(message)")
}

private func launchDisplayPage() {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    process.arguments = ["http://localhost:8080/display.html"]

    do {
        try process.run()
    } catch {
        fputs("Failed to launch display page: \(error)\n", stderr)
    }
}

private func repositoryWebClientDirectory() -> URL {
    let sourceURL = URL(fileURLWithPath: #filePath)
    return sourceURL
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Client-Web", isDirectory: true)
}

private func availableWebClientDirectory() -> URL {
    let repositoryDirectory = repositoryWebClientDirectory()
    if FileManager.default.fileExists(atPath: repositoryDirectory.path) {
        return repositoryDirectory
    }

    let homeDir = FileManager.default.homeDirectoryForCurrentUser
    return homeDir.appendingPathComponent("Sites/PlayerTracker", isDirectory: true)
}

// Concurrency-safe store for your character list
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

// Shared store instance
let userStore = UserStore()

struct RulesetSummary: Content {
    let id: String
    let label: String
}

struct StatEntry: Content {
    let key: String
    let current: Int
    let max: Int
}

enum EncounterState: String, Content, Codable {
    case new = "new"
    case active = "active"
    case suspended = "suspended"
}

struct CampaignState: Content {
    let name: String
    let rulesetId: String
    let rulesetLabel: String
    let encounterState: EncounterState
}

private struct CampaignPersistedState: Content {
    let name: String
    let rulesetId: String
    let encounterState: EncounterState?
}

struct CampaignUpdateInput: Content {
    let name: String
    let rulesetId: String
}

actor CampaignStore {
    private var currentName: String
    private var currentRulesetId: String
    private var currentLibrary: RuleSetLibrary
    private var currentEncounterState: EncounterState

    init(defaultLibrary: RuleSetLibrary, defaultName: String = "Campaign") {
        let persisted = CampaignStore.loadPersistedState()
        if let persisted {
            if let restoredLibrary = try? RuleSetLibraryLoader.loadLibrary(id: persisted.rulesetId) {
                self.currentName = persisted.name
                self.currentRulesetId = restoredLibrary.id
                self.currentLibrary = restoredLibrary
                self.currentEncounterState = .new
                CampaignStore.savePersistedState(
                    CampaignPersistedState(
                        name: self.currentName,
                        rulesetId: self.currentRulesetId,
                        encounterState: self.currentEncounterState
                    )
                )
                return
            }
        }
        self.currentName = defaultName
        self.currentRulesetId = defaultLibrary.id
        self.currentLibrary = defaultLibrary
        self.currentEncounterState = .new
    }

    func state() -> CampaignState {
        CampaignState(
            name: currentName,
            rulesetId: currentRulesetId,
            rulesetLabel: currentLibrary.label,
            encounterState: currentEncounterState
        )
    }

    func library() -> RuleSetLibrary {
        currentLibrary
    }

    func currentCampaignName() -> String {
        currentName
    }

    func encounterState() -> EncounterState {
        currentEncounterState
    }

    func setEncounterState(_ state: EncounterState) {
        currentEncounterState = state
        CampaignStore.savePersistedState(
            CampaignPersistedState(
                name: currentName,
                rulesetId: currentRulesetId,
                encounterState: currentEncounterState
            )
        )
    }

    func update(name: String, rulesetId: String) throws -> CampaignState {
        let library = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        currentName = name
        currentRulesetId = library.id
        currentLibrary = library
        CampaignStore.savePersistedState(
            CampaignPersistedState(
                name: currentName,
                rulesetId: currentRulesetId,
                encounterState: currentEncounterState
            )
        )
        return state()
    }

    private static func persistedStateURL() -> URL? {
        let homeDir = FileManager.default.homeDirectoryForCurrentUser
        return homeDir.appendingPathComponent("Sites/PlayerTracker/campaign.json")
    }

    private static func loadPersistedState() -> CampaignPersistedState? {
        guard let url = persistedStateURL(),
              let data = try? Data(contentsOf: url) else {
            return nil
        }
        return try? JSONDecoder().decode(CampaignPersistedState.self, from: data)
    }

    private static func savePersistedState(_ state: CampaignPersistedState) {
        guard let url = persistedStateURL() else { return }
        do {
            let data = try JSONEncoder().encode(state)
            try data.write(to: url, options: [.atomic])
        } catch {
            print("Failed to persist campaign state:", error)
        }
    }
}

// Simple DTO for incoming POST JSON
struct UserData: Content {
    let name: String
    let initiative: Double?
}

struct CharacterState {
    let id: UUID
    var campaignName: String
    var ownerId: UUID
    var ownerName: String
    var characterName: String
    var initiative: Double?
    var stats: [String: StatEntry]
    var revealStats: Bool
    var autoSkipTurn: Bool
    var useAppInitiativeRoll: Bool
    var initiativeBonus: Int
    var isHidden: Bool
    var revealOnTurn: Bool
    var conditions: Set<String>
}

struct PlayerView: Content {
    let id: UUID
    let ownerId: UUID
    let ownerName: String
    let name: String
    let initiative: Double?
    let stats: [StatEntry]
    let revealStats: Bool
    let autoSkipTurn: Bool
    let useAppInitiativeRoll: Bool
    let initiativeBonus: Int
    let isHidden: Bool
    let revealOnTurn: Bool
    let conditions: [String]
}

struct GameState: Content {
    let round: Int
    let encounterState: EncounterState
    let currentTurnId: UUID?
    let currentTurnName: String?
    let players: [PlayerView]
}

struct ConditionsInput: Content {
    let name: String
    let conditions: [String]
}

struct CharacterInput: Content {
    let id: UUID?
    let campaignName: String?
    let ownerId: UUID?
    let ownerName: String
    let name: String
    let initiative: Double?
    let stats: [StatEntry]?
    let revealStats: Bool?
    let autoSkipTurn: Bool?
    let useAppInitiativeRoll: Bool?
    let initiativeBonus: Int?
    let isHidden: Bool?
    let revealOnTurn: Bool?
    let conditions: [String]?
}

struct CharacterVisibilityInput: Content {
    let isHidden: Bool?
    let revealOnTurn: Bool?
}

struct CharacterRenameInput: Content {
    let name: String
}

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
    
    // DELETE /users – clear all players
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
    
    // GET /state – full game state (round, current turn, players)
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

    // POST /turn-complete – advance to next turn
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
        return try await campaignStore.update(name: input.name, rulesetId: input.rulesetId)
    }

    app.get("rulesets") { req async throws -> [RulesetSummary] in
        return RuleSetLibraryLoader.availableRulesets()
    }
}

@main
struct Run {
    static func main() async throws {
        let app = try await Application.make(.detect())
        do {
            let sitesDir = availableWebClientDirectory().path + "/"

            print("Serving static files from:", sitesDir)

            app.middleware.use(FileMiddleware(publicDirectory: sitesDir))

            // Listen on all interfaces for LAN access
            app.http.server.configuration.hostname = "0.0.0.0"
            app.http.server.configuration.port = 8080

            let conditionLibrary = try RuleSetLibraryLoader.loadDefault()
            let campaignStore = CampaignStore(defaultLibrary: conditionLibrary)
            print("Loaded default ruleset:", conditionLibrary.label)
            print("Connection logs:", await connectionLogWriter.path())
            await logServerEvent("startup host=\(app.http.server.configuration.hostname) port=\(app.http.server.configuration.port)")

            try routes(app, campaignStore: campaignStore)
            Task {
                // Give the HTTP listener a moment to bind before opening the browser.
                try? await Task.sleep(for: .milliseconds(400))
                launchDisplayPage()
            }
            try await app.execute()
            try await app.asyncShutdown()
        } catch {
            try? await app.asyncShutdown()
            throw error
        }
    }
}
