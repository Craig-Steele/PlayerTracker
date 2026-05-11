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
        self.currentCampaignID = nil
    }

    func configure(database: any Database) async throws {
        self.database = database
        if restorePersistedState,
           let loaded = try await DatabasePersistence.loadCampaign(named: currentName, on: database) {
            currentName = loaded.name
            currentRulesetId = loaded.rulesetId
            currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: loaded.rulesetId)
            currentEncounterState = loaded.encounterState
            currentCampaignID = nil
        }
    }

    func state() -> CampaignState? {
        guard let currentCampaignID else {
            return nil
        }
        return CampaignState(
            id: currentCampaignID,
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

    func activeCampaignID() -> UUID? {
        currentCampaignID
    }

    func encounterState() -> EncounterState {
        currentEncounterState
    }

    func activeCampaign() -> CampaignState? {
        state()
    }

    func campaigns() async throws -> [CampaignSummary] {
        guard let database else { return [] }
        let campaigns = try await DatabasePersistence.loadCampaigns(on: database)
        return campaigns.map {
            CampaignSummary(
                id: $0.id,
                name: $0.name,
                rulesetId: $0.rulesetId,
                rulesetLabel: (try? RuleSetLibraryLoader.loadLibrary(id: $0.rulesetId).label) ?? $0.rulesetId,
                encounterState: $0.encounterState,
                isActive: $0.id == currentCampaignID
            )
        }
    }

    func createCampaign(name: String, rulesetId: String) async throws -> CampaignSummary {
        guard let database else {
            throw Abort(.internalServerError, reason: "Database is not configured.")
        }
        let campaignID = try await DatabasePersistence.createCampaignMetadata(
            name: name,
            rulesetId: rulesetId,
            on: database
        )
        guard let created = try await DatabasePersistence.loadCampaign(id: campaignID, on: database) else {
            throw Abort(.internalServerError, reason: "Failed to load created campaign.")
        }
        return CampaignSummary(
            id: created.id,
            name: created.name,
            rulesetId: created.rulesetId,
            rulesetLabel: (try? RuleSetLibraryLoader.loadLibrary(id: created.rulesetId).label) ?? created.rulesetId,
            encounterState: created.encounterState,
            isActive: created.id == currentCampaignID
        )
    }

    func updateCampaign(id campaignID: UUID, name: String, rulesetId: String) async throws -> CampaignSummary {
        guard let database else {
            throw Abort(.internalServerError, reason: "Database is not configured.")
        }
        let updatedID = try await DatabasePersistence.updateCampaignMetadata(
            id: campaignID,
            name: name,
            rulesetId: rulesetId,
            on: database
        )
        if currentCampaignID == updatedID {
            currentName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            currentRulesetId = rulesetId
            currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        }
        guard let updated = try await DatabasePersistence.loadCampaign(id: updatedID, on: database) else {
            throw Abort(.internalServerError, reason: "Failed to load updated campaign.")
        }
        return CampaignSummary(
            id: updated.id,
            name: updated.name,
            rulesetId: updated.rulesetId,
            rulesetLabel: (try? RuleSetLibraryLoader.loadLibrary(id: updated.rulesetId).label) ?? updated.rulesetId,
            encounterState: updated.encounterState,
            isActive: updated.id == currentCampaignID
        )
    }

    func setEncounterState(_ state: EncounterState) async {
        currentEncounterState = state
        await savePersistedStateIfNeeded()
    }

    func selectCampaign(id campaignID: UUID) async throws -> CampaignState {
        guard let database else {
            throw Abort(.internalServerError, reason: "Database is not configured.")
        }
        guard let loaded = try await DatabasePersistence.loadCampaign(id: campaignID, on: database) else {
            throw Abort(.notFound, reason: "Campaign not found.")
        }

        currentCampaignID = loaded.id
        currentName = loaded.name
        currentRulesetId = loaded.rulesetId
        currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: loaded.rulesetId)
        currentEncounterState = loaded.encounterState
        return state()!
    }

    func update(name: String, rulesetId: String) async throws -> CampaignState {
        currentName = name
        if restorePersistedState,
           let database,
           let loaded = try await DatabasePersistence.loadCampaign(named: name, on: database) {
            currentCampaignID = loaded.id
            currentName = loaded.name
            currentRulesetId = loaded.rulesetId
            currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: loaded.rulesetId)
            currentEncounterState = loaded.encounterState
            return state()!
        }

        let library = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        currentRulesetId = library.id
        currentLibrary = library
        currentEncounterState = .new
        await savePersistedStateIfNeeded()
        return state()!
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
