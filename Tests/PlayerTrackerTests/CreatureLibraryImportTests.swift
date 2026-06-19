import Foundation
import Testing
@testable import PlayerTracker

@Suite(.serialized)
struct CreatureLibraryImportTests {
    @Test("ruleset initiative charts load from json")
    func rulesetInitiativeChartsLoadFromJson() throws {
        let traveller = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinder = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")
        let dnd5e = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")

        #expect(traveller.initiative?.chart?.first?.bonus == -2)
        #expect(traveller.initiative?.chart?.last?.bonus == 3)
        #expect(pathfinder.initiative?.chart?.first?.bonus == -5)
        #expect(pathfinder.initiative?.chart?.last?.bonus == 10)
        #expect(traveller.statAliases?["Psionic Points"] == "PSI")
        #expect(traveller.statAliases?["Hits"] == "HP")
        #expect(traveller.healthLabel == "Hits")
        #expect(pathfinder.statAliases?["Dexterity"] == "DEX")
        #expect(pathfinder.healthLabel == "HP")
        #expect(dnd5e.statAliases?["Dexterity"] == "DEX")
        #expect(dnd5e.healthLabel == "HP")
        #expect(pathfinder.currency?.commonCurrencyId == "gp")
        #expect(pathfinder.currency?.units.map(\.id) == ["cp", "sp", "gp", "pp"])
        #expect(pathfinder.currency?.units.map(\.valueInCommonCurrency) == [0.01, 0.1, 1, 10])
        #expect(pathfinder.equipmentLibrary?.file == "pathfinder-equipment")
        #expect(dnd5e.currency?.commonCurrencyId == "gp")
        #expect(dnd5e.currency?.units.map(\.id) == ["cp", "sp", "ep", "gp", "pp"])
        #expect(dnd5e.currency?.units.map(\.valueInCommonCurrency) == [0.01, 0.1, 0.5, 1, 10])
        #expect(dnd5e.equipmentLibrary?.file == "dnd5e-equipment.json")
        #expect(traveller.currency?.commonCurrencyId == "Cr")
        #expect(traveller.currency?.units.map(\.id) == ["Cr", "KCr", "MCr"])
        #expect(traveller.currency?.units.map(\.valueInCommonCurrency) == [1, 1000, 1_000_000])
        #expect(traveller.equipmentLibrary?.file == "traveller-equipment.json")
    }

    @Test("equipment library load from ruleset json")
    func equipmentLibraryLoadFromRulesetJson() async throws {
        let library = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")
        let response = try await EquipmentLibraryStore.shared.library(
            rulesetId: library.id,
            rulesetLabel: library.label,
            query: "backpack",
            limit: 10
        )

        #expect(response.rulesetId == "pathfinder")
        #expect(response.items.contains { $0.name == "Backpack, common" })
    }

    @Test("pathfinder goods and services includes currency items")
    func pathfinderGoodsAndServicesIncludesCurrencyItems() async throws {
        let library = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")
        let response = try await EquipmentLibraryStore.shared.library(
            rulesetId: library.id,
            rulesetLabel: library.label,
            query: "Coin",
            limit: 100
        )

        #expect(response.rulesetId == "pathfinder")
        #expect(response.items.contains { $0.name == "Copper Coin" && $0.category == "Coins" && $0.value == 0.01 })
        #expect(response.items.contains { $0.name == "Silver Coin" && $0.category == "Coins" && $0.value == 0.1 })
        #expect(response.items.contains { $0.name == "Gold Coin" && $0.category == "Coins" && $0.value == 1 })
        #expect(response.items.contains { $0.name == "Platinum Coin" && $0.category == "Coins" && $0.value == 10 })
    }

