import Foundation
import Vapor

struct ConditionDefinition: Content {
    let name: String
    let abbreviation: String?
    let description: String?
}

struct StatBlockDefinition: Content {
    let id: String
    let label: String
    let appliesTo: [String]?
    let stats: [String]
    let defaultBlock: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case label
        case appliesTo
        case stats
        case defaultBlock = "default"
    }
}

struct InitiativeRule: Content {
    let mode: String?
    let stats: [String]?
    let chart: [InitiativeChartEntry]?
}

struct InitiativeChartEntry: Content {
    let min: Int
    let max: Int?
    let bonus: Int
}

struct RuleSetLibrary: Content {
    let id: String
    let label: String
    let healthLabel: String?
    let icon: String?
    let rulesBaseUrl: String?
    let creatureLibrary: CreatureLibraryReference?
    let conditions: [ConditionDefinition]
    let stats: [String]?
    let statAliases: [String: String]?
    let statBlocks: [StatBlockDefinition]?
    let initiative: InitiativeRule?
    let supportsTempHp: Bool?
    let allowNegativeHealth: Bool?
    let license: String?
    let standardDie: String?
}

struct CreatureLibraryReference: Content {
    let file: String
}

enum RuleSetLibraryLoader {
    static func loadDefault() throws -> RuleSetLibrary {
        if let overridePath = Environment.get("CONDITION_LIBRARY_PATH") {
            return try load(from: URL(fileURLWithPath: overridePath))
        }

        let libraries = availableLibraries()
        if let first = libraries.first {
            return first
        }

        return emptyLibrary()
    }

    static func loadLibrary(id: String) throws -> RuleSetLibrary {
        if id == "none" {
            return emptyLibrary()
        }

        let libraries = availableLibraries()
        if let match = libraries.first(where: { $0.id == id }) {
            return match
        }

        throw Abort(.notFound, reason: "Ruleset not found.")
    }

    static func availableRulesets() -> [RulesetSummary] {
        let libraries = availableLibraries()
        var summaries = libraries.map { RulesetSummary(id: $0.id, label: $0.label) }
        summaries.append(RulesetSummary(id: "none", label: "-None-"))
        return summaries.sorted { $0.label < $1.label }
    }

    private static func availableLibraries() -> [RuleSetLibrary] {
        guard let source = availableConditionsDirectory() else {
            return []
        }

        var ordered: [RuleSetLibrary] = []
        var indexById: [String: Int] = [:]
        var dateById: [String: Date] = [:]

        let libraries = loadLibraries(in: source)
        for entry in libraries {
            if let index = indexById[entry.library.id] {
                let existingDate = dateById[entry.library.id] ?? .distantPast
                if entry.modified > existingDate {
                    ordered[index] = entry.library
                    dateById[entry.library.id] = entry.modified
                }
            } else {
                indexById[entry.library.id] = ordered.count
                dateById[entry.library.id] = entry.modified
                ordered.append(entry.library)
            }
        }

        return ordered.sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    private static func loadLibraries(in directory: URL) -> [(library: RuleSetLibrary, modified: Date)] {
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.contentModificationDateKey]
        ) else {
            return []
        }

        return files
            .filter { $0.pathExtension.lowercased() == "json" }
            .compactMap { url -> (library: RuleSetLibrary, modified: Date)? in
                guard let library = try? load(from: url) else { return nil }
                let modified: Date
                if let values = try? url.resourceValues(forKeys: [.contentModificationDateKey]),
                   let date = values.contentModificationDate {
                    modified = date
                } else {
                    modified = .distantPast
                }
                return (library: library, modified: modified)
            }
    }

    private static func load(from url: URL) throws -> RuleSetLibrary {
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(RuleSetLibrary.self, from: data)
    }

    private static func repositoryConditionsDirectory() -> URL? {
        let sourceURL = URL(fileURLWithPath: #filePath)
        let repositoryRoot = sourceURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let directory = repositoryRoot.appendingPathComponent("Client-Web/rulesets", isDirectory: true)
        return FileManager.default.fileExists(atPath: directory.path) ? directory : nil
    }

    private static func availableConditionsDirectory() -> URL? {
        repositoryConditionsDirectory()
    }

    private static func emptyLibrary() -> RuleSetLibrary {
        RuleSetLibrary(
            id: "none",
            label: "",
            healthLabel: nil,
            icon: nil,
            rulesBaseUrl: nil,
            creatureLibrary: nil,
            conditions: [],
            stats: [],
            statAliases: nil,
            statBlocks: nil,
            initiative: nil,
            supportsTempHp: nil,
            allowNegativeHealth: nil,
            license: nil,
            standardDie: nil
        )
    }
}
