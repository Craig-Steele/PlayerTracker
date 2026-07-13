import Foundation

final class TacticalSessionStore {
    private var sessions: [UUID: TacticalSessionInfo] = [:]

    func upsert(_ session: TacticalSessionInfo) {
        sessions[session.sessionId] = session
    }

    func session(for id: UUID) -> TacticalSessionInfo? {
        sessions[id]
    }
}
