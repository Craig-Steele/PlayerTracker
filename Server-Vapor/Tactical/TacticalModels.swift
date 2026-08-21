import Foundation
import Vapor

struct TacticalEncounterSnapshot: Content, Codable {
    let schemaVersion: Int
    let encounterId: UUID
    let name: String
    let roundNumber: Int
    let activeTokenId: String?
    let selectedTokenId: String?
    let tokens: [TacticalTokenSnapshot]
}

struct TacticalTokenSnapshot: Content, Codable {
    let id: String
    let displayName: String
    let ownerSessionId: UUID?
    let ownerDisplayName: String?
    let team: String?
    let x: Double
    let y: Double
    let z: Double
    let isHidden: Bool
}

struct TacticalCommandEnvelope: Content, Codable {
    let schemaVersion: Int
    let type: String
    let payload: [String: String]
}

struct TacticalCommandResponse: Content, Codable {
    let accepted: Bool
    let rejectionReason: String?
    let snapshot: TacticalEncounterSnapshot
}

struct TacticalEventEnvelope: Content, Codable {
    let schemaVersion: Int
    let type: String
    let payload: [String: String]
    let timestamp: Date
}

struct TacticalSessionInfo: Content, Codable {
    let sessionId: UUID
    let pairingCode: String
    let displayName: String
}