    @Test("pathfinder third party products fixture includes bean sidhe variant")
    func pathfinderThirdPartyProductsFixtureIncludesBeanSidheVariant() throws {
        let fixtureURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/pathfinder/third-party-products.json")
        let data = try Data(contentsOf: fixtureURL)
        let fixture = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let creatures = try #require(fixture["creatures"] as? [[String: Any]])

        #expect(creatures.contains { creature in
            creature["name"] as? String == "Banshee, Bean Sidhe (3pp)"
                && creature["baseCreatureName"] as? String == "Banshee"
                && creature["cr"] as? String == "13"
        })
    }

    @Test("creature library import normalizes fixture shape into user data file")
    func creatureLibraryImportNormalizesFixtureShapeIntoUserDataFile() throws {
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

        #expect(result.imported == 1)
        #expect(result.skipped == 0)

        let outputURL = tempDirectory.appendingPathComponent("imported-aasimar.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try #require(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        #expect(outputObject["name"] as? String == "Imported Aasimar")
        #expect(outputObject["cr"] as? String == "1")
        #expect(outputObject["initiativeBonus"] as? Int == 2)
        #expect(outputObject["referenceUrl"] as? String == "https://example.com/reference")
        #expect(outputObject["type"] as? String == "outsider (native)")
        #expect(outputObject["hp"] as? Int == 11)
        #expect(outputObject["tags"] as? [String] == ["creature"])
    }

    @Test("creature library import derives pathfinder initiative from dexterity")
    func creatureLibraryImportDerivesPathfinderInitiativeFromDexterity() throws {
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
        let outputObject = try #require(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        #expect(outputObject["initiativeBonus"] as? Int == 4)
        #expect(outputObject["baseCreatureId"] as? String == nil)
        #expect(outputObject["baseCreatureName"] as? String == nil)
    }

    @Test("creature library import derives dnd initiative from dexterity")
    func creatureLibraryImportDerivesDnDInitiativeFromDexterity() throws {
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
        let outputObject = try #require(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        #expect(outputObject["initiativeBonus"] as? Int == 3)
        #expect(outputObject["baseCreatureId"] as? String == nil)
        #expect(outputObject["baseCreatureName"] as? String == nil)
    }

    @Test("creature library import collapses file reference into source page text")
    func creatureLibraryImportCollapsesFileReferenceIntoSourcePageText() throws {
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
        let outputObject = try #require(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        #expect(outputObject["source"] as? String == "Wrath of Thrune, page 47")
        #expect(outputObject["referenceUrl"] as? String == nil)
    }

    @Test("creature library import links myceloid young uns to builtin myceloid")
    func creatureLibraryImportLinksMyceloidYoungUnsToBuiltinMyceloid() throws {
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
        let outputObject = try #require(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        #expect(outputObject["name"] as? String == "Myceloid Young'uns")
        #expect(outputObject["baseCreatureName"] as? String == "Myceloid")
        #expect(outputObject["baseCreatureId"] as? String != nil)
        #expect(outputObject["initiativeBonus"] as? Int == 4)
    }

    @Test("creature library import skips exact builtin duplicate but keeps alternate name")
    func creatureLibraryImportSkipsExactBuiltinDuplicateButKeepsAlternateName() throws {
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

        #expect(result.imported == 1)
        #expect(result.skipped == 0)

        let outputURL = tempDirectory.appendingPathComponent("bunyip-alt.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try #require(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])

        #expect(outputObject["name"] as? String == "Bunyip (Wrath of Thrune)")
        #expect(outputObject["baseCreatureName"] as? String == "Bunyip")
        #expect(outputObject["baseCreatureId"] as? String != nil)
        #expect(outputObject["initiativeBonus"] as? Int == 3)
    }

    @Test("creature library import skips exact builtin duplicate when name matches base")
    func creatureLibraryImportSkipsExactBuiltinDuplicateWhenNameMatchesBase() throws {
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

        #expect(result.imported == 0)
        #expect(result.skipped == 1)
        #expect(!FileManager.default.fileExists(atPath: tempDirectory.appendingPathComponent("bunyip.json").path))
    }

    @Test("creature library import preserves multi creature bundles")
    func creatureLibraryImportPreservesMultiCreatureBundles() throws {
        let tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: tempDirectory)
        }

        let sourceJSON = """
        {
          "id": "custom-bestiary",
          "label": "Custom Bestiary",
          "source": {
            "website": "https://example.com",
            "api": "https://example.com/api"
          },
          "generatedAt": "2026-05-26T12:00:00Z",
          "creatures": [
            {
              "name": "Bundle Alpha",
              "initiativeBonus": 3,
              "hp": 11
            },
            {
              "name": "Bundle Beta",
              "initiativeBonus": 2,
              "hp": 8
            }
          ]
        }
        """

        let result = try CreatureLibraryImportService.importFiles(
            [
                CreatureLibraryImportFile(
                    filename: "custom-bestiary.json",
                    contents: sourceJSON
                )
            ],
            into: tempDirectory,
            overwrite: true,
            rulesetId: "pathfinder"
        )

        #expect(result.imported == 1)
        #expect(result.skipped == 0)

        let outputURL = tempDirectory.appendingPathComponent("custom-bestiary.json")
        let outputData = try Data(contentsOf: outputURL)
        let outputObject = try #require(try JSONSerialization.jsonObject(with: outputData) as? [String: Any])
        let creatures = try #require(outputObject["creatures"] as? [[String: Any]])

        #expect(outputObject["rulesetId"] as? String == "pathfinder")
        #expect(creatures.count == 2)
        #expect(creatures[0]["name"] as? String == "Bundle Alpha")
        #expect(creatures[0]["init"] as? Int == 3)
        #expect(creatures[1]["name"] as? String == "Bundle Beta")
        #expect(creatures[1]["init"] as? Int == 2)
    }

    @Test("creature library store loads multi creature user data files")
    func creatureLibraryStoreLoadsMultiCreatureUserDataFiles() async throws {
        let tempBaseDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-userdata-\(UUID().uuidString)", isDirectory: true)
        let tempUserDataDirectory = tempBaseDirectory
            .appendingPathComponent("userdata", isDirectory: true)
            .appendingPathComponent("pathfinder", isDirectory: true)
        try FileManager.default.createDirectory(at: tempUserDataDirectory, withIntermediateDirectories: true)
        defer {
            try? FileManager.default.removeItem(at: tempBaseDirectory)
        }

        let bundleJSON = """
        {
          "id": "custom-user-bestiary",
          "label": "Custom User Bestiary",
          "creatures": [
            {
              "name": "Local Alpha",
              "init": 2,
              "hp": 11
            },
            {
              "name": "Local Beta",
              "init": 4,
              "hp": 8
            }
          ]
        }
        """

        try bundleJSON.write(to: tempUserDataDirectory.appendingPathComponent("custom-user-bestiary.json"), atomically: true, encoding: .utf8)

        await CreatureLibraryStore.shared.invalidate(rulesetId: "pathfinder")
        let response = try await CreatureLibraryStore.shared.library(
            rulesetId: "pathfinder",
            rulesetLabel: "Pathfinder",
            query: "Local",
            limit: 50,
            selectedLocalCreatureFiles: ["custom-user-bestiary.json"],
            configuration: CreatureLibraryConfiguration(
                includeLocalCreatures: true,
                localCreaturesDirectoryProvider: { _ in tempUserDataDirectory }
            )
        )

        #expect(response.totalMatches == 2)
        #expect(response.creatures.map(\.name).sorted() == ["Local Alpha", "Local Beta"])
        #expect(response.creatures.first(where: { $0.name == "Local Alpha" })?.initiativeBonus == 2)
        #expect(response.creatures.first(where: { $0.name == "Local Beta" })?.initiativeBonus == 4)
    }
}
