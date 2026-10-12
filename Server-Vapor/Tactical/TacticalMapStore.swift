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
        try load(from: mapSourceURL)
    }

    func load(mapID: String) throws -> TacticalMapState {
        try load(from: sourceURL(for: mapID))
    }

    func catalog() throws -> [(id: String, name: String)] {
        let directory = mapSourceURL.deletingLastPathComponent()
        return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "json" && $0.lastPathComponent.hasSuffix(".map.json") }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .map { url in
                let name = url.deletingPathExtension().deletingPathExtension().lastPathComponent
                return (id: url.lastPathComponent, name: name)
            }
    }

    private func load(from sourceURL: URL) throws -> TacticalMapState {
        guard FileManager.default.fileExists(atPath: sourceURL.path) else {
            throw TacticalMapStoreError.mapSourceNotFound(sourceURL)
        }

        let data = try Data(contentsOf: sourceURL)
        let map = try JSONDecoder().decode(TacticalMapState.self, from: data)
        _ = try imageURL(for: map, sourceURL: sourceURL)
        return map
    }

    func imageURL(for map: TacticalMapState) throws -> URL {
        try imageURL(for: map, sourceURL: mapSourceURL)
    }

    func imageURL(for map: TacticalMapState, mapID: String) throws -> URL {
        try imageURL(for: map, sourceURL: sourceURL(for: mapID))
    }

    private func imageURL(for map: TacticalMapState, sourceURL: URL) throws -> URL {
        let imagePath = map.imagePath.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !imagePath.isEmpty else {
            throw TacticalMapStoreError.imagePathMissing
        }

        let imageURL = sourceURL
            .deletingLastPathComponent()
            .appendingPathComponent(imagePath)

        guard FileManager.default.fileExists(atPath: imageURL.path) else {
            throw TacticalMapStoreError.mapImageNotFound(imageURL)
        }
        return imageURL
    }

    private func sourceURL(for mapID: String) throws -> URL {
        let sourceURL = mapSourceURL.deletingLastPathComponent().appendingPathComponent(mapID)
        guard mapID.hasSuffix(".map.json"), !mapID.contains("/"), try catalog().contains(where: { $0.id == mapID }) else {
            throw TacticalMapStoreError.mapSourceNotFound(sourceURL)
        }
        return sourceURL
    }
}
