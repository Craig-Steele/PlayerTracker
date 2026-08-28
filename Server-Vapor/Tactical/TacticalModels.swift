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
    let playerPlacement: TacticalPlayerPlacement?

    init(
        version: Int,
        imagePath: String,
        grid: TacticalMapGrid,
        blockedTiles: [TacticalMapPoint],
        terrain: TacticalTerrainState,
        elevation: TacticalElevationState,
        mapPresentation: TacticalMapPresentation,
        playerPlacement: TacticalPlayerPlacement? = nil
    ) {
        self.version = version
        self.imagePath = imagePath
        self.grid = grid
        self.blockedTiles = blockedTiles
        self.terrain = terrain
        self.elevation = elevation
        self.mapPresentation = mapPresentation
        self.playerPlacement = playerPlacement
    }
}

struct TacticalPlayerPlacement: Content, Codable, Equatable {
    let defaultBounds: TacticalPlayerPlacementBounds?
}

struct TacticalPlayerPlacementBounds: Content, Codable, Equatable {
    let west: Int
    let east: Int
    let south: Int
    let north: Int
}

struct TacticalPlayerPlacementResponse: Content, Codable, Equatable {
    let bounds: TacticalPlayerPlacementBounds?
    let isOverride: Bool
}

struct TacticalPlayerPlacementUpdateRequest: Content, Codable {
    let bounds: TacticalPlayerPlacementBounds?
    let useMapDefault: Bool?
}

struct TacticalMapSummary: Content, Codable, Equatable {
    let id: String
    let name: String
    let selected: Bool
}

struct TacticalMapSelectionRequest: Content, Codable {
    let mapID: String
}

struct TacticalMapImportRequest: Content, Codable {
    let filename: String
    let imageBase64: String
    let map: TacticalMapState
}

struct TacticalMapArchiveImportRequest: Content, Codable {
    let filename: String
    let archiveBase64: String
}

struct TacticalMapGrid: Content, Codable, Equatable {
    let eastWestSquareCount: Int
    let northSouthSquareCount: Int
    let squareSizeFt: Double
    let coordinateConvention: TacticalCoordinateConvention
    let boundaryBehavior: String?

    init(
        eastWestSquareCount: Int,
        northSouthSquareCount: Int,
        squareSizeFt: Double,
        coordinateConvention: TacticalCoordinateConvention,
        boundaryBehavior: String? = nil
    ) {
        self.eastWestSquareCount = eastWestSquareCount
        self.northSouthSquareCount = northSouthSquareCount
        self.squareSizeFt = squareSizeFt
        self.coordinateConvention = coordinateConvention
        self.boundaryBehavior = boundaryBehavior
    }
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
    let outsideMapFill: String?
    let terrainBoundary: String?

    init(
        sideWallColor: TacticalColor,
        outsideMapFill: String? = nil,
        terrainBoundary: String? = nil
    ) {
        self.sideWallColor = sideWallColor
        self.outsideMapFill = outsideMapFill
        self.terrainBoundary = terrainBoundary
    }
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

struct TacticalTokenSnapshot: Content, Codable, Equatable, Sendable {
    let id: String
    let characterId: UUID
    let displayName: String
    let ownerName: String?
    let tokenDescription: String?
    let conditions: [String]
    let ownerId: String?
    let team: String?
    let x: Double
    let y: Double
    let z: Double
    let isHidden: Bool
}

struct TacticalTokenUpdateEvent: Content, Codable, Sendable {
    let token: TacticalTokenSnapshot
}

struct TacticalPlacementRequest: Content, Codable {
    let characterId: UUID
    let x: Int
    let y: Int
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
