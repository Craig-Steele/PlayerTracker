import Foundation

enum TacticalMapStoreError: Error, Equatable {
    case mapSourceNotFound(URL)
    case imagePathMissing
    case mapImageNotFound(URL)
}

struct TacticalMapStore {
    let mapSourceURL: URL

    init(mapSourceURL: URL = AppPaths.tacticalMapSourceURL()) {
        self.mapSourceURL = mapSourceURL
    }

    func load() throws -> TacticalMapState {
        guard FileManager.default.fileExists(atPath: mapSourceURL.path) else {
            throw TacticalMapStoreError.mapSourceNotFound(mapSourceURL)
        }

        let data = try Data(contentsOf: mapSourceURL)
        let map = try JSONDecoder().decode(TacticalMapState.self, from: data)
        _ = try imageURL(for: map)
        return map
    }

    func imageURL(for map: TacticalMapState) throws -> URL {
        let imagePath = map.imagePath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !imagePath.isEmpty else {
            throw TacticalMapStoreError.imagePathMissing
        }

        let imageURL = mapSourceURL
            .deletingLastPathComponent()
            .appendingPathComponent(imagePath)

        guard FileManager.default.fileExists(atPath: imageURL.path) else {
            throw TacticalMapStoreError.mapImageNotFound(imageURL)
        }
        return imageURL
    }
}
