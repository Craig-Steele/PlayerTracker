import Foundation
import Vapor

actor EquipmentLibraryStore {
    static let shared = EquipmentLibraryStore()

    private var cache: [String: [EquipmentLibraryItem]] = [:]

    func library(
        rulesetId: String,
        rulesetLabel: String,
        query: String? = nil,
        limit: Int = 100
    ) throws -> EquipmentLibraryResponse {
        let allItems = try items(for: rulesetId)
        let trimmedQuery = query?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedQuery = trimmedQuery?.lowercased()
        let filtered = allItems.filter { item in
            guard let normalizedQuery, !normalizedQuery.isEmpty else {
                return true
            }
            return matchesQuery(normalizedQuery, item: item)
        }
        let items: [EquipmentLibraryItem]
        if limit <= 0 {
            items = filtered
        } else {
            let safeLimit = max(1, min(limit, 100))
            items = Array(filtered.prefix(safeLimit))
        }
        return EquipmentLibraryResponse(
            rulesetId: rulesetId,
            rulesetLabel: rulesetLabel,
            query: trimmedNonEmpty(trimmedQuery),
            totalMatches: filtered.count,
            hasMore: filtered.count > items.count,
            items: items
        )
    }

    func invalidate(rulesetId: String? = nil) {
        if let rulesetId {
            cache.keys
                .filter { $0.hasPrefix("\(rulesetId)::") }
                .forEach { cache.removeValue(forKey: $0) }
        } else {
            cache.removeAll()
        }
    }

    private func items(for rulesetId: String) throws -> [EquipmentLibraryItem] {
        let cacheKey = "\(rulesetId)::catalog"
        if let cached = cache[cacheKey] {
            return cached
        }
        let loaded = try loadItems(for: rulesetId).sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
        cache[cacheKey] = loaded
        return loaded
    }

    private func loadItems(for rulesetId: String) throws -> [EquipmentLibraryItem] {
        let ruleset = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        guard let reference = trimmedNonEmpty(ruleset.equipmentLibrary?.file) else {
            return []
        }

        let directory = AppPaths.webClientDirectory().appendingPathComponent("rulesets", isDirectory: true)
        let url = directory.appendingPathComponent(reference, isDirectory: false)
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
            return []
        }

        if isDirectory.boolValue {
            let files = (try? FileManager.default.contentsOfDirectory(
                at: url,
                includingPropertiesForKeys: nil
            )) ?? []
            return try files
                .filter { $0.pathExtension.lowercased() == "json" }
                .sorted { $0.lastPathComponent.localizedCaseInsensitiveCompare($1.lastPathComponent) == .orderedAscending }
                .flatMap { fileURL -> [EquipmentLibraryItem] in
                    let data = try Data(contentsOf: fileURL)
                    let file = try JSONDecoder().decode(BuiltinEquipmentLibraryFile.self, from: data)
                    return file.items.map { item in
                        normalizeEquipmentItem(
                            item,
                            rulesetId: rulesetId,
                            fallbackIDSeed: "\(file.id)-\(item.name)"
                        )
                    }
                }
        }

        let data = try Data(contentsOf: url)
        let file = try JSONDecoder().decode(BuiltinEquipmentLibraryFile.self, from: data)
        return file.items.map { item in
            normalizeEquipmentItem(item, rulesetId: rulesetId, fallbackIDSeed: "\(file.id)-\(item.name)")
        }
    }

    private func matchesQuery(_ query: String, item: EquipmentLibraryItem) -> Bool {
        let searchable = [
            item.id,
            item.name,
            item.source,
            item.notes
        ]
        .compactMap { $0?.lowercased() }
        return searchable.contains { $0.contains(query) }
    }

    private func normalizeEquipmentItem(
        _ item: BuiltinEquipmentLibraryItem,
        rulesetId: String,
        fallbackIDSeed: String
    ) -> EquipmentLibraryItem {
        let trimmedId = trimmedNonEmpty(item.id)
        return EquipmentLibraryItem(
            id: trimmedId ?? "\(rulesetId)-\(fallbackIDSeed.slugified())",
            name: trimmedNonEmpty(item.name) ?? item.name,
            value: item.value,
            weight: item.weight,
            url: trimmedNonEmpty(item.url),
            source: trimmedNonEmpty(item.source),
            notes: trimmedNonEmpty(item.notes)
        )
    }
}

private func trimmedNonEmpty(_ value: String?) -> String? {
    guard let value else { return nil }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

private struct BuiltinEquipmentLibraryFile: Content {
    let id: String
    let label: String
    let source: String?
    let generatedAt: String?
    let items: [BuiltinEquipmentLibraryItem]
}

private struct BuiltinEquipmentLibraryItem: Content {
    let id: String?
    let name: String
    let value: Double?
    let weight: Double?
    let url: String?
    let source: String?
    let notes: String?
}

private extension String {
    func slugified() -> String {
        lowercased().replacingOccurrences(of: #"[^a-z0-9]+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
    }
}
