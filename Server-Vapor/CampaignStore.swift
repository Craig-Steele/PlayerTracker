import Foundation
import Fluent
import Vapor

actor CampaignStore {
    private var currentName: String
    private var currentRulesetId: String
    private var currentLibrary: RuleSetLibrary
    private var currentEncounterState: EncounterState
    private var currentClaimTimeoutMinutes: Int
    private var currentIsInviteOnly: Bool
    private var currentUserdataFiles: [String]
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
        self.currentClaimTimeoutMinutes = 5
        self.currentIsInviteOnly = false
        self.currentUserdataFiles = []
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
            currentClaimTimeoutMinutes = loaded.claimTimeoutMinutes
            currentIsInviteOnly = loaded.isInviteOnly
            currentUserdataFiles = loaded.userdataFiles
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
            encounterState: currentEncounterState,
            claimTimeoutMinutes: currentClaimTimeoutMinutes,
            isInviteOnly: currentIsInviteOnly,
            userdataFiles: currentUserdataFiles
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
                isActive: $0.id == currentCampaignID,
                claimTimeoutMinutes: $0.claimTimeoutMinutes,
                isInviteOnly: $0.isInviteOnly
            )
        }
    }

    func createCampaign(
        name: String,
        rulesetId: String,
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool = false
    ) async throws -> CampaignSummary {
        guard let database else {
            throw Abort(.internalServerError, reason: "Database is not configured.")
        }
        let campaignID = try await DatabasePersistence.createCampaignMetadata(
            name: name,
            rulesetId: rulesetId,
            claimTimeoutMinutes: claimTimeoutMinutes ?? currentClaimTimeoutMinutes,
            isInviteOnly: isInviteOnly,
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
            isActive: created.id == currentCampaignID,
            claimTimeoutMinutes: created.claimTimeoutMinutes,
            isInviteOnly: created.isInviteOnly
        )
    }

    func updateCampaign(
        id campaignID: UUID,
        name: String,
        rulesetId: String,
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool? = nil
    ) async throws -> CampaignSummary {
        guard let database else {
            throw Abort(.internalServerError, reason: "Database is not configured.")
        }
        let updatedID = try await DatabasePersistence.updateCampaignMetadata(
            id: campaignID,
            name: name,
            rulesetId: rulesetId,
            claimTimeoutMinutes: claimTimeoutMinutes,
            isInviteOnly: isInviteOnly,
            on: database
        )
        guard let updated = try await DatabasePersistence.loadCampaign(id: updatedID, on: database) else {
            throw Abort(.internalServerError, reason: "Failed to load updated campaign.")
        }
        if currentCampaignID == updatedID {
            currentName = name.trimmingCharacters(in: .whitespacesAndNewlines)
            currentRulesetId = rulesetId
            currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
            currentClaimTimeoutMinutes = updated.claimTimeoutMinutes
            currentIsInviteOnly = updated.isInviteOnly
            currentUserdataFiles = updated.userdataFiles
        }
        return CampaignSummary(
            id: updated.id,
            name: updated.name,
            rulesetId: updated.rulesetId,
            rulesetLabel: (try? RuleSetLibraryLoader.loadLibrary(id: updated.rulesetId).label) ?? updated.rulesetId,
            encounterState: updated.encounterState,
            isActive: updated.id == currentCampaignID,
            claimTimeoutMinutes: updated.claimTimeoutMinutes,
            isInviteOnly: updated.isInviteOnly
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
        currentClaimTimeoutMinutes = loaded.claimTimeoutMinutes
        currentIsInviteOnly = loaded.isInviteOnly
        currentUserdataFiles = loaded.userdataFiles
        return state()!
    }

    func update(
        name: String,
        rulesetId: String,
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool? = nil
    ) async throws -> CampaignState {
        currentName = name
        if restorePersistedState,
           let database,
           let loaded = try await DatabasePersistence.loadCampaign(named: name, on: database) {
            let updatedID = try await DatabasePersistence.updateCampaignMetadata(
                id: loaded.id,
                name: name,
                rulesetId: rulesetId,
                claimTimeoutMinutes: claimTimeoutMinutes ?? loaded.claimTimeoutMinutes,
                isInviteOnly: isInviteOnly ?? loaded.isInviteOnly,
                on: database
            )
            guard let updated = try await DatabasePersistence.loadCampaign(id: updatedID, on: database) else {
                throw Abort(.internalServerError, reason: "Failed to load updated campaign.")
            }
            currentCampaignID = updated.id
            currentName = updated.name
            currentRulesetId = updated.rulesetId
            currentLibrary = try RuleSetLibraryLoader.loadLibrary(id: updated.rulesetId)
            currentEncounterState = updated.encounterState
            currentClaimTimeoutMinutes = updated.claimTimeoutMinutes
            currentIsInviteOnly = updated.isInviteOnly
            return state()!
        }

        let library = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        currentRulesetId = library.id
        currentLibrary = library
        currentEncounterState = .new
        currentClaimTimeoutMinutes = max(-1, claimTimeoutMinutes ?? 5)
        currentIsInviteOnly = isInviteOnly ?? false
        currentUserdataFiles = []
        await savePersistedStateIfNeeded()
        return state()!
    }

    private func savePersistedStateIfNeeded() async {
        guard persistChanges, let database else { return }
        do {
            currentCampaignID = try await DatabasePersistence.upsertCampaignMetadata(
                name: currentName,
                rulesetId: currentRulesetId,
                claimTimeoutMinutes: currentClaimTimeoutMinutes,
                isInviteOnly: currentIsInviteOnly,
                on: database
            )
            if let currentCampaignID {
                try await DatabasePersistence.updateCampaignUserDataFiles(
                    campaignID: currentCampaignID,
                    files: currentUserdataFiles,
                    on: database
                )
            }
        } catch {
            print("Failed to persist campaign metadata:", error)
        }
    }

    func updateUserdataFiles(_ files: [String]) async throws -> CampaignState {
        guard let database, let currentCampaignID else {
            throw Abort(.internalServerError, reason: "Database is not configured.")
        }
        currentUserdataFiles = normalizeUserdataFiles(files)
        try await DatabasePersistence.updateCampaignUserDataFiles(
            campaignID: currentCampaignID,
            files: currentUserdataFiles,
            on: database
        )
        return state()!
    }

    func availableUserdataFiles() -> [String] {
        currentUserdataFiles
    }

    private func normalizeUserdataFiles(_ files: [String]) -> [String] {
        let normalized = files.compactMap { file -> String? in
            let trimmed = file.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return nil }
            return URL(fileURLWithPath: trimmed).lastPathComponent
        }
        return Array(Set(normalized)).sorted { lhs, rhs in
            lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
        }
    }
}
