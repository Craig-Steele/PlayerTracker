#!/usr/bin/env swift

import Foundation

struct ImportConfiguration {
    let rulesetId: String
    let sourceDirectory: URL
    let destinationDirectory: URL
    let overwrite: Bool
}

struct CLIError: Error, CustomStringConvertible {
    let description: String
}

let arguments = Array(CommandLine.arguments.dropFirst())

func usage() -> String {
    """
    Usage:
      swift Scripts/import-creature-fixtures.swift --ruleset <id> [--source <dir>] [--destination <dir>] [--overwrite]

    Defaults:
      --source      Tests/PlayerTrackerTests/Fixtures/<ruleset>
      --destination <platform app data>/userdata/<ruleset>
    """
}

func parseConfiguration() throws -> ImportConfiguration {
    var rulesetId: String?
    var sourceDirectory: URL?
    var destinationDirectory: URL?
    var overwrite = false

    var index = 0
    while index < arguments.count {
        let argument = arguments[index]
        switch argument {
        case "--help", "-h":
            print(usage())
            exit(0)
        case "--ruleset":
            index += 1
            guard index < arguments.count else {
                throw CLIError(description: "--ruleset requires a value.")
            }
            rulesetId = arguments[index]
        case "--source":
            index += 1
            guard index < arguments.count else {
                throw CLIError(description: "--source requires a value.")
            }
            sourceDirectory = URL(fileURLWithPath: arguments[index], isDirectory: true)
        case "--destination":
            index += 1
            guard index < arguments.count else {
                throw CLIError(description: "--destination requires a value.")
            }
            destinationDirectory = URL(fileURLWithPath: arguments[index], isDirectory: true)
        case "--overwrite":
            overwrite = true
        default:
            if argument.hasPrefix("-") {
                throw CLIError(description: "Unknown argument: \(argument)\n\n\(usage())")
            }
        }
        index += 1
    }

    guard let rulesetId = rulesetId?.trimmingCharacters(in: .whitespacesAndNewlines),
          !rulesetId.isEmpty else {
        throw CLIError(description: "--ruleset is required.\n\n\(usage())")
    }

    let repoRoot = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()

    let resolvedSource = sourceDirectory ?? repoRoot
        .appendingPathComponent("Tests/PlayerTrackerTests/Fixtures", isDirectory: true)
        .appendingPathComponent(rulesetId, isDirectory: true)

    let resolvedDestination = destinationDirectory ?? defaultUserDataDirectory(rulesetId: rulesetId)

    return ImportConfiguration(
        rulesetId: rulesetId,
        sourceDirectory: resolvedSource,
        destinationDirectory: resolvedDestination,
        overwrite: overwrite
    )
}

func defaultUserDataDirectory(rulesetId: String) -> URL {
    let environment = ProcessInfo.processInfo.environment

    #if os(macOS)
    let root = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Roll4Initiative", isDirectory: true)
    #elseif os(Windows)
    let root = environmentDirectory("LOCALAPPDATA", environment: environment)
        .appendingPathComponent("Roll4Initiative", isDirectory: true)
    #else
    let root = xdgDirectory(environmentKey: "XDG_DATA_HOME", fallbackPath: ".local/share", environment: environment)
        .appendingPathComponent("Roll4Initiative", isDirectory: true)
    #endif

    return root
        .appendingPathComponent("userdata", isDirectory: true)
        .appendingPathComponent(rulesetId, isDirectory: true)
}

func environmentDirectory(_ key: String, environment: [String: String]) -> URL {
    if let rawValue = environment[key], !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return URL(fileURLWithPath: rawValue, isDirectory: true)
    }
    return FileManager.default.homeDirectoryForCurrentUser
}

func xdgDirectory(environmentKey: String, fallbackPath: String, environment: [String: String]) -> URL {
    if let rawValue = environment[environmentKey], !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return URL(fileURLWithPath: rawValue, isDirectory: true)
    }
    return FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(fallbackPath, isDirectory: true)
}

func fileBytes(at url: URL) throws -> Data {
    try Data(contentsOf: url)
}

func stringValue(_ value: Any?) -> String? {
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

func intValue(_ value: Any?) -> Int? {
    switch value {
    case let number as NSNumber:
        return number.intValue
    case let string as String:
        return Int(string.trimmingCharacters(in: .whitespacesAndNewlines))
    default:
        return nil
    }
}

func normalizeCreatureRecord(from raw: [String: Any]) -> [String: Any] {
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

    return normalized
}

func isFileReference(_ referenceUrl: String) -> Bool {
    guard let url = URL(string: referenceUrl) else {
        return false
    }
    return url.scheme?.lowercased() == "file"
}

func sourceDescription(from source: String?, referenceUrl: String) -> String? {
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

func pageNumber(from fragment: String) -> String? {
    let match = fragment.range(of: #"page=(\d+)"#, options: .regularExpression)
    guard let match else {
        return nil
    }
    let value = String(fragment[match]).replacingOccurrences(of: "page=", with: "")
    return value.isEmpty ? nil : value
}

func trimmedNonEmpty(_ value: String?) -> String? {
    guard let value else {
        return nil
    }
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.isEmpty ? nil : trimmed
}

do {
    let config = try parseConfiguration()
    let fm = FileManager.default

    guard fm.fileExists(atPath: config.sourceDirectory.path) else {
        throw CLIError(description: "Source directory does not exist: \(config.sourceDirectory.path)")
    }

    try fm.createDirectory(at: config.destinationDirectory, withIntermediateDirectories: true)

    let files = (try? fm.contentsOfDirectory(
        at: config.sourceDirectory,
        includingPropertiesForKeys: nil
    )) ?? []

    let jsonFiles = files
        .filter { $0.pathExtension.lowercased() == "json" }
        .sorted { $0.lastPathComponent.localizedCaseInsensitiveCompare($1.lastPathComponent) == .orderedAscending }

    var imported = 0
    var skipped = 0

    for sourceURL in jsonFiles {
        guard let data = try? fileBytes(at: sourceURL),
              let jsonObject = try? JSONSerialization.jsonObject(with: data),
              let rawDict = jsonObject as? [String: Any] else {
            fputs("Skipping non-object JSON file: \(sourceURL.lastPathComponent)\n", stderr)
            skipped += 1
            continue
        }

        let normalized = normalizeCreatureRecord(from: rawDict)
        let destinationURL = config.destinationDirectory.appendingPathComponent(sourceURL.lastPathComponent)
        let outputData = try JSONSerialization.data(withJSONObject: normalized, options: [.prettyPrinted, .sortedKeys])

        if fm.fileExists(atPath: destinationURL.path) {
            let existingData = try Data(contentsOf: destinationURL)
            if existingData == outputData {
                skipped += 1
                continue
            }
            if !config.overwrite {
                fputs("Skipping existing file (use --overwrite to replace): \(destinationURL.lastPathComponent)\n", stderr)
                skipped += 1
                continue
            }
        }

        try outputData.write(to: destinationURL, options: [.atomic])
        imported += 1
    }

    print("Imported \(imported) creature file(s) for ruleset '\(config.rulesetId)' into \(config.destinationDirectory.path).")
    if skipped > 0 {
        print("Skipped \(skipped) file(s).")
    }
} catch {
    fputs("Import failed: \(error)\n", stderr)
    exit(1)
}
