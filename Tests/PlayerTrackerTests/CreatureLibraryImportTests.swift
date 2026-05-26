import Foundation
import XCTest
@testable import PlayerTracker

final class CreatureLibraryImportTests: XCTestCase {
    func testRulesetInitiativeChartsLoadFromJson() throws {
        let traveller = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinder = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")
        let dnd5e = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")

        XCTAssertEqual(traveller.initiative?.chart?.first?.bonus, -2)
        XCTAssertEqual(traveller.initiative?.chart?.last?.bonus, 3)
        XCTAssertEqual(pathfinder.initiative?.chart?.first?.bonus, -5)
        XCTAssertEqual(pathfinder.initiative?.chart?.last?.bonus, 10)
        XCTAssertEqual(traveller.statAliases?["Psionic Points"], "PSI")
        XCTAssertEqual(traveller.statAliases?["Hits"], "HP")
        XCTAssertEqual(traveller.healthLabel, "Hits")
        XCTAssertEqual(pathfinder.statAliases?["Dexterity"], "DEX")
        XCTAssertEqual(pathfinder.healthLabel, "HP")
        XCTAssertEqual(dnd5e.statAliases?["Dexterity"], "DEX")
        XCTAssertEqual(dnd5e.healthLabel, "HP")
    }

    func testCreatureLibraryImportNormalizesFixtureShapeIntoUserDataFile() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "name": "Imported Aasimar",
          "cr": 1,
          "initiative": 2,
          "url": "https://example.com/reference",
          "type": "outsider (native)",
          "hp": 11,
          "tags": ["creature"]
        }
        """

        let result = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "imported-aasimar.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "pathfinder"
        )

        XCTAssertEqual(result.imported, 1)
        XCTAssertEqual(result.skipped, 0)

        let outputURL = tempDirectory.appendingPathComponent("imported-aasimar.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try XCTUnwrap(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        XCTAssertEqual(outputObject["name"] as? String, "Imported Aasimar")
        XCTAssertEqual(outputObject["cr"] as? String, "1")
        XCTAssertEqual(outputObject["initiativeBonus"] as? Int, 2)
        XCTAssertEqual(outputObject["referenceUrl"] as? String, "https://example.com/reference")
        XCTAssertEqual(outputObject["type"] as? String, "outsider (native)")
        XCTAssertEqual(outputObject["hp"] as? Int, 11)
        XCTAssertEqual(outputObject["tags"] as? [String], ["creature"])
    }

    func testCreatureLibraryImportDerivesPathfinderInitiativeFromDexterity() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "name": "Dexterous Pathfinder",
          "statistics": {
            "dexterity": 18,
            "intelligence": 12
          },
          "hp": 11
        }
        """

        _ = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "dexterous-pathfinder.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "pathfinder"
        )

        let outputURL = tempDirectory.appendingPathComponent("dexterous-pathfinder.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try XCTUnwrap(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        XCTAssertEqual(outputObject["initiativeBonus"] as? Int, 4)
        XCTAssertNil(outputObject["baseCreatureId"] as? String)
        XCTAssertNil(outputObject["baseCreatureName"] as? String)
    }

    func testCreatureLibraryImportDerivesDnDInitiativeFromDexterity() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "name": "Dexterous Hero",
          "abilities": {
            "dexterity": 16,
            "intelligence": 10
          },
          "hp": 22
        }
        """

        _ = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "dexterous-hero.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "dnd5e"
        )

        let outputURL = tempDirectory.appendingPathComponent("dexterous-hero.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try XCTUnwrap(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        XCTAssertEqual(outputObject["initiativeBonus"] as? Int, 3)
        XCTAssertNil(outputObject["baseCreatureId"] as? String)
        XCTAssertNil(outputObject["baseCreatureName"] as? String)
    }

    func testCreatureLibraryImportCollapsesFileReferenceIntoSourcePageText() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "name": "PDF Import",
          "source": "Wrath of Thrune",
          "url": "file:///Users/craig/Documents/TableTop/RPG/Adventure.pdf#page=47",
          "hp": 9
        }
        """

        _ = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "pdf-import.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "pathfinder"
        )

        let outputURL = tempDirectory.appendingPathComponent("pdf-import.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try XCTUnwrap(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        XCTAssertEqual(outputObject["source"] as? String, "Wrath of Thrune, page 47")
        XCTAssertNil(outputObject["referenceUrl"])
    }

    func testCreatureLibraryImportLinksMyceloidYoungUnsToBuiltinMyceloid() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "name": "Myceloid Young'uns",
          "source": "Wrath of Thrune",
          "url": "file:///Users/craig/Documents/TableTop/RPG/Adventure.pdf#page=43",
          "hp": 27,
          "cr": 3
        }
        """

        _ = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "myceloid-younguns.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "pathfinder"
        )

        let outputURL = tempDirectory.appendingPathComponent("myceloid-younguns.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try XCTUnwrap(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        XCTAssertEqual(outputObject["name"] as? String, "Myceloid Young'uns")
        XCTAssertEqual(outputObject["baseCreatureName"] as? String, "Myceloid")
        XCTAssertNotNil(outputObject["baseCreatureId"] as? String)
        XCTAssertEqual(outputObject["initiativeBonus"] as? Int, 4)
    }

    func testCreatureLibraryImportSkipsExactBuiltinDuplicateButKeepsAlternateName() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "name": "Bunyip (Wrath of Thrune)",
          "source": "Wrath of Thrune",
          "url": "file:///Users/craig/Documents/TableTop/RPG/Adventure.pdf#page=41",
          "hp": 32,
          "cr": 3,
          "ac": 16
        }
        """

        let result = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "bunyip-alt.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "pathfinder"
        )

        XCTAssertEqual(result.imported, 1)
        XCTAssertEqual(result.skipped, 0)

        let outputURL = tempDirectory.appendingPathComponent("bunyip-alt.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try XCTUnwrap(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        XCTAssertEqual(outputObject["name"] as? String, "Bunyip (Wrath of Thrune)")
        XCTAssertEqual(outputObject["baseCreatureName"] as? String, "Bunyip")
        XCTAssertNotNil(outputObject["baseCreatureId"] as? String)
        XCTAssertEqual(outputObject["initiativeBonus"] as? Int, 3)
    }

    func testCreatureLibraryImportSkipsExactBuiltinDuplicateWhenNameMatchesBase() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "name": "Bunyip",
          "source": "Wrath of Thrune",
          "url": "file:///Users/craig/Documents/TableTop/RPG/Adventure.pdf#page=41",
          "hp": 32,
          "cr": 3,
          "ac": 15,
          "alignment": "N",
          "type": "Medium magical beast (aquatic)"
        }
        """

        let result = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "bunyip.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "pathfinder"
        )

        XCTAssertEqual(result.imported, 0)
        XCTAssertEqual(result.skipped, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: tempDirectory.appendingPathComponent("bunyip.json").path))
    }
}
