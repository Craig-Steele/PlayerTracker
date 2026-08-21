import Foundation
import Vapor

struct TacticalMapState: Content, Codable {
    let schemaVersion: Int
    let mapId: String
    let imagePath: String
    let gridWidth: Int
    let gridHeight: Int
    let squareSizeFt: Double
    let defaultHeightFt: Double
    let squareHeights: [Double]
    let blockedTiles: [TacticalMapPoint]
}

struct TacticalMapPoint: Content, Codable, Hashable {
    let x: Int
    let y: Int
}

actor TacticalMapStore {
    private let mapSourceURL: URL
    private var cachedMapState: TacticalMapState?

    init(mapSourceURL: URL = AppPaths.tacticalMapSourceURL()) {
        self.mapSourceURL = mapSourceURL
    }

    func mapState() async throws -> TacticalMapState {
        if let cachedMapState {
            return cachedMapState
        }

        let source = try loadSource()
        let state = buildMapState(from: source)
        cachedMapState = state
        return state
    }

    func isBlocked(squareX: Int, squareY: Int) async throws -> Bool {
        let state = try await mapState()
        return state.blockedTiles.contains(TacticalMapPoint(x: squareX, y: squareY))
    }

    private func loadSource() throws -> TacticalMapSource {
        guard FileManager.default.fileExists(atPath: mapSourceURL.path) else {
            throw Abort(.internalServerError, reason: "Tactical map source not found.")
        }
        let data = try Data(contentsOf: mapSourceURL)
        return try JSONDecoder().decode(TacticalMapSource.self, from: data)
    }

    private func buildMapState(from source: TacticalMapSource) -> TacticalMapState {
        let heights = buildSquareHeights(from: source)
        let blockedTiles = source.blockedTiles?.map { TacticalMapPoint(x: $0.x, y: $0.y) } ?? []
        return TacticalMapState(
            schemaVersion: 1,
            mapId: source.mapId,
            imagePath: source.imagePath,
            gridWidth: source.gridWidth,
            gridHeight: source.gridHeight,
            squareSizeFt: source.squareSizeFt,
            defaultHeightFt: source.defaultHeightFt,
            squareHeights: heights,
            blockedTiles: blockedTiles
        )
    }

    private func buildSquareHeights(from source: TacticalMapSource) -> [Double] {
        var heights = Array(repeating: source.defaultHeightFt, count: source.gridWidth * source.gridHeight)
        guard let heightOverrides = source.heightOverrides else {
            return heights
        }

        for override in heightOverrides {
            let width = max(1, override.width)
            let height = max(1, override.height)
            for x in override.x..<(override.x + width) {
                for y in override.y..<(override.y + height) {
                    guard x >= 0, x < source.gridWidth, y >= 0, y < source.gridHeight else {
                        continue
                    }
                    heights[(y * source.gridWidth) + x] = override.heightFt
                }
            }
        }
        return heights
    }
}

private struct TacticalMapSource: Codable {
    let version: Int
    let imagePath: String
    let gridWidth: Int
    let gridHeight: Int
    let squareSizeFt: Double
    let defaultHeightFt: Double
    let heightOverrides: [TacticalMapHeightOverride]?
    let blockedTiles: [TacticalMapSourcePoint]?
}

private struct TacticalMapHeightOverride: Codable {
    let x: Int
    let y: Int
    let width: Int
    let height: Int
    let heightFt: Double
}

private struct TacticalMapSourcePoint: Codable {
    let x: Int
    let y: Int
}

private extension TacticalMapSource {
    var mapId: String {
        URL(fileURLWithPath: imagePath).deletingPathExtension().lastPathComponent
    }
}
