import Foundation
import Vapor

struct TacticalMapState: Content, Codable, Equatable {
    let version: Int
    let imagePath: String
    let grid: TacticalMapGrid
    let blockedTiles: [TacticalMapPoint]
    let terrain: TacticalTerrainState
    let elevation: TacticalElevationState
    let mapPresentation: TacticalMapPresentation
}

struct TacticalMapGrid: Content, Codable, Equatable {
    let eastWestSquareCount: Int
    let northSouthSquareCount: Int
    let squareSizeFt: Double
    let coordinateConvention: TacticalCoordinateConvention
}

struct TacticalCoordinateConvention: Content, Codable, Equatable {
    let origin: String
}

struct TacticalMapPoint: Content, Codable, Equatable, Hashable {
    let x: Int
    let y: Int
}

struct TacticalTerrainState: Content, Codable, Equatable {
    let defaultType: String
    let overrides: [TacticalTerrainOverride]
}

struct TacticalTerrainOverride: Content, Codable, Equatable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let type: String
}

struct TacticalElevationState: Content, Codable, Equatable {
    let defaultHeightFt: Double
    let overrides: [TacticalElevationOverride]
}

struct TacticalElevationOverride: Content, Codable, Equatable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let heightFt: Double
}

struct TacticalMapPresentation: Content, Codable, Equatable {
    let sideWallColor: TacticalColor
}

struct TacticalColor: Content, Codable, Equatable {
    let r: Double
    let g: Double
    let b: Double
    let a: Double
}

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
