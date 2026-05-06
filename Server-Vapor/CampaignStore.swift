import Foundation

actor CampaignStore {
    private var currentName: String
    private var currentRulesetId: String
    private var currentLibrary: RuleSetLibrary
    private var currentEncounterState: EncounterState
    private let persistChanges: Bool

    init(
        defaultLibrary: RuleSetLibrary,
        defaultName: String = "Campaign",
        restorePersistedState: Bool = true,
        persistChanges: Bool = true
    ) {
        self.persistChanges = persistChanges
        let persisted = restorePersistedState ? CampaignStore.loadPersistedState() : nil
        if let persisted {
            if let restoredLibrary = try? RuleSetLibraryLoader.loadLibrary(id: persisted.rulesetId) {
                self.currentName = persisted.name
                self.currentRulesetId = restoredLibrary.id
                self.currentLibrary = restoredLibrary
                self.currentEncounterState = .new
                if persistChanges {
                    CampaignStore.savePersistedState(
                        CampaignPersistedState(
                            name: self.currentName,
                            rulesetId: self.currentRulesetId,
                            encounterState: self.currentEncounterState
                        )
                    )
                }
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
        savePersistedStateIfNeeded(
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
        savePersistedStateIfNeeded(
            CampaignPersistedState(
                name: currentName,
                rulesetId: currentRulesetId,
                encounterState: currentEncounterState
            )
        )
        return state()
    }

    private func savePersistedStateIfNeeded(_ state: CampaignPersistedState) {
        guard persistChanges else { return }
        CampaignStore.savePersistedState(state)
    }

    private static func persistedStateDirectory() -> URL {
        AppPaths.appDataDirectory()
    }

    private static func persistedStateURL() -> URL {
        persistedStateDirectory().appendingPathComponent("campaign.json")
    }

    private static func loadPersistedState() -> CampaignPersistedState? {
        let url = persistedStateURL()
        guard let data = try? Data(contentsOf: url) else {
            return nil
        }
        return try? JSONDecoder().decode(CampaignPersistedState.self, from: data)
    }

    private static func savePersistedState(_ state: CampaignPersistedState) {
        let url = persistedStateURL()
        do {
            try FileManager.default.createDirectory(
                at: persistedStateDirectory(),
                withIntermediateDirectories: true
            )
            let data = try JSONEncoder().encode(state)
            try data.write(to: url, options: [.atomic])
        } catch {
            print("Failed to persist campaign state:", error)
        }
    }
}
