import Foundation
import Fluent
import Vapor

actor CampaignStore {
    private var currentName: String
    private var currentRulesetId: String
    private var currentLibrary: RuleSetLibrary
    private var currentEncounterState: EncounterState
    private var currentCampaignID: UUID?
    private var database: (any Database)?
    private let restorePersistedState: Bool
    private let persistChanges: Bool

    init(
        defaultLibrary: RuleSetLibrary,
        defaultName: String = "Campaign",
        restorePersistedState: Bool = true,
        persistChanges: Bool = true
    ) {
        self.restorePersistedState = restorePersistedState
        self.persistChanges = persistChanges
        self.currentName = defaultName
        self.currentRulesetId = defaultLibrary.id
        self.currentLibrary = defaultLibrary
        self.currentEncounterState = .new
    }

    func configure(database: any Database) async throws {
        self.database = database
        if restorePersistedState,
           let loaded = try await DatabasePersistence.loadCampaign(named: currentName, on: database) {
            currentCampaignID = loaded.id
            currentRulesetId = loaded.rulesetId
            currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: loaded.rulesetId)
            currentEncounterState = loaded.encounterState
            return
        }

        try await DatabasePersistence.upsertCampaign(
            name: currentName,
            rulesetId: currentRulesetId,
            encounterState: currentEncounterState,
            roundIndex: 1,
            turnIndex: 0,
            currentTurnID: nil,
            on: database
        )
        currentCampaignID = try await DatabasePersistence.upsertCampaignMetadata(
            name: currentName,
            rulesetId: currentRulesetId,
            on: database
        )
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

    func setEncounterState(_ state: EncounterState) async {
        currentEncounterState = state
        await savePersistedStateIfNeeded()
    }

    func update(name: String, rulesetId: String) async throws -> CampaignState {
        currentName = name
        if restorePersistedState,
           let database,
           let loaded = try await DatabasePersistence.loadCampaign(named: name, on: database) {
            currentCampaignID = loaded.id
            currentRulesetId = loaded.rulesetId
            currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: loaded.rulesetId)
            currentEncounterState = loaded.encounterState
            return state()
        }

        let library = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        currentRulesetId = library.id
        currentLibrary = library
        currentEncounterState = .new
        await savePersistedStateIfNeeded()
        return state()
    }

    private func savePersistedStateIfNeeded() async {
        guard persistChanges, let database else { return }
        do {
            currentCampaignID = try await DatabasePersistence.upsertCampaignMetadata(
                name: currentName,
                rulesetId: currentRulesetId,
                on: database
            )
        } catch {
            print("Failed to persist campaign metadata:", error)
        }
    }
}
