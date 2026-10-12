import Foundation

actor TacticalMapSelectionStore {
    private let storageDirectory: URL
    private var selectedMapIDs: [UUID: String] = [:]
    private var importedMaps: [UUID: [String: ImportedMap]] = [:]

    init(storageDirectory: URL = AppPaths.appDataDirectory().appendingPathComponent("tactical-maps", isDirectory: true)) {
        self.storageDirectory = storageDirectory
    }

    struct ImportedMap: Sendable {
        let id: String
        let name: String
        let map: TacticalMapState
        let imageData: Data
    }

    func selectedMapID(for campaignID: UUID, persistedMapID: String?, defaultMapID: String) -> String {
        selectedMapIDs[campaignID] ?? persistedMapID ?? defaultMapID
    }

    func select(mapID: String, for campaignID: UUID) {
        selectedMapIDs[campaignID] = mapID
    }

    func importMap(name: String, map: TacticalMapState, imageData: Data, for campaignID: UUID) throws -> ImportedMap {
        let imported = ImportedMap(
            id: "imported-\(UUID().uuidString)",
            name: name,
            map: map,
            imageData: imageData
        )
        let campaignDirectory = storageDirectory.appendingPathComponent(campaignID.uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: campaignDirectory, withIntermediateDirectories: true)
        let record = ImportedMapRecord(name: imported.name, map: imported.map)
        try JSONEncoder().encode(record).write(to: campaignDirectory.appendingPathComponent("\(imported.id).json"))
        try imageData.write(to: campaignDirectory.appendingPathComponent("\(imported.id).png"))
        importedMaps[campaignID, default: [:]][imported.id] = imported
        selectedMapIDs[campaignID] = imported.id
        return imported
    }

    func importedMap(mapID: String, for campaignID: UUID) -> ImportedMap? {
        if let imported = importedMaps[campaignID]?[mapID] {
            return imported
        }
        let campaignDirectory = storageDirectory.appendingPathComponent(campaignID.uuidString, isDirectory: true)
        guard let recordData = try? Data(contentsOf: campaignDirectory.appendingPathComponent("\(mapID).json")),
              let record = try? JSONDecoder().decode(ImportedMapRecord.self, from: recordData),
              let imageData = try? Data(contentsOf: campaignDirectory.appendingPathComponent("\(mapID).png")) else {
            return nil
        }
        let imported = ImportedMap(id: mapID, name: record.name, map: record.map, imageData: imageData)
        importedMaps[campaignID, default: [:]][mapID] = imported
        return imported
    }

    func importedSummaries(for campaignID: UUID, selectedMapID: String) -> [TacticalMapSummary] {
        (importedMaps[campaignID] ?? [:]).values
            .sorted { $0.name < $1.name }
            .map { TacticalMapSummary(id: $0.id, name: $0.name, selected: $0.id == selectedMapID) }
    }

    private struct ImportedMapRecord: Codable {
        let name: String
        let map: TacticalMapState
    }
}
