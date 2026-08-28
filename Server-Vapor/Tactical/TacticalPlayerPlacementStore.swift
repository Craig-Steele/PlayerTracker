import Foundation

actor TacticalPlayerPlacementStore {
    private let storageDirectory: URL
    private var overrides: [UUID: TacticalPlayerPlacementBounds?] = [:]
    private var loadedCampaigns: Set<UUID> = []

    init(storageDirectory: URL = AppPaths.appDataDirectory().appendingPathComponent("tactical-placement", isDirectory: true)) {
        self.storageDirectory = storageDirectory
    }

    func override(for campaignID: UUID) -> TacticalPlayerPlacementBounds?? {
        loadIfNeeded(campaignID: campaignID)
        return overrides[campaignID]
    }

    func set(_ bounds: TacticalPlayerPlacementBounds?, for campaignID: UUID) throws {
        loadedCampaigns.insert(campaignID)
        overrides[campaignID] = bounds
        try persist(campaignID: campaignID)
    }

    func clear(for campaignID: UUID) throws {
        loadedCampaigns.insert(campaignID)
        overrides.removeValue(forKey: campaignID)
        try? FileManager.default.removeItem(at: fileURL(for: campaignID))
    }

    private func loadIfNeeded(campaignID: UUID) {
        guard loadedCampaigns.insert(campaignID).inserted else { return }
        guard let data = try? Data(contentsOf: fileURL(for: campaignID)),
              let record = try? JSONDecoder().decode(Record.self, from: data) else { return }
        overrides[campaignID] = record.bounds
    }

    private func persist(campaignID: UUID) throws {
        try FileManager.default.createDirectory(at: storageDirectory, withIntermediateDirectories: true)
        try JSONEncoder().encode(Record(bounds: overrides[campaignID] ?? nil))
            .write(to: fileURL(for: campaignID), options: .atomic)
    }

    private func fileURL(for campaignID: UUID) -> URL {
        storageDirectory.appendingPathComponent("\(campaignID.uuidString).json")
    }

    private struct Record: Codable {
        let bounds: TacticalPlayerPlacementBounds?
    }
}
