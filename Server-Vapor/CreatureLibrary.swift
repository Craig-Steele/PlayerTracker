import Foundation

actor CreatureLibraryStore {
    static let shared = CreatureLibraryStore()

    private var cache: [String: [CreatureLibraryCreature]] = [:]

    func library(
        rulesetId: String,
        rulesetLabel: String,
        query: String? = nil,
        limit: Int = 50
    ) throws -> CreatureLibraryResponse {
        let allCreatures = try creatures(for: rulesetId)
        let trimmedQuery = query?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedQuery = trimmedQuery?.lowercased()
        let filtered = allCreatures.filter { creature in
            guard let normalizedQuery, !normalizedQuery.isEmpty else {
                return true
            }
            return matchesQuery(normalizedQuery, creature: creature)
        }
        let safeLimit = max(1, min(limit, 200))
        let creatures = Array(filtered.prefix(safeLimit))
        return CreatureLibraryResponse(
            rulesetId: rulesetId,
            rulesetLabel: rulesetLabel,
            query: trimmedQuery?.nonEmpty,
            totalMatches: filtered.count,
            hasMore: filtered.count > creatures.count,
            creatures: creatures
        )
    }

    func invalidate(rulesetId: String? = nil) {
        if let rulesetId {
            cache.removeValue(forKey: rulesetId)
        } else {
            cache.removeAll()
        }
    }

    private func creatures(for rulesetId: String) throws -> [CreatureLibraryCreature] {
        if let cached = cache[rulesetId] {
            return cached
        }
        let loaded = try loadCreatures(for: rulesetId)
        cache[rulesetId] = loaded
        return loaded
    }

    private func loadCreatures(for rulesetId: String) throws -> [CreatureLibraryCreature] {
        let ruleset = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        var creaturesByID: [String: CreatureLibraryCreature] = [:]

        try loadBuiltinCreatures(for: ruleset, rulesetId: rulesetId).forEach { creature in
            creaturesByID[creature.id] = creature
        }
        try loadLocalCreatures(for: rulesetId).forEach { creature in
            creaturesByID[creature.id] = creature
        }

        return creaturesByID.values.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    private func loadBuiltinCreatures(
        for ruleset: RuleSetLibrary,
        rulesetId: String
    ) throws -> [CreatureLibraryCreature] {
        guard let reference = ruleset.creatureLibrary?.file.nonEmpty else {
            return []
        }

        let directory = AppPaths.webClientDirectory().appendingPathComponent("rulesets", isDirectory: true)
        let url = directory.appendingPathComponent(reference, isDirectory: false)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return []
        }

        let file = try loadBuiltinFile(from: url)
        if let fileRulesetId = trimmedNonEmpty(file.rulesetId),
           fileRulesetId != rulesetId {
            return []
        }

        return file.creatures.enumerated().map { index, record in
            normalizeCreature(
                record,
                rulesetId: rulesetId,
                fallbackIDSeed: "\(file.id)-\(index)",
                source: nil
            )
        }
    }

    private func loadLocalCreatures(for rulesetId: String) throws -> [CreatureLibraryCreature] {
        let directory = AppPaths.userDataDirectory(rulesetId: rulesetId)
        guard FileManager.default.fileExists(atPath: directory.path) else {
            return []
        }

        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )) ?? []

        return files
            .filter { $0.pathExtension.lowercased() == "json" }
            .filter { url in
                let lowercasedName = url.deletingPathExtension().lastPathComponent.lowercased()
                return lowercasedName != "index" && lowercasedName != "manifest"
            }
            .compactMap { url -> CreatureLibraryCreature? in
                guard let data = try? Data(contentsOf: url),
                      let record = try? JSONDecoder().decode(CreatureLibraryRecord.self, from: data) else {
                    return nil
                }
                return normalizeCreature(
                    record,
                    rulesetId: rulesetId,
                    fallbackIDSeed: url.deletingPathExtension().lastPathComponent,
                    source: record.source
                )
            }
    }

    private func loadBuiltinFile(from url: URL) throws -> BuiltinCreatureLibraryFile {
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(BuiltinCreatureLibraryFile.self, from: data)
    }

    private func normalizeCreature(
        _ record: CreatureLibraryRecord,
        rulesetId: String,
        fallbackIDSeed: String,
        source: String?
    ) -> CreatureLibraryCreature {
        let normalizedSource = trimmedNonEmpty(source)
        let creatureID = trimmedNonEmpty(record.id)
            ?? makeCreatureID(rulesetId: rulesetId, seed: fallbackIDSeed, name: record.name)
        let stats = record.stats ?? makeStats(from: record.hp)
        return CreatureLibraryCreature(
            id: creatureID,
            name: record.name,
            cr: record.cr,
            alignment: record.alignment,
            type: normalizeCreatureType(record.type),
            size: record.size,
            hp: record.hp,
            ac: record.ac,
            initiativeBonus: record.initiativeBonus,
            source: normalizedSource,
            referenceUrl: record.referenceUrl,
            notes: record.notes,
            tags: record.tags,
            stats: stats
        )
    }

    private func normalizeCreature(
        _ record: BuiltinCreatureRecord,
        rulesetId: String,
        fallbackIDSeed: String,
        source: String?
    ) -> CreatureLibraryCreature {
        let creatureID = trimmedNonEmpty(record.id)
            ?? makeCreatureID(rulesetId: rulesetId, seed: fallbackIDSeed, name: record.name)
        let stats = record.stats ?? makeStats(from: record.hp)
        return CreatureLibraryCreature(
            id: creatureID,
            name: record.name,
            cr: record.cr,
            alignment: record.alignment,
            type: normalizeCreatureType(record.type),
            size: record.size,
            hp: record.hp,
            ac: record.ac,
            initiativeBonus: record.initiativeBonus,
            source: trimmedNonEmpty(source),
            referenceUrl: record.referenceUrl,
            notes: record.notes,
            tags: record.tags,
            stats: stats
        )
    }

    private func matchesQuery(_ query: String, creature: CreatureLibraryCreature) -> Bool {
        let searchableFields = [
            creature.name,
            creature.cr,
            creature.alignment,
            creature.type,
            creature.size,
            creature.source,
            creature.referenceUrl,
            creature.notes,
            creature.tags?.joined(separator: " "),
            creature.hp.map(String.init),
            creature.ac.map(String.init),
            creature.initiativeBonus.map(String.init)
        ]
        .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
        .lowercased()
        return searchableFields.contains(query)
    }

    private func makeCreatureID(rulesetId: String, seed: String, name: String) -> String {
        let normalized = "\(rulesetId)-\(seed)-\(name)"
        let slug = normalized
            .lowercased()
            .replacingOccurrences(of: #"[^a-z0-9]+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return slug.isEmpty ? "\(rulesetId)-creature" : slug
    }

    private func makeStats(from hp: Int?) -> [StatEntry]? {
        guard let hp else { return nil }
        return [StatEntry(key: "HP", current: hp, max: hp)]
    }

    private func normalizeRulesetID(_ rulesetId: String?) -> String {
        trimmedNonEmpty(rulesetId) ?? ""
    }

    private func normalizeCreatureType(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }
        let collapsedCommas = trimmed.replacingOccurrences(
            of: #"\s*,\s*"#,
            with: ", ",
            options: .regularExpression
        )
        let collapsedParens = collapsedCommas
            .replacingOccurrences(of: "( ", with: "(")
            .replacingOccurrences(of: " )", with: ")")
        return collapsedParens
    }

    private func trimmedNonEmpty(_ value: String?) -> String? {
        guard let value else {
            return nil
        }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

private struct BuiltinCreatureLibraryFile: Decodable {
    let id: String
    let label: String
    let rulesetId: String?
    let creatures: [BuiltinCreatureRecord]
}

private struct BuiltinCreatureRecord: Decodable {
    let id: String?
    let name: String
    let cr: String?
    let alignment: String?
    let type: String?
    let size: String?
    let hp: Int?
    let ac: Int?
    let initiativeBonus: Int?
    let referenceUrl: String?
    let notes: String?
    let tags: [String]?
    let stats: [StatEntry]?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case cr
        case alignment
        case type
        case size
        case hp
        case ac
        case initiativeBonus = "init"
        case referenceUrl = "url"
        case notes
        case tags
        case stats
    }
}

private struct CreatureLibraryRecord: Decodable {
    let id: String?
    let name: String
    let cr: String?
    let alignment: String?
    let type: String?
    let size: String?
    let hp: Int?
    let ac: Int?
    let initiativeBonus: Int?
    let source: String?
    let referenceUrl: String?
    let notes: String?
    let tags: [String]?
    let stats: [StatEntry]?
}

private extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
