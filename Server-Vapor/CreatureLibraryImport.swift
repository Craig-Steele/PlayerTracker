import Foundation
import Vapor

enum CreatureLibraryImportService {
    static func importFiles(
        _ files: [CreatureLibraryImportFile],
        into destinationDirectory: URL,
        overwrite: Bool,
        rulesetId: String
    ) throws -> CreatureLibraryImportResponse {
        let fm = FileManager.default
        try fm.createDirectory(at: destinationDirectory, withIntermediateDirectories: true)
        let ruleset = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        let baseCreatures = try loadBaseCreatures(for: ruleset, rulesetId: rulesetId)

        var imported = 0
        var skipped = 0

        for file in files {
            let filename = sanitizeFilename(file.filename)
            guard !filename.isEmpty else {
                skipped += 1
                continue
            }

            guard let data = file.contents.data(using: .utf8),
                  let jsonObject = try? JSONSerialization.jsonObject(with: data),
                  let rawDict = jsonObject as? [String: Any] else {
                skipped += 1
                continue
            }

            guard let normalized = normalizeCreatureRecord(
                from: rawDict,
                baseCreatures: baseCreatures,
                initiativeRule: ruleset.initiative,
                statAliases: ruleset.statAliases
            ) else {
                skipped += 1
                continue
            }
            let outputURL = destinationDirectory.appendingPathComponent(filename)
            let outputData = try JSONSerialization.data(withJSONObject: normalized, options: [.prettyPrinted, .sortedKeys])

            if fm.fileExists(atPath: outputURL.path) {
                if let existingData = try? Data(contentsOf: outputURL), existingData == outputData {
                    skipped += 1
                    continue
                }
                if !overwrite {
                    skipped += 1
                    continue
                }
            }

            try outputData.write(to: outputURL, options: [.atomic])
            imported += 1
        }

        return CreatureLibraryImportResponse(
            rulesetId: destinationDirectory.lastPathComponent,
            destination: destinationDirectory.path,
            imported: imported,
            skipped: skipped
        )
    }

    private static func sanitizeFilename(_ filename: String) -> String {
        URL(fileURLWithPath: filename).lastPathComponent
    }

    private static func loadBaseCreatures(for ruleset: RuleSetLibrary, rulesetId: String) throws -> [CreatureLibraryCreature] {
        guard let reference = trimmedNonEmpty(ruleset.creatureLibrary?.file) else {
            return []
        }

        let directory = AppPaths.webClientDirectory().appendingPathComponent("rulesets", isDirectory: true)
        let url = directory.appendingPathComponent(reference, isDirectory: false)
        guard FileManager.default.fileExists(atPath: url.path) else {
            return []
        }

        let data = try Data(contentsOf: url)
        let file = try JSONDecoder().decode(BuiltinCreatureLibraryFile.self, from: data)
        return file.creatures.enumerated().map { index, record in
            normalizeBuiltinCreature(
                record,
                rulesetId: rulesetId,
                fallbackIDSeed: "\(file.id)-\(index)",
                initiativeRule: ruleset.initiative,
                statAliases: ruleset.statAliases
            )
        }
    }
}

private func normalizeCreatureRecord(
    from raw: [String: Any],
    baseCreatures: [CreatureLibraryCreature],
    initiativeRule: InitiativeRule?,
    statAliases: [String: String]?
) -> [String: Any]? {
    var normalized: [String: Any] = raw

    if let name = stringValue(raw["name"]) {
        normalized["name"] = name
    }
    if let id = stringValue(raw["id"]) {
        normalized["id"] = id
    }
    if let cr = stringValue(raw["cr"]) {
        normalized["cr"] = cr
    } else if let crNumber = intValue(raw["cr"]) {
        normalized["cr"] = String(crNumber)
    }
    if let alignment = stringValue(raw["alignment"]) {
        normalized["alignment"] = alignment
    }
    if let type = stringValue(raw["type"]) {
        normalized["type"] = type
    }
    if let size = stringValue(raw["size"]) {
        normalized["size"] = size
    }
    if let hp = intValue(raw["hp"]) {
        normalized["hp"] = hp
    }

    if let ac = raw["ac"] as? [String: Any] {
        if let value = intValue(ac["value"] ?? ac["current"] ?? ac["max"]) {
            normalized["ac"] = value
        } else {
            normalized.removeValue(forKey: "ac")
        }
    } else if let ac = intValue(raw["ac"]) {
        normalized["ac"] = ac
    } else {
        normalized.removeValue(forKey: "ac")
    }

    if let initiative = intValue(raw["initiativeBonus"] ?? raw["initiative"] ?? raw["init"]) {
        normalized["initiativeBonus"] = initiative
    } else {
        normalized.removeValue(forKey: "initiativeBonus")
    }

    let source = stringValue(raw["source"])
    let referenceUrl = stringValue(raw["referenceUrl"] ?? raw["url"])
    if let referenceUrl, isFileReference(referenceUrl) {
        normalized["referenceUrl"] = nil
        normalized["source"] = sourceDescription(from: source, referenceUrl: referenceUrl) ?? source
    } else {
        if let source {
            normalized["source"] = source
        }
        if let referenceUrl {
            normalized["referenceUrl"] = referenceUrl
        }
    }
    if let notes = stringValue(raw["notes"]) {
        normalized["notes"] = notes
    }
    if let tags = raw["tags"] as? [String], !tags.isEmpty {
        normalized["tags"] = tags
    } else if let kind = stringValue(raw["kind"]) {
        normalized["tags"] = [kind]
    }

    let baseCreature = resolveBaseCreature(from: normalized, baseCreatures: baseCreatures)
    if let baseCreature {
        normalized["baseCreatureId"] = baseCreature.id
        normalized["baseCreatureName"] = baseCreature.name
        inheritMissingFields(from: baseCreature, into: &normalized)
    }

    if normalized["initiativeBonus"] == nil,
       let initiativeRule,
       let stats = initiativeStats(from: normalized, baseCreature: baseCreature) {
        normalized["initiativeBonus"] = InitiativeRules.bonus(from: stats, rule: initiativeRule, aliases: statAliases)
    }

    if let baseCreature, isDuplicateOfBase(normalized, baseCreature: baseCreature) {
        let importedName = normalized["name"] as? String
        if normalizeCreatureName(importedName) == normalizeCreatureName(baseCreature.name) {
            return nil
        }
    }

    return normalized
}

