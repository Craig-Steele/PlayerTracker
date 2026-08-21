import Foundation

actor TacticalSessionStore {
    private var sessions: [UUID: TacticalSessionInfo] = [:]
    private var encounters: [UUID: TacticalEncounterSnapshot] = [:]
    private var selectedTokenIDs: [UUID: [UUID: String]] = [:]

    func upsert(_ session: TacticalSessionInfo) {
        sessions[session.sessionId] = session
    }

    func session(for id: UUID) -> TacticalSessionInfo? {
        sessions[id]
    }

    func snapshot(for campaignID: UUID) -> TacticalEncounterSnapshot? {
        encounters[campaignID]
    }

    func upsertSnapshot(_ snapshot: TacticalEncounterSnapshot, for campaignID: UUID) {
        encounters[campaignID] = snapshot
    }

    func selectedTokenID(for campaignID: UUID, sessionID: UUID) -> String? {
        selectedTokenIDs[campaignID]?[sessionID]
    }

    func selectTokenID(_ tokenID: String?, for campaignID: UUID, sessionID: UUID) {
        var campaignSelections = selectedTokenIDs[campaignID] ?? [:]
        campaignSelections[sessionID] = tokenID
        selectedTokenIDs[campaignID] = campaignSelections
    }

    func clearSelections(for campaignID: UUID) {
        selectedTokenIDs[campaignID] = nil
    }
}
