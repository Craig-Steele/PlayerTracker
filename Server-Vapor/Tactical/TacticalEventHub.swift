import Foundation
import Vapor

final class TacticalEventHub {
    private var listeners: [UUID: (TacticalEventEnvelope) -> Void] = [:]

    func addListener(_ listener: @escaping (TacticalEventEnvelope) -> Void) -> UUID {
        let id = UUID()
        listeners[id] = listener
        return id
    }

    func removeListener(_ id: UUID) {
        listeners[id] = nil
    }

    func broadcast(_ event: TacticalEventEnvelope) {
        for listener in listeners.values {
            listener(event)
        }
    }
}