private func inheritMissingFields(from baseCreature: CreatureLibraryCreature, into record: inout [String: Any]) {
    if record["cr"] == nil, let cr = baseCreature.cr {
        record["cr"] = cr
    }
    if record["alignment"] == nil, let alignment = baseCreature.alignment {
        record["alignment"] = alignment
    }
    if record["type"] == nil, let type = baseCreature.type {
        record["type"] = type
    }
    if record["size"] == nil, let size = baseCreature.size {
        record["size"] = size
    }
    if record["hp"] == nil, let hp = baseCreature.hp {
        record["hp"] = hp
    }
    if record["ac"] == nil, let ac = baseCreature.ac {
        record["ac"] = ac
    }
    if record["initiativeBonus"] == nil, let initiativeBonus = baseCreature.initiativeBonus {
        record["initiativeBonus"] = initiativeBonus
    }
}

private func resolveBaseCreature(from raw: [String: Any], baseCreatures: [CreatureLibraryCreature]) -> CreatureLibraryCreature? {
    let explicitCandidates = [
        stringValue(raw["baseCreatureName"]),
        stringValue(raw["baseCreature"]),
        stringValue(raw["derivedFrom"]),
        stringValue(raw["base"]),
        stringValue(raw["sourceCreature"])
    ]
    .compactMap { $0 }

    if let match = explicitCandidates
        .compactMap({ candidate in baseCreatures.first(where: { creaturesMatch(candidate, $0.name) }) })
        .first {
        return match
    }

    guard let importedName = stringValue(raw["name"]) else {
        return nil
    }

    let normalizedImportedName = normalizeCreatureName(importedName)
    guard !normalizedImportedName.isEmpty else {
        return nil
    }

    if let exactMatch = baseCreatures.first(where: { normalizeCreatureName($0.name) == normalizedImportedName }) {
        return exactMatch
    }

    let matches = baseCreatures.compactMap { creature -> (CreatureLibraryCreature, Int)? in
        let normalizedBaseName = normalizeCreatureName(creature.name)
        guard !normalizedBaseName.isEmpty else {
            return nil
        }
        guard normalizedImportedName == normalizedBaseName ||
            normalizedImportedName.hasSuffix(normalizedBaseName) ||
            normalizedImportedName.hasPrefix(normalizedBaseName) ||
            normalizedImportedName.contains(normalizedBaseName) ||
            normalizedBaseName.contains(normalizedImportedName) else {
            return nil
        }
        return (creature, normalizedBaseName.count)
    }

    return matches.max(by: { $0.1 < $1.1 })?.0
}

private func isDuplicateOfBase(_ raw: [String: Any], baseCreature: CreatureLibraryCreature) -> Bool {
    let importedSignature = creatureSignature(from: raw)
    let baseSignature = creatureSignature(from: baseCreature)
    return importedSignature == baseSignature
}

private func creatureSignature(from raw: [String: Any]) -> CreatureSignature {
    CreatureSignature(
        cr: stringValue(raw["cr"]),
        alignment: stringValue(raw["alignment"]),
        type: stringValue(raw["type"]),
        size: stringValue(raw["size"]),
        hp: intValue(raw["hp"]),
        ac: intValue(raw["ac"]),
        initiativeBonus: intValue(raw["initiativeBonus"] ?? raw["initiative"] ?? raw["init"])
    )
}

