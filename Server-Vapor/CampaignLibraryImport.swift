import Foundation
import Vapor

enum CampaignLibraryImportService {
    struct ValidatedFile {
        let file: CreatureLibraryImportFile
        let kind: String
    }

    static func validate(
        _ files: [CreatureLibraryImportFile],
        rulesetId: String
    ) throws -> [ValidatedFile] {
        guard !files.isEmpty else {
            throw Abort(.badRequest, reason: "Select at least one JSON library file.")
        }
        _ = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)

        return try files.map { file in
            let name = URL(fileURLWithPath: file.filename).lastPathComponent
            guard name.lowercased().hasSuffix(".json"), !name.isEmpty else {
                throw Abort(.unprocessableEntity, reason: "\(file.filename) is not a JSON file.")
            }
            guard let data = file.contents.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                throw Abort(.unprocessableEntity, reason: "\(name) is not valid JSON.")
            }
            if let creatures = object["creatures"] as? [[String: Any]] {
                guard !creatures.isEmpty,
                      creatures.allSatisfy({ ($0["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false }) else {
                    throw Abort(.unprocessableEntity, reason: "\(name) must contain a non-empty creatures array with named creatures.")
                }
                return ValidatedFile(file: file, kind: "creatures")
            }
            if let items = object["items"] as? [[String: Any]] {
                guard !items.isEmpty,
                      items.allSatisfy({ ($0["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false }) else {
                    throw Abort(.unprocessableEntity, reason: "\(name) must contain a non-empty items array with named items.")
                }
                return ValidatedFile(file: file, kind: "items")
            }
            if (object["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                return ValidatedFile(file: file, kind: "creatures")
            }
            throw Abort(.unprocessableEntity, reason: "\(name) is not a supported creature or item library. Expected creatures or items.")
        }
    }
}
