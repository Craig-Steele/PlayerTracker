import Foundation
import Vapor

struct TacticalEncounterSnapshot: Content, Codable {
    let schemaVersion: Int
    let encounterId: UUID
    let name: String
    let roundNumber: Int
    let activeTokenId: String?
    let tokens: [TacticalTokenSnapshot]
}

struct TacticalTokenSnapshot: Content, Codable {
    let id: String
    let displayName: String
    let ownerId: String?
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
