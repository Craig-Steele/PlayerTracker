import Foundation

struct TacticalPersistence {
    static func encodeSnapshot(_ snapshot: TacticalEncounterSnapshot) throws -> Data {
        try JSONEncoder().encode(snapshot)
    }

    static func decodeSnapshot(_ data: Data) throws -> TacticalEncounterSnapshot {
        try JSONDecoder().decode(TacticalEncounterSnapshot.self, from: data)
    }
}
