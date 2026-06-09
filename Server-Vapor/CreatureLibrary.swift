import Foundation
import Vapor

struct CreatureLibraryConfiguration: @unchecked Sendable {
    var includeLocalCreatures: Bool
    var localCreaturesDirectoryProvider: ((String) -> URL)?

    init(
        includeLocalCreatures: Bool = true,
        localCreaturesDirectoryProvider: ((String) -> URL)? = nil
    ) {
        self.includeLocalCreatures = includeLocalCreatures
        self.localCreaturesDirectoryProvider = localCreaturesDirectoryProvider
    }
}

private struct CreatureLibraryConfigurationKey: StorageKey {
    typealias Value = CreatureLibraryConfiguration
}

extension Application {
    var creatureLibraryConfiguration: CreatureLibraryConfiguration {
        get {
            storage[CreatureLibraryConfigurationKey.self] ?? CreatureLibraryConfiguration()
        }
        set {
            storage[CreatureLibraryConfigurationKey.self] = newValue
        }
    }
}

actor CreatureLibraryStore {
    static let shared = CreatureLibraryStore()

    private var cache: [String: [CreatureLibraryCreature]] = [:]

    func library(
        rulesetId: String,
        rulesetLabel: String,
        query: String? = nil,
        limit: Int = 50,
        selectedLocalCreatureFiles: [String] = [],
        configuration: CreatureLibraryConfiguration = CreatureLibraryConfiguration()
    ) throws -> CreatureLibraryResponse {
        let allCreatures = try creatures(
            for: rulesetId,
            selectedLocalCreatureFiles: selectedLocalCreatureFiles,
            configuration: configuration
        )
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
            cache.keys
                .filter { $0.hasPrefix("\(rulesetId)::") }
                .forEach { cache.removeValue(forKey: $0) }
        } else {
            cache.removeAll()
        }
    }

    func availableLocalCreatureFiles(
        rulesetId: String,
        configuration: CreatureLibraryConfiguration = CreatureLibraryConfiguration()
    ) throws -> [String] {
        guard configuration.includeLocalCreatures else {
            return []
        }

        let directory = configuration.localCreaturesDirectoryProvider?(rulesetId)
            ?? AppPaths.userDataDirectory(rulesetId: rulesetId)
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
            .map(\.lastPathComponent)
            .sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private func creatures(
        for rulesetId: String,
        selectedLocalCreatureFiles: [String],
        configuration: CreatureLibraryConfiguration
    ) throws -> [CreatureLibraryCreature] {
        let cacheKey = cacheKey(
            rulesetId: rulesetId,
            selectedLocalCreatureFiles: selectedLocalCreatureFiles,
            configuration: configuration
        )
        if let cached = cache[cacheKey] {
            return cached
        }
        let loaded = try loadCreatures(
            for: rulesetId,
            selectedLocalCreatureFiles: selectedLocalCreatureFiles,
            configuration: configuration
        )
        cache[cacheKey] = loaded
        return loaded
    }

    private func cacheKey(
        rulesetId: String,
        selectedLocalCreatureFiles: [String],
        configuration: CreatureLibraryConfiguration
    ) -> String {
        let localKey = normalizeFileNames(selectedLocalCreatureFiles).joined(separator: "|")
        let includeLocalCreaturesKey = configuration.includeLocalCreatures ? "1" : "0"
        let localDirectoryKey = (configuration.localCreaturesDirectoryProvider?(rulesetId))?.path ?? ""
        return "\(rulesetId)::\(localKey)::\(includeLocalCreaturesKey)::\(localDirectoryKey)"
    }

    private func normalizeFileNames(_ fileNames: [String]) -> [String] {
        fileNames
            .compactMap { fileName -> String? in
                let trimmed = fileName.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return nil }
                return URL(fileURLWithPath: trimmed).lastPathComponent
            }
            .sorted { lhs, rhs in
                lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
            }
    }

    private func loadCreatures(
        for rulesetId: String,
        selectedLocalCreatureFiles: [String],
        configuration: CreatureLibraryConfiguration
    ) throws -> [CreatureLibraryCreature] {
        let ruleset = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        var creaturesByID: [String: CreatureLibraryCreature] = [:]

        try loadBuiltinCreatures(for: ruleset, rulesetId: rulesetId).forEach { creature in
            creaturesByID[creature.id] = creature
        }
        try loadLocalCreatures(
            for: ruleset,
            rulesetId: rulesetId,
            selectedLocalCreatureFiles: selectedLocalCreatureFiles,
            configuration: configuration
        ).forEach { creature in
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
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
            return []
        }

        if isDirectory.boolValue {
            return try loadBuiltinDirectory(from: url, rulesetId: rulesetId, ruleset: ruleset)
        }
        return try loadBuiltinFile(from: url, rulesetId: rulesetId, ruleset: ruleset)
    }

    private func loadLocalCreatures(
        for ruleset: RuleSetLibrary,
        rulesetId: String,
        selectedLocalCreatureFiles: [String],
        configuration: CreatureLibraryConfiguration
    ) throws -> [CreatureLibraryCreature] {
        guard configuration.includeLocalCreatures else {
            return []
        }
        let selectedFiles = Set(normalizeFileNames(selectedLocalCreatureFiles))
        guard !selectedFiles.isEmpty else {
            return []
        }

        let directory = configuration.localCreaturesDirectoryProvider?(rulesetId)
            ?? AppPaths.userDataDirectory(rulesetId: rulesetId)
        guard FileManager.default.fileExists(atPath: directory.path) else {
            return []
        }

        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )) ?? []

        return files
            .filter { $0.pathExtension.lowercased() == "json" }
            .filter { selectedFiles.contains($0.lastPathComponent) }
            .filter { url in
                let lowercasedName = url.deletingPathExtension().lastPathComponent.lowercased()
                return lowercasedName != "index" && lowercasedName != "manifest"
            }
            .flatMap { url -> [CreatureLibraryCreature] in
                guard let data = try? Data(contentsOf: url) else {
                    return []
                }
                if let file = try? JSONDecoder().decode(BuiltinCreatureLibraryFile.self, from: data) {
                    if let fileRulesetId = trimmedNonEmpty(file.rulesetId),
                       fileRulesetId != rulesetId {
                        return []
                    }
                    return file.creatures.enumerated().map { index, record in
                        normalizeCreature(
                            record,
                            rulesetId: rulesetId,
                            fallbackIDSeed: "\(file.id)-\(index)",
                            source: record.source,
                            initiativeRule: ruleset.initiative,
                            statAliases: ruleset.statAliases
                        )
                    }
                }
                if let record = try? JSONDecoder().decode(CreatureLibraryRecord.self, from: data) {
                    return [
                        normalizeCreature(
                            record,
                            rulesetId: rulesetId,
                            fallbackIDSeed: url.deletingPathExtension().lastPathComponent,
                            source: record.source,
                            initiativeRule: ruleset.initiative,
                            statAliases: ruleset.statAliases
                        )
                    ]
                }
                return []
            }
    }

    private func loadBuiltinFile(
        from url: URL,
        rulesetId: String,
        ruleset: RuleSetLibrary
    ) throws -> [CreatureLibraryCreature] {
        let data = try Data(contentsOf: url)
        let file = try JSONDecoder().decode(BuiltinCreatureLibraryFile.self, from: data)
        if let fileRulesetId = trimmedNonEmpty(file.rulesetId),
           fileRulesetId != rulesetId {
            return []
        }
        return file.creatures.enumerated().map { index, record in
            normalizeCreature(
                record,
                rulesetId: rulesetId,
                fallbackIDSeed: "\(file.id)-\(index)",
                source: record.source,
                initiativeRule: ruleset.initiative,
                statAliases: ruleset.statAliases
            )
        }
    }

    private func loadBuiltinDirectory(
        from directory: URL,
        rulesetId: String,
        ruleset: RuleSetLibrary
    ) throws -> [CreatureLibraryCreature] {
        let files = (try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )) ?? []

        return try files
            .filter { $0.pathExtension.lowercased() == "json" }
            .sorted { $0.lastPathComponent.localizedCaseInsensitiveCompare($1.lastPathComponent) == .orderedAscending }
            .flatMap { url -> [CreatureLibraryCreature] in
                let data = try Data(contentsOf: url)
                let file = try JSONDecoder().decode(BuiltinCreatureLibraryFile.self, from: data)
                if let fileRulesetId = trimmedNonEmpty(file.rulesetId),
                   fileRulesetId != rulesetId {
                    return []
                }
                return file.creatures.enumerated().map { index, record in
                    normalizeCreature(
                        record,
                        rulesetId: rulesetId,
                        fallbackIDSeed: "\(file.id)-\(index)",
                        source: record.source,
                        initiativeRule: ruleset.initiative,
                        statAliases: ruleset.statAliases
                    )
                }
            }
    }

    private func normalizeCreature(
        _ record: CreatureLibraryRecord,
        rulesetId: String,
        fallbackIDSeed: String,
        source: String?,
        initiativeRule: InitiativeRule?,
        statAliases: [String: String]?
    ) -> CreatureLibraryCreature {
        let normalizedSource = trimmedNonEmpty(source)
        let creatureID = trimmedNonEmpty(record.id)
            ?? makeCreatureID(rulesetId: rulesetId, seed: fallbackIDSeed, name: record.name)
        let stats = record.stats ?? record.traits ?? makeStats(from: record.hp)
        return CreatureLibraryCreature(
            id: creatureID,
            name: record.name,
            baseCreatureId: record.baseCreatureId,
            baseCreatureName: record.baseCreatureName,
            cr: record.cr,
            alignment: record.alignment,
            type: normalizeCreatureType(record.type),
            size: record.size,
            hp: record.hp,
            ac: record.ac,
            initiativeBonus: record.initiativeBonus ?? InitiativeRules.bonus(from: stats, rule: initiativeRule, aliases: statAliases),
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
        source: String?,
        initiativeRule: InitiativeRule?,
        statAliases: [String: String]?
    ) -> CreatureLibraryCreature {
        let creatureID = trimmedNonEmpty(record.id)
            ?? makeCreatureID(rulesetId: rulesetId, seed: fallbackIDSeed, name: record.name)
        let stats = record.stats ?? record.traits ?? makeStats(from: record.hp)
        return CreatureLibraryCreature(
            id: creatureID,
            name: record.name,
            baseCreatureId: record.baseCreatureId,
            baseCreatureName: record.baseCreatureName,
            cr: record.cr,
            alignment: record.alignment,
            type: normalizeCreatureType(record.type),
            size: record.size,
            hp: record.hp,
            ac: record.ac,
            initiativeBonus: record.initiativeBonus ?? InitiativeRules.bonus(from: stats, rule: initiativeRule, aliases: statAliases),
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
            creature.baseCreatureName,
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
    let baseCreatureId: String?
    let baseCreatureName: String?
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
    let traits: [StatEntry]?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case baseCreatureId
        case baseCreatureName
        case cr
        case alignment
        case type
        case size
        case hp
        case ac
        case initiativeBonus = "init"
        case source
        case referenceUrl = "url"
        case notes
        case tags
        case stats
        case traits
    }
}

private struct CreatureLibraryRecord: Decodable {
    let id: String?
    let name: String
    let baseCreatureId: String?
    let baseCreatureName: String?
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
    let traits: [StatEntry]?
}

private extension String {
    var nonEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