private func creatureSignature(from creature: CreatureLibraryCreature) -> CreatureSignature {
    CreatureSignature(
        cr: creature.cr,
        alignment: creature.alignment,
        type: creature.type,
        size: creature.size,
        hp: creature.hp,
        ac: creature.ac,
        initiativeBonus: creature.initiativeBonus
    )
}

private func normalizeCreatureName(_ value: String?) -> String {
    guard let value else {
        return ""
    }
    return value
        .lowercased()
        .replacingOccurrences(of: #"[^a-z0-9]+"#, with: "", options: .regularExpression)
}

private func creaturesMatch(_ lhs: String, _ rhs: String) -> Bool {
    normalizeCreatureName(lhs) == normalizeCreatureName(rhs)
}

private func isFileReference(_ referenceUrl: String) -> Bool {
    guard let url = URL(string: referenceUrl) else {
        return false
    }
    return url.scheme?.lowercased() == "file"
}

private func sourceDescription(from source: String?, referenceUrl: String) -> String? {
    guard let url = URL(string: referenceUrl) else {
        return trimmedNonEmpty(source)
    }

    let page = url.fragment.flatMap(pageNumber(from:))
    guard let page else {
        return trimmedNonEmpty(source)
    }

    let trimmedSource = trimmedNonEmpty(source)
    if let trimmedSource {
        return "\(trimmedSource), page \(page)"
    }
    return "page \(page)"
}

private func pageNumber(from fragment: String) -> String? {
    let match = fragment.range(of: #"page=(\d+)"#, options: .regularExpression)
    guard let match else {
        return nil
    }
    let value = String(fragment[match]).replacingOccurrences(of: "page=", with: "")
    return value.isEmpty ? nil : value
}

private func stringValue(_ value: Any?) -> String? {
    switch value {
    case let string as String:
        let trimmed = string.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    case let number as NSNumber:
        return number.stringValue
    default:
        return nil
    }
}

private func intValue(_ value: Any?) -> Int? {
    switch value {
    case let number as NSNumber:
        return number.intValue
    case let string as String:
        return Int(string.trimmingCharacters(in: .whitespacesAndNewlines))
    default:
        return nil
    }
}

private func trimmedNonEmpty(_ value: String?) -> String? {
    guard let value else {
        return nil
    }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

private func normalizeBuiltinCreature(
    _ record: BuiltinCreatureRecord,
    rulesetId: String,
    fallbackIDSeed: String,
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
            source: trimmedNonEmpty(record.source),
            referenceUrl: record.referenceUrl,
            notes: record.notes,
        tags: record.tags,
        stats: stats
    )
}

private func initiativeStats(from raw: [String: Any], baseCreature: CreatureLibraryCreature?) -> [StatEntry]? {
    if let stats = statEntries(from: raw["stats"]) {
        return stats
    }
    if let traits = statEntries(from: raw["traits"]) {
        return traits
    }
    if let statistics = statEntries(from: raw["statistics"]) {
        return statistics
    }
    if let abilities = statEntries(from: raw["abilities"]) {
        return abilities
    }
    if let abilityScores = statEntries(from: raw["abilityScores"]) {
        return abilityScores
    }
    if let scores = statEntries(from: raw["scores"]) {
        return scores
    }
    if let stats = baseCreature?.stats, !stats.isEmpty {
        return stats
    }
    if let hp = intValue(raw["hp"]) {
        return makeStats(from: hp)
    }
    return nil
}

private func statEntries(from value: Any?) -> [StatEntry]? {
    if let entries = value as? [StatEntry], !entries.isEmpty {
        return entries
    }
    if let dictionaries = value as? [[String: Any]] {
        let entries = dictionaries.compactMap(statEntry(from:))
        return entries.isEmpty ? nil : entries
    }
    if let dictionary = value as? [String: Any] {
        let entries = dictionary.compactMap { key, value in
            statEntry(key: key, value: value)
        }
        return entries.isEmpty ? nil : entries
    }
    return nil
}

private func statEntry(from value: [String: Any]) -> StatEntry? {
    let key = stringValue(value["key"]) ?? stringValue(value["name"]) ?? stringValue(value["stat"])
    let current = intValue(value["current"] ?? value["value"] ?? value["score"])
    let max = intValue(value["max"] ?? value["current"] ?? value["value"] ?? value["score"])
    guard let key, let current, let max else {
        return nil
    }
    return StatEntry(key: key, current: current, max: max)
}

private func statEntry(key: String, value: Any) -> StatEntry? {
    guard let current = intValue(value) else {
        return nil
    }
    let normalizedKey = key
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .uppercased()
    guard !normalizedKey.isEmpty else {
        return nil
    }
    return StatEntry(key: normalizedKey, current: current, max: current)
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

private struct CreatureSignature: Equatable {
    let cr: String?
    let alignment: String?
    let type: String?
    let size: String?
    let hp: Int?
    let ac: Int?
    let initiativeBonus: Int?
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
