import Foundation
import Vapor

struct TacticalMapState: Content, Codable, Equatable {
    static let formatIdentifier = "TacticalTableTop.Map"
    static let currentFormatVersion = 1

    let format: String
    let version: Int
    let imagePath: String
    let grid: TacticalMapGrid
    let blockedTiles: [TacticalMapPoint]
    let terrain: TacticalTerrainState
    let elevation: TacticalElevationState
    let edges: [TacticalMapEdge]?
    let mapPresentation: TacticalMapPresentation
    let playerPlacement: TacticalPlayerPlacement?
    let stickers: [TacticalMapSticker]?

    init(
        format: String = TacticalMapState.formatIdentifier,
        version: Int = TacticalMapState.currentFormatVersion,
        imagePath: String,
        grid: TacticalMapGrid,
        blockedTiles: [TacticalMapPoint],
        terrain: TacticalTerrainState,
        elevation: TacticalElevationState,
        edges: [TacticalMapEdge]? = nil,
        mapPresentation: TacticalMapPresentation,
        playerPlacement: TacticalPlayerPlacement? = nil,
        stickers: [TacticalMapSticker]? = nil
    ) {
        self.format = format
        self.version = version
        self.imagePath = imagePath
        self.grid = grid
        self.blockedTiles = blockedTiles
        self.terrain = terrain
        self.elevation = elevation
        self.edges = edges
        self.mapPresentation = mapPresentation
        self.playerPlacement = playerPlacement
        self.stickers = stickers
    }

    private enum CodingKeys: String, CodingKey {
        case format, version, imagePath, grid, blockedTiles, terrain, elevation, edges, mapPresentation, playerPlacement, stickers
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        format = try container.decodeIfPresent(String.self, forKey: .format) ?? Self.formatIdentifier
        version = try container.decodeIfPresent(Int.self, forKey: .version) ?? Self.currentFormatVersion
        imagePath = try container.decode(String.self, forKey: .imagePath)
        grid = try container.decode(TacticalMapGrid.self, forKey: .grid)
        blockedTiles = try container.decode([TacticalMapPoint].self, forKey: .blockedTiles)
        terrain = try container.decode(TacticalTerrainState.self, forKey: .terrain)
        elevation = try container.decode(TacticalElevationState.self, forKey: .elevation)
        edges = try container.decodeIfPresent([TacticalMapEdge].self, forKey: .edges)
        mapPresentation = try container.decode(TacticalMapPresentation.self, forKey: .mapPresentation)
        playerPlacement = try container.decodeIfPresent(TacticalPlayerPlacement.self, forKey: .playerPlacement)
        stickers = try container.decodeIfPresent([TacticalMapSticker].self, forKey: .stickers)
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

struct TacticalMapSticker: Content, Codable, Equatable {
    let x: Int
    let y: Int
    let emoji: String
    let sizePercent: Int
    let opacityPercent: Int?
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

struct TacticalMapEdge: Content, Codable, Equatable {
    let axis: String
    let x: Int
    let y: Int
    let type: String
    let widthFt: Double?
    let initialState: String?
    let locked: Bool?
}

struct TacticalMapPresentation: Content, Codable, Equatable {
    let sideWallColor: TacticalColor
    let outsideMapFill: String?
    let terrainBoundary: String?
    let blankBackgroundColor: String?

    init(
        sideWallColor: TacticalColor,
        outsideMapFill: String? = nil,
        terrainBoundary: String? = nil,
        blankBackgroundColor: String? = nil
    ) {
        self.sideWallColor = sideWallColor
        self.outsideMapFill = outsideMapFill
        self.terrainBoundary = terrainBoundary
        self.blankBackgroundColor = blankBackgroundColor
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
