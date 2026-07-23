import Vapor
import VaporTesting
import Testing
import XCTest
import Logging
@testable import PlayerTracker

@Suite(.serialized)
struct ServerRoutesTests {
    static let setupLogging: Void = {
        // Configure logging to suppress info-level messages during tests
        LoggingSystem.bootstrap { label in
            var handler = StreamLogHandler.standardError(label: label)
            handler.logLevel = .warning
            return handler
        }
    }()

    private final class TestEnvironment {
        let app: Application
        let tester: TestingApplicationTester

        init(app: Application, tester: TestingApplicationTester) {
            self.app = app
            self.tester = tester
        }

        deinit {
            shutdownApplicationSynchronously(app)
        }
    }

    private final class EnvironmentKeeper: @unchecked Sendable {
        var current: TestEnvironment?
    }

    private static let environmentKeeper = EnvironmentKeeper()

    @Test
    func testCampaignAndRulesetRoutesReturnInitialState() async throws {
        let tester = try await makeTester()

        let campaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaign = try campaignResponse.content.decode(CampaignState.self)
        XCTAssertFalse(campaign.id.uuidString.isEmpty)
        XCTAssertEqual(campaign.name, "Route Smoke")
        XCTAssertEqual(campaign.rulesetId, "dnd5e")
        XCTAssertEqual(campaign.encounterState, .new)

        let rulesetsResponse = try await tester.sendRequest(.GET, "/rulesets")
        XCTAssertEqual(rulesetsResponse.status, .ok)
        let rulesets = try rulesetsResponse.content.decode([RulesetSummary].self)
        XCTAssertTrue(rulesets.contains { $0.id == "dnd5e" })
        XCTAssertTrue(rulesets.contains { $0.id == "none" })
    }

    @Test
    func testCampaignPatchRejectsRulesetChangesAfterCreation() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let adminCookie = try await signInOwner(in: tester)
        let createResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Route Smoke", rulesetId: "dnd5e")
            ))
        )
        XCTAssertEqual(createResponse.status, .ok)
        let campaign = try createResponse.content.decode(CampaignSummary.self)
        let selectResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaign.id.uuidString)/select",
            headers: HTTPHeaders([("Cookie", "roll4_session=\(adminCookie)")])
        )
        XCTAssertEqual(selectResponse.status, .ok)

        let campaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(campaignResponse.status, .ok)
        let activeCampaign = try campaignResponse.content.decode(CampaignState.self)

        let updatePayload = CampaignUpdateInput(
            name: "Route Smoke Revised",
            rulesetId: "pathfinder",
            claimTimeoutMinutes: activeCampaign.claimTimeoutMinutes,
            isInviteOnly: activeCampaign.isInviteOnly
        )
        let updateResponse = try await tester.sendRequest(
            .PATCH,
            "/campaigns/\(activeCampaign.id.uuidString)",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(updatePayload))
        )
        XCTAssertEqual(updateResponse.status, .conflict)

        let refreshedCampaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(refreshedCampaignResponse.status, .ok)
        let refreshedCampaign = try refreshedCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(refreshedCampaign.name, "Route Smoke")
        XCTAssertEqual(refreshedCampaign.rulesetId, "dnd5e")
    }

    @Test
    func testCreatureLibraryRouteReturnsFilteredCreaturesForActiveRuleset() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")

        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")
        XCTAssertEqual(pathfinderLibrary.creatureLibrary?.file, "pathfinder-bestiary")

        let response = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Aasimar&limit=5"
        )
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(CreatureLibraryResponse.self)
        XCTAssertEqual(library.rulesetId, "pathfinder")
        XCTAssertEqual(library.rulesetLabel, "Pathfinder (1st)")
        XCTAssertEqual(library.query, "Aasimar")
        XCTAssertGreaterThanOrEqual(library.totalMatches, 1)
        XCTAssertTrue(library.creatures.contains { creature in
            creature.name == "Aasimar" && creature.cr == "1/2" && creature.type?.contains("outsider") == true
        })
    }

    @Test
    func testCreatureLibraryDoesNotReturnThirdPartyCreaturesByDefaultForPathfinder() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")

        let response = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Afanc&limit=5"
        )
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(CreatureLibraryResponse.self)
        XCTAssertEqual(library.rulesetId, "pathfinder")
        XCTAssertEqual(library.totalMatches, 0)
        XCTAssertFalse(library.creatures.contains { creature in
            creature.name == "Afanc (3pp)"
        })
    }

    @Test
    func testCreatureLibraryReturnsBansheeVariantsForPathfinder() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")

        let response = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Banshee&limit=10"
        )
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(CreatureLibraryResponse.self)
        XCTAssertEqual(library.rulesetId, "pathfinder")
        XCTAssertEqual(library.totalMatches, 2)
        XCTAssertTrue(library.creatures.contains { creature in
            creature.name == "Banshee" && creature.cr == "13" && creature.alignment == "CE" && creature.type == "Medium undead (incorporeal)"
        })
        XCTAssertTrue(library.creatures.contains { creature in
            creature.name == "Greater Banshee" && creature.cr == "15" && creature.baseCreatureName == "Banshee"
        })
    }

    @Test
    func testCreatureLibraryReturnsSplitVariantCreaturesForPathfinder() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")

        let roperResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Crusher&limit=10"
        )
        XCTAssertEqual(roperResponse.status, .ok)
        let roperLibrary = try roperResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertTrue(roperLibrary.creatures.contains { creature in
            creature.name == "Roper, Crusher" && creature.cr == "12" && creature.baseCreatureName == "Roper"
        })

        let shardstrikerResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Shardstriker&limit=10"
        )
        XCTAssertEqual(shardstrikerResponse.status, .ok)
        let shardstrikerLibrary = try shardstrikerResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertTrue(shardstrikerLibrary.creatures.contains { creature in
            creature.name == "Shardstriker" && creature.cr == "13" && creature.baseCreatureName == "Roper"
        })

        let medusaResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Euryale&limit=10"
        )
        XCTAssertEqual(medusaResponse.status, .ok)
        let medusaLibrary = try medusaResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertTrue(medusaLibrary.creatures.contains { creature in
            creature.name == "Medusa, Euryale" && creature.cr == "7" && creature.baseCreatureName == "Medusa"
        })

        let dustResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Dust%20Wendigo&limit=10"
        )
        XCTAssertEqual(dustResponse.status, .ok)
        let dustLibrary = try dustResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertTrue(dustLibrary.creatures.contains { creature in
            creature.name == "Dust Wendigo" && creature.cr == "18" && creature.baseCreatureName == "Wendigo"
        })

        let voidResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Void%20Wendigo&limit=10"
        )
        XCTAssertEqual(voidResponse.status, .ok)
        let voidLibrary = try voidResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertTrue(voidLibrary.creatures.contains { creature in
            creature.name == "Void Wendigo" && creature.cr == "18" && creature.baseCreatureName == "Wendigo"
        })

        let shokujinkiResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Shokujinki&limit=10"
        )
        XCTAssertEqual(shokujinkiResponse.status, .ok)
        let shokujinkiLibrary = try shokujinkiResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertTrue(shokujinkiLibrary.creatures.contains { creature in
            creature.name == "Wendigo, Shokujinki" && creature.cr == "17" && creature.baseCreatureName == "Wendigo"
        })
    }

    @Test
    func testCreatureLibraryNormalizesTypeCommaSpacing() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")

        let response = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Archon,%20Codex&limit=5"
        )
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(CreatureLibraryResponse.self)
        let creature = try XCTUnwrap(library.creatures.first(where: { $0.name == "Archon, Codex" }))
        XCTAssertFalse(creature.type?.contains(" ,") ?? false)
        XCTAssertEqual(creature.type, "Medium outsider (archon, extraplanar, good, lawful)")
    }

    @Test
    func testCreatureLibraryReturnsOpen5eBestiaryForDnd5e() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "dnd5e")

        let dnd5eLibrary = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        XCTAssertEqual(dnd5eLibrary.creatureLibrary?.file, "dnd5e-bestiary")

        let response = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Aboleth&limit=5"
        )
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(CreatureLibraryResponse.self)
        XCTAssertEqual(library.rulesetId, "dnd5e")
        XCTAssertEqual(library.rulesetLabel, "D&D 5e (SRD)")
        XCTAssertGreaterThan(library.totalMatches, 0)
        XCTAssertTrue(library.creatures.contains { creature in
            creature.name == "Aboleth" && creature.referenceUrl?.contains("open5e.com/monsters/aboleth") == true
        })
    }

    @Test
    func testCampaignUserdataSelectionControlsLoadedCreatureLibrary() async throws {
        let tempBaseDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-userdata-\(UUID().uuidString)", isDirectory: true)
        let tempUserDataDirectory = tempBaseDirectory
            .appendingPathComponent("userdata", isDirectory: true)
            .appendingPathComponent("pathfinder", isDirectory: true)
        try FileManager.default.createDirectory(at: tempUserDataDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempBaseDirectory) }

        let localCreatureJSON = """
        {
          "id": "local-alpha",
          "name": "Local Alpha",
          "init": 7,
          "hp": 12
        }
        """
        try localCreatureJSON.write(
            to: tempUserDataDirectory.appendingPathComponent("custom-local.json"),
            atomically: true,
            encoding: .utf8
        )

        let creatureLibraryConfiguration = CreatureLibraryConfiguration(
            includeLocalCreatures: true,
            localCreaturesDirectoryProvider: { _ in tempUserDataDirectory }
        )
        let tester = try await makeTester(
            selectDefaultCampaign: false,
            creatureLibraryConfiguration: creatureLibraryConfiguration
        )

        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")
        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let cookieHeader = HTTPHeaders([("Cookie", "roll4_player_session=\(refereeCookie)")])

        let initialUserDataResponse = try await tester.sendRequest(
            .GET,
            "/campaign/userdata",
            headers: cookieHeader
        )
        XCTAssertEqual(initialUserDataResponse.status, .ok)
        let initialUserData = try initialUserDataResponse.content.decode(CampaignUserDataResponse.self)
        XCTAssertEqual(initialUserData.rulesetId, "pathfinder")
        XCTAssertTrue(initialUserData.files.contains { file in
            file.name == "custom-local.json" && file.selected == false && file.missing == false
        })

        let initialLibraryResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Local&limit=5"
        )
        XCTAssertEqual(initialLibraryResponse.status, .ok)
        let initialLibrary = try initialLibraryResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertEqual(initialLibrary.totalMatches, 0)

        let updatePayload = CampaignUserDataUpdateInput(files: ["custom-local.json"])
        let updateResponse = try await tester.sendRequest(
            .PUT,
            "/campaign/userdata",
            headers: HTTPHeaders([("Content-Type", "application/json"), ("Cookie", "roll4_player_session=\(refereeCookie)")]),
            body: ByteBuffer(data: try JSONEncoder().encode(updatePayload))
        )
        XCTAssertEqual(updateResponse.status, .ok)
        let updatedCampaign = try updateResponse.content.decode(CampaignState.self)
        XCTAssertEqual(updatedCampaign.userdataFiles, ["custom-local.json"])

        let updatedUserDataResponse = try await tester.sendRequest(
            .GET,
            "/campaign/userdata",
            headers: cookieHeader
        )
        XCTAssertEqual(updatedUserDataResponse.status, .ok)
        let updatedUserData = try updatedUserDataResponse.content.decode(CampaignUserDataResponse.self)
        XCTAssertTrue(updatedUserData.files.contains { file in
            file.name == "custom-local.json" && file.selected && file.missing == false
        })

        let updatedLibraryResponse = try await tester.sendRequest(
            .GET,
            "/creature-library?query=Local&limit=5"
        )
        XCTAssertEqual(updatedLibraryResponse.status, .ok)
        let updatedLibrary = try updatedLibraryResponse.content.decode(CreatureLibraryResponse.self)
        XCTAssertTrue(updatedLibrary.creatures.contains { $0.name == "Local Alpha" })
    }

    @Test
    func testCampaignUserdataRoutesRejectNonReferees() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")
        let playerSession = try await join(displayName: "Player", in: tester)
        let cookieHeader = HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])

        let getResponse = try await tester.sendRequest(
            .GET,
            "/campaign/userdata",
            headers: cookieHeader
        )
        XCTAssertEqual(getResponse.status, .forbidden)

        let updatePayload = CampaignUserDataUpdateInput(files: ["custom-local.json"])
        let putResponse = try await tester.sendRequest(
            .PUT,
            "/campaign/userdata",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(updatePayload))
        )
        XCTAssertEqual(putResponse.status, .forbidden)
    }

    @Test
    func testPartyTreasureClaimDistributesValueAcrossParty() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let campaign = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "dnd5e")
        let playerSession = try await join(displayName: "Player", in: tester)
        let cookieHeader = HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])

        let firstCharacter = try await createMemberCharacter(
            in: tester,
            cookieToken: playerSession.cookieToken,
            payload: CharacterInput(
                ownerName: "Player",
                name: "Claimant",
                currency: [
                    CurrencyAmount(unitId: "gp", amount: 5),
                    CurrencyAmount(unitId: "sp", amount: 50)
                ]
            )
        )
        let secondCharacter = try await createMemberCharacter(
            in: tester,
            cookieToken: playerSession.cookieToken,
            payload: CharacterInput(
                ownerName: "Player",
                name: "Companion",
                currency: [
                    CurrencyAmount(unitId: "gp", amount: 0),
                    CurrencyAmount(unitId: "sp", amount: 25)
                ]
            )
        )

        let treasureItemID = UUID()
        let treasurePayload = PartyTreasureUpdateInput(
            items: [
                InventoryEntry(
                    id: treasureItemID,
                    name: "Ancient Relic",
                    quantity: 2,
                    value: 10,
                    weight: 2,
                    url: "https://example.com/relic",
                    category: "Treasure"
                )
            ]
        )
        let treasureUpdateResponse = try await tester.sendRequest(
            .PUT,
            "/campaign/party-treasure",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(treasurePayload))
        )
        XCTAssertEqual(treasureUpdateResponse.status, .ok)
        let updatedCampaign = try treasureUpdateResponse.content.decode(CampaignState.self)
        XCTAssertEqual(updatedCampaign.partyTreasure.count, 1)
        XCTAssertEqual(updatedCampaign.partyTreasure.first?.id, treasureItemID)
        XCTAssertEqual(updatedCampaign.partyTreasure.first?.quantity, 2)
        XCTAssertEqual(updatedCampaign.partyTreasure.first?.category, "Treasure")

        let claimResponse = try await tester.sendRequest(
            .POST,
            "/campaign/party-treasure/claim",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                PartyTreasureClaimInput(characterId: firstCharacter.id, itemId: treasureItemID)
            ))
        )
        XCTAssertEqual(claimResponse.status, .ok)
        let claimedCampaign = try claimResponse.content.decode(CampaignState.self)
        XCTAssertEqual(claimedCampaign.partyTreasure.count, 1)
        XCTAssertEqual(claimedCampaign.partyTreasure.first?.id, treasureItemID)
        XCTAssertEqual(claimedCampaign.partyTreasure.first?.quantity, 1)
        XCTAssertEqual(claimedCampaign.partyTreasure.first?.category, "Treasure")

        let charactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaign.id.uuidString)/me/characters",
            headers: cookieHeader
        )
        XCTAssertEqual(charactersResponse.status, .ok)
        let characters = try charactersResponse.content.decode([PlayerView].self)
        let claimant = try XCTUnwrap(characters.first(where: { $0.id == firstCharacter.id }))
        let companion = try XCTUnwrap(characters.first(where: { $0.id == secondCharacter.id }))

        XCTAssertEqual(claimant.currency.first(where: { $0.unitId == "gp" })?.amount, 0)
        XCTAssertEqual(claimant.currency.first(where: { $0.unitId == "sp" })?.amount, 50)
        XCTAssertEqual(companion.currency.first(where: { $0.unitId == "gp" })?.amount, 5)
        XCTAssertEqual(companion.currency.first(where: { $0.unitId == "sp" })?.amount, 25)
        XCTAssertTrue(claimant.inventory.contains(where: { $0.name == "Ancient Relic" && $0.quantity == 1 && $0.category == "Treasure" }))
    }

    @Test
    func testPartyTreasureClaimOnlyMovesTheItem() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "dnd5e")
        let playerSession = try await join(displayName: "Player", in: tester)

        let character = try await createMemberCharacter(
            in: tester,
            cookieToken: playerSession.cookieToken,
            payload: CharacterInput(
                ownerName: "Player",
                name: "Broke Hero",
                currency: [CurrencyAmount(unitId: "gp", amount: 0)]
            )
        )

        let treasureItemID = UUID()
        let treasurePayload = PartyTreasureUpdateInput(
            items: [
                InventoryEntry(
                    id: treasureItemID,
                    name: "Expensive Crown",
                    quantity: 1,
                    value: 25,
                    weight: 1,
                    url: nil
                )
            ]
        )
        let treasureUpdateResponse = try await tester.sendRequest(
            .PUT,
            "/campaign/party-treasure",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(treasurePayload))
        )
        XCTAssertEqual(treasureUpdateResponse.status, .ok)

        let claimResponse = try await tester.sendRequest(
            .POST,
            "/campaign/party-treasure/claim",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                PartyTreasureClaimInput(characterId: character.id, itemId: treasureItemID)
            ))
        )
        XCTAssertEqual(claimResponse.status, .ok)
        let claimedCampaign = try claimResponse.content.decode(CampaignState.self)
        XCTAssertEqual(claimedCampaign.partyTreasure.count, 0)

        let charactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(claimedCampaign.id.uuidString)/me/characters",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])
        )
        XCTAssertEqual(charactersResponse.status, .ok)
        let characters = try charactersResponse.content.decode([PlayerView].self)
        let updatedCharacter = try XCTUnwrap(characters.first(where: { $0.id == character.id }))
        XCTAssertEqual(updatedCharacter.currency.first(where: { $0.unitId == "gp" })?.amount, 0)
        XCTAssertEqual(updatedCharacter.inventory.count, 1)
        XCTAssertEqual(updatedCharacter.inventory.first?.name, "Expensive Crown")
        XCTAssertEqual(updatedCharacter.inventory.first?.quantity, 1)
        XCTAssertEqual(updatedCharacter.inventory.first?.category, "Treasure")
    }

    @Test
    func testPartyTreasureClaimStacksIntoMatchingInventoryItems() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "dnd5e")
        let playerSession = try await join(displayName: "Player", in: tester)

        let character = try await createMemberCharacter(
            in: tester,
            cookieToken: playerSession.cookieToken,
            payload: CharacterInput(
                ownerName: "Player",
                name: "Collector",
                currency: [CurrencyAmount(unitId: "gp", amount: 0)],
                inventory: [
                    InventoryEntry(
                        id: UUID(),
                        name: "Expensive Crown",
                        quantity: 2,
                        value: 25,
                        weight: 1,
                        url: nil,
                        category: "Treasure"
                    )
                ]
            )
        )

        let treasureItemID = UUID()
        let treasurePayload = PartyTreasureUpdateInput(
            items: [
                InventoryEntry(
                    id: treasureItemID,
                    name: "Expensive Crown",
                    quantity: 3,
                    value: 25,
                    weight: 1,
                    url: nil,
                    category: "Treasure"
                )
            ]
        )
        let treasureUpdateResponse = try await tester.sendRequest(
            .PUT,
            "/campaign/party-treasure",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(treasurePayload))
        )
        XCTAssertEqual(treasureUpdateResponse.status, .ok)

        let claimResponse = try await tester.sendRequest(
            .POST,
            "/campaign/party-treasure/claim",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                PartyTreasureClaimInput(characterId: character.id, itemId: treasureItemID, quantity: 2)
            ))
        )
        XCTAssertEqual(claimResponse.status, .ok)
        let claimedCampaign = try claimResponse.content.decode(CampaignState.self)
        XCTAssertEqual(claimedCampaign.partyTreasure.first?.quantity, 1)

        let charactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(claimedCampaign.id.uuidString)/me/characters",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])
        )
        XCTAssertEqual(charactersResponse.status, .ok)
        let characters = try charactersResponse.content.decode([PlayerView].self)
        let updatedCharacter = try XCTUnwrap(characters.first(where: { $0.id == character.id }))
        XCTAssertEqual(updatedCharacter.inventory.count, 1)
        XCTAssertEqual(updatedCharacter.inventory.first?.name, "Expensive Crown")
        XCTAssertEqual(updatedCharacter.inventory.first?.quantity, 4)
        XCTAssertEqual(updatedCharacter.inventory.first?.category, "Treasure")
    }

    @Test
    func testPartyTreasureUpdateNormalizesInvalidItemIds() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "dnd5e")
        let playerSession = try await join(displayName: "Player", in: tester)

        let invalidPayload = """
        {
          "items": [
            {
              "id": "not-a-uuid",
              "name": "Recovered Chest",
              "quantity": 1,
              "value": 3,
              "weight": 10,
              "category": "Treasure",
              "url": null
            }
          ]
        }
        """

        let updateResponse = try await tester.sendRequest(
            .PUT,
            "/campaign/party-treasure",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: Data(invalidPayload.utf8))
        )
        XCTAssertEqual(updateResponse.status, .ok)
        let updatedCampaign = try updateResponse.content.decode(CampaignState.self)
        XCTAssertEqual(updatedCampaign.partyTreasure.count, 1)
        XCTAssertEqual(updatedCampaign.partyTreasure.first?.name, "Recovered Chest")
        XCTAssertEqual(updatedCampaign.partyTreasure.first?.category, "Treasure")
        XCTAssertNotNil(updatedCampaign.partyTreasure.first?.id)
    }

    @Test
    func testPartyTreasureUpdatePersistsCurrency() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "dnd5e")
        let playerSession = try await join(displayName: "Player", in: tester)

        let treasurePayload = PartyTreasureUpdateInput(
            items: [
                InventoryEntry(
                    id: UUID(),
                    name: "Coin Chest",
                    quantity: 1,
                    value: 0,
                    weight: 15,
                    url: nil
                )
            ],
            currency: [
                CurrencyAmount(unitId: "gp", amount: 123),
                CurrencyAmount(unitId: "sp", amount: 45)
            ]
        )
        let updateResponse = try await tester.sendRequest(
            .PUT,
            "/campaign/party-treasure",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(treasurePayload))
        )
        XCTAssertEqual(updateResponse.status, .ok)
        let updatedCampaign = try updateResponse.content.decode(CampaignState.self)
        XCTAssertEqual(updatedCampaign.currency.first(where: { $0.unitId == "gp" })?.amount, 123)
        XCTAssertEqual(updatedCampaign.currency.first(where: { $0.unitId == "sp" })?.amount, 45)

        let campaignResponse = try await tester.sendRequest(
            .GET,
            "/campaign",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])
        )
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaign = try campaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(campaign.currency.first(where: { $0.unitId == "gp" })?.amount, 123)
        XCTAssertEqual(campaign.currency.first(where: { $0.unitId == "sp" })?.amount, 45)
    }

    @Test
    func testCharacterInventoryRoutesPreserveNestedContainerReferences() async throws {
        let tester = try await makeTester()
        let playerSession = try await join(displayName: "Player", in: tester)
        let backpackID = UUID()
        let campaignResponse = try await tester.sendRequest(
            .GET,
            "/campaign",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])
        )
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaign = try campaignResponse.content.decode(CampaignState.self)
        let payload = CharacterInput(
            id: nil,
            campaignName: nil,
            ownerName: "Player",
            name: "Pack Mule",
            inventory: [
                InventoryEntry(
                    id: backpackID,
                    name: "Backpack",
                    quantity: 1,
                    value: 2,
                    weight: 5,
                    url: nil,
                    containerId: nil,
                    isContainer: true
                ),
                InventoryEntry(
                    name: "Rations",
                    quantity: 3,
                    value: 0.5,
                    weight: 1.5,
                    url: "https://example.com/rations",
                    category: "Food and Drink",
                    containerId: backpackID,
                    isContainer: false
                )
            ],
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let created = try await createMemberCharacter(
            in: tester,
            cookieToken: playerSession.cookieToken,
            payload: payload
        )

        XCTAssertEqual(created.inventory.count, 2)
        let createdBackpack = try XCTUnwrap(created.inventory.first(where: { $0.id == backpackID }))
        XCTAssertTrue(createdBackpack.isContainer)
        let createdRations = try XCTUnwrap(created.inventory.first(where: { $0.name == "Rations" }))
        XCTAssertEqual(createdRations.containerId, backpackID)
        XCTAssertEqual(createdRations.category, "Food and Drink")

        let charactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaign.id.uuidString)/me/characters",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])
        )
        XCTAssertEqual(charactersResponse.status, .ok)
        let characters = try charactersResponse.content.decode([PlayerView].self)
        let reloaded = try XCTUnwrap(characters.first(where: { $0.id == created.id }))
        XCTAssertEqual(reloaded.inventory.count, 2)
        XCTAssertEqual(reloaded.inventory.first(where: { $0.name == "Rations" })?.containerId, backpackID)
        XCTAssertEqual(reloaded.inventory.first(where: { $0.name == "Rations" })?.category, "Food and Drink")
    }

    @Test
    func testCreatureLibraryImportRoutePersistsImportedFileForReferee() async throws {
        let tempBaseDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-route-\(UUID().uuidString)", isDirectory: true)
        let tempUserDataDirectory = tempBaseDirectory
            .appendingPathComponent("userdata", isDirectory: true)
            .appendingPathComponent("pathfinder", isDirectory: true)
        try FileManager.default.createDirectory(at: tempUserDataDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempBaseDirectory) }
        let creatureLibraryConfiguration = CreatureLibraryConfiguration(
            includeLocalCreatures: true,
            localCreaturesDirectoryProvider: { _ in tempUserDataDirectory }
        )
        let tester = try await makeTester(
            selectDefaultCampaign: false,
            creatureLibraryConfiguration: creatureLibraryConfiguration,
            appDataDirectoryOverride: tempBaseDirectory
        )

        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")
        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let payload = CreatureLibraryImportInput(
            files: [
                CreatureLibraryImportFile(
                    filename: "imported-aasimar.json",
                    contents: """
                    {
                      "name": "Imported Aasimar",
                      "cr": 1,
                      "initiative": 2,
                      "url": "https://example.com/reference",
                      "type": "outsider (native)",
                      "hp": 11
                    }
                    """
                )
            ],
            overwrite: false
        )

        let response = try await tester.sendRequest(
            .POST,
            "/creature-library/import",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(refereeCookie)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )

        XCTAssertEqual(response.status, .ok)
        let imported = try response.content.decode(CreatureLibraryImportResponse.self)
        XCTAssertEqual(imported.rulesetId, "pathfinder")
        XCTAssertTrue(imported.destination.hasSuffix("/userdata/pathfinder"))
        XCTAssertEqual(imported.imported, 1)
        XCTAssertEqual(imported.skipped, 0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: tempUserDataDirectory.appendingPathComponent("imported-aasimar.json").path))
    }

    @Test
    func testCreatureLibraryImportRouteRejectsNonReferees() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")
        let playerSession = try await join(displayName: "Player", in: tester)

        let payload = CreatureLibraryImportInput(
            files: [
                CreatureLibraryImportFile(
                    filename: "imported-aasimar.json",
                    contents: """
                    {
                      "name": "Imported Aasimar",
                      "cr": 1,
                      "initiative": 2,
                      "hp": 11
                    }
                    """
                )
            ],
            overwrite: false
        )

        let response = try await tester.sendRequest(
            .POST,
            "/creature-library/import",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(playerSession.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )

        XCTAssertEqual(response.status, .forbidden)
    }

    @Test
    func testCreatureLibraryImportRouteSkipsExistingFileWhenOverwriteIsFalse() async throws {
        let tempBaseDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-import-skip-\(UUID().uuidString)", isDirectory: true)
        let tempUserDataDirectory = tempBaseDirectory
            .appendingPathComponent("userdata", isDirectory: true)
            .appendingPathComponent("pathfinder", isDirectory: true)
        try FileManager.default.createDirectory(at: tempUserDataDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: tempBaseDirectory) }

        let existingURL = tempUserDataDirectory.appendingPathComponent("imported-aasimar.json")
        let existingData = """
        {
          "name": "Imported Aasimar",
          "cr": 1,
          "initiativeBonus": 1,
          "hp": 9
        }
        """
        try existingData.write(to: existingURL, atomically: true, encoding: .utf8)

        let creatureLibraryConfiguration = CreatureLibraryConfiguration(
            includeLocalCreatures: true,
            localCreaturesDirectoryProvider: { _ in tempUserDataDirectory }
        )
        let tester = try await makeTester(
            selectDefaultCampaign: false,
            creatureLibraryConfiguration: creatureLibraryConfiguration,
            appDataDirectoryOverride: tempBaseDirectory
        )

        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")
        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let payload = CreatureLibraryImportInput(
            files: [
                CreatureLibraryImportFile(
                    filename: "imported-aasimar.json",
                    contents: """
                    {
                      "name": "Imported Aasimar",
                      "cr": 1,
                      "initiative": 4,
                      "hp": 11
                    }
                    """
                )
            ],
            overwrite: false
        )

        let response = try await tester.sendRequest(
            .POST,
            "/creature-library/import",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(refereeCookie)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )

        XCTAssertEqual(response.status, .ok)
        let imported = try response.content.decode(CreatureLibraryImportResponse.self)
        XCTAssertEqual(imported.imported, 0)
        XCTAssertEqual(imported.skipped, 1)

        let resultingData = try Data(contentsOf: existingURL)
        let resultingObject = try XCTUnwrap(try JSONSerialization.jsonObject(with: resultingData) as? [String: Any])
        XCTAssertEqual(resultingObject["initiativeBonus"] as? Int, 1)
        XCTAssertEqual(resultingObject["hp"] as? Int, 9)
    }

    @Test
    func testConditionsLibraryReturnsStatBlocksForTraveller2() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "traveller")

        let response = try await tester.sendRequest(.GET, "/conditions-library")
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(RuleSetLibrary.self)
        XCTAssertEqual(library.id, "traveller")
        XCTAssertEqual(library.statBlocks?.count, 2)
        XCTAssertEqual(library.statAliases?["Psionic Points"], "PSI")
        let refereeBlock = try XCTUnwrap(library.statBlocks?.first(where: { $0.id == "refereeHealthPool" }))
        XCTAssertEqual(refereeBlock.appliesTo, ["referee"])
        XCTAssertEqual(refereeBlock.stats, ["HP"])
    }

    @Test
    func testPathfinderRulesetIncludesEquipmentCategoryIcons() throws {
        let library = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")
        XCTAssertEqual(library.equipmentLibrary?.file, "pathfinder-equipment")
        XCTAssertEqual(library.equipmentLibrary?.categoryIcons?["Weapons"], "⚔️")
        XCTAssertEqual(library.equipmentLibrary?.categoryIcons?["Goods and Services"], "📜")
        XCTAssertEqual(library.equipmentLibrary?.categoryIcons?["Coins"], "🪙")
        XCTAssertEqual(library.equipmentLibrary?.categoryIcons?["Magic Item"], "🪄")
    }

    @Test
    func testEquipmentLibraryReturnsItemCategoriesForPathfinder() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")

        let response = try await tester.sendRequest(
            .GET,
            "/equipment-library?query=Abacus&limit=5"
        )
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(EquipmentLibraryResponse.self)
        XCTAssertEqual(library.rulesetId, "pathfinder")
        XCTAssertGreaterThanOrEqual(library.totalMatches, 1)
        XCTAssertEqual(library.items.first?.name, "Abacus")
        XCTAssertEqual(library.items.first?.category, "Food and Drink")
    }

    @Test
    func testTraveller2CreatureLibraryReturnsSampleBestiary() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "traveller")

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        XCTAssertEqual(travellerLibrary.creatureLibrary?.file, "traveller-bestiary.json")

        let response = try await tester.sendRequest(
            .GET,
            "/creature-library?limit=20"
        )
        XCTAssertEqual(response.status, .ok)
        let library = try response.content.decode(CreatureLibraryResponse.self)
        XCTAssertEqual(library.rulesetId, "traveller")
        XCTAssertEqual(library.rulesetLabel, "Traveller (SRD)")
        XCTAssertEqual(library.totalMatches, 11)
        XCTAssertFalse(library.hasMore)

        let cadgeree = try XCTUnwrap(library.creatures.first(where: { $0.name == "Cadgeree" }))
        XCTAssertEqual(cadgeree.source, "Secrets of the Ancients p. 51")
        XCTAssertNil(cadgeree.cr)
        XCTAssertNil(cadgeree.ac)
        XCTAssertNil(cadgeree.initiativeBonus)
        XCTAssertNil(cadgeree.alignment)
        XCTAssertEqual(cadgeree.stats?.map(\.key), ["Hits"])
        XCTAssertTrue(cadgeree.referenceUrl?.contains("#page=51") ?? false)

        let servitor = try XCTUnwrap(library.creatures.first(where: { $0.name == "Servitor" }))
        XCTAssertEqual(servitor.source, "Secrets of the Ancients p. 105")
        XCTAssertNil(servitor.cr)
        XCTAssertNil(servitor.ac)
        XCTAssertNil(servitor.initiativeBonus)
        XCTAssertNil(servitor.alignment)
        XCTAssertEqual(servitor.stats?.map(\.key), ["Hits"])
        XCTAssertTrue(servitor.referenceUrl?.contains("#page=105") ?? false)

        let cyborgAssassin = try XCTUnwrap(library.creatures.first(where: { $0.name == "Cyborg Assassin" }))
        XCTAssertEqual(cyborgAssassin.source, "Secrets of the Ancients p. 150")
        XCTAssertNil(cyborgAssassin.cr)
        XCTAssertNil(cyborgAssassin.ac)
        XCTAssertNil(cyborgAssassin.initiativeBonus)
        XCTAssertNil(cyborgAssassin.alignment)
        XCTAssertNil(cyborgAssassin.stats)
        XCTAssertTrue(cyborgAssassin.referenceUrl?.contains("#page=150") ?? false)
    }

    @Test
    func testRootRedirectsToAdminOnLocalhost() async throws {
        let tester = try await makeTester()

        let response = try await tester.sendRequest(
            .GET,
            "/",
            headers: ["Host": "localhost:8080"]
        )

        XCTAssertEqual(response.status, .seeOther)
        XCTAssertEqual(response.headers.first(name: .location), "/admin.html")
    }

    @Test
    func testIndexHtmlViewPlayerRedirectsBeforeRenderBasedOnPlayerSession() async throws {
        let tester = try await makeTester()

        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let playerSession = try await join(displayName: "Player", in: tester)

        let refereeResponse = try await tester.sendRequest(
            .GET,
            "/index.html?view=player",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeCookie)")])
        )
        XCTAssertEqual(refereeResponse.status, .seeOther)
        XCTAssertEqual(refereeResponse.headers.first(name: .location), "/referee.html")

        let playerResponse = try await tester.sendRequest(
            .GET,
            "/index.html?view=player",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])
        )
        XCTAssertEqual(playerResponse.status, .seeOther)
        XCTAssertEqual(playerResponse.headers.first(name: .location), "/player.html?view=player")

        let noCookieResponse = try await tester.sendRequest(.GET, "/index.html?view=player")
        XCTAssertEqual(noCookieResponse.status, .ok)
        XCTAssertTrue(noCookieResponse.body.string.contains("<title>"))
    }

    @Test
    func testCampaignListAndUUIDSelectionRoute() async throws {
        let tester = try await makeTester()

        let initialCampaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(initialCampaignResponse.status, .ok)
        let initialCampaign = try initialCampaignResponse.content.decode(CampaignState.self)

        let createSecondCampaignResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Second Campaign", rulesetId: "pathfinder")
            ))
        )
        XCTAssertEqual(createSecondCampaignResponse.status, .ok)
        let secondCampaign = try createSecondCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(secondCampaign.name, "Second Campaign")
        XCTAssertEqual(secondCampaign.rulesetId, "pathfinder")

        let campaignsResponse = try await tester.sendRequest(.GET, "/campaigns")
        XCTAssertEqual(campaignsResponse.status, .ok)
        let campaigns = try campaignsResponse.content.decode([CampaignSummary].self)
        XCTAssertEqual(campaigns.count, 2)
        XCTAssertEqual(campaigns.first(where: { $0.id == initialCampaign.id })?.isActive, false)
        XCTAssertEqual(campaigns.first(where: { $0.id == secondCampaign.id })?.isActive, true)

        let adminCookie = try await signInOwner(in: tester)
        let selectResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(initialCampaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectResponse.status, .ok)
        let selectedCampaign = try selectResponse.content.decode(CampaignState.self)
        XCTAssertEqual(selectedCampaign.id, initialCampaign.id)
        XCTAssertEqual(selectedCampaign.name, initialCampaign.name)
        XCTAssertEqual(selectedCampaign.rulesetId, initialCampaign.rulesetId)

        let campaignsAfterSelectResponse = try await tester.sendRequest(.GET, "/campaigns")
        XCTAssertEqual(campaignsAfterSelectResponse.status, .ok)
        let campaignsAfterSelect = try campaignsAfterSelectResponse.content.decode([CampaignSummary].self)
        XCTAssertEqual(campaignsAfterSelect.first(where: { $0.id == initialCampaign.id })?.isActive, true)
        XCTAssertEqual(campaignsAfterSelect.first(where: { $0.id == secondCampaign.id })?.isActive, false)
    }

    @Test
    func testCampaignSelectionRequiresAdminSession() async throws {
        let tester = try await makeTester()

        let createResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Player Locked", rulesetId: "pathfinder")
            ))
        )
        XCTAssertEqual(createResponse.status, .ok)
        let created = try createResponse.content.decode(CampaignState.self)

        let playerSession = try await join(displayName: "Player", in: tester)
        let selectAsPlayerResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(created.id.uuidString)/select",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(selectAsPlayerResponse.status, .unauthorized)

        let adminCookie = try await signInOwner(in: tester)
        let selectAsAdminResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(created.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectAsAdminResponse.status, .ok)
        let selected = try selectAsAdminResponse.content.decode(CampaignState.self)
        XCTAssertEqual(selected.id, created.id)
    }

    @Test
    func testCampaignSelectionRejectsRefereeSession() async throws {
        let tester = try await makeTester()

        let createResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Referee Locked", rulesetId: "pathfinder")
            ))
        )
        XCTAssertEqual(createResponse.status, .ok)
        let created = try createResponse.content.decode(CampaignState.self)

        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let selectAsRefereeResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(created.id.uuidString)/select",
            headers: ["Cookie": "roll4_player_session=\(refereeCookie)"]
        )
        XCTAssertEqual(selectAsRefereeResponse.status, .unauthorized)
    }

    @Test
    func testLegacyCharacterCreateRouteIsUnavailable() async throws {
        let tester = try await makeTester()
        _ = try await activateCampaign(tester, name: "Ancients!", rulesetId: "traveller")
        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let legacyCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: [
                "Cookie": "roll4_player_session=\(refereeCookie)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterInput(
                id: nil,
                campaignName: nil,
                ownerName: "Referee",
                name: "Legacy Scout",
                initiative: 10,
                stats: [StatEntry(key: "STR", current: 8, max: 8)],
                revealStats: true,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 0,
                isHidden: false,
                revealOnTurn: false,
                conditions: []
            )))
        )
        XCTAssertEqual(legacyCreateResponse.status, .notFound)
    }

    @Test
    func testRefereeCharacterCreatePersistsStatBlockId() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let campaign = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "traveller")
        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let createPayload = CharacterInput(
            id: nil,
            campaignName: campaign.name,
            ownerName: "Referee",
            name: "Aasimar",
            statBlockId: "refereeHealthPool",
            initiative: nil,
            stats: [StatEntry(key: "HP", current: 11, max: 11)],
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: true,
            revealOnTurn: false,
            conditions: []
        )
        let createResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaign.id.uuidString)/me/characters",
            headers: HTTPHeaders([
                ("Cookie", "roll4_player_session=\(refereeCookie)"),
                ("Content-Type", "application/json")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(createPayload))
        )
        XCTAssertEqual(createResponse.status, HTTPStatus.ok)
        let created = try createResponse.content.decode(PlayerView.self)
        XCTAssertEqual(created.statBlockId, "refereeHealthPool")
        XCTAssertEqual(created.stats.first?.key, "HP")

        let listResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaign.id.uuidString)/characters",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeCookie)")])
        )
        XCTAssertEqual(listResponse.status, .ok)
        let list = try listResponse.content.decode([PlayerView].self)
        let stored = try XCTUnwrap(list.first(where: { $0.name == "Aasimar" }))
        XCTAssertEqual(stored.statBlockId, "refereeHealthPool")
    }

    @Test
    func testRefereeEditingPlayerCharacterPreservesPlayerOwnership() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let campaign = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "traveller")
        let playerSession = try await join(displayName: "Player", in: tester)
        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let createPayload = CharacterInput(
            id: nil,
            campaignName: campaign.name,
            ownerName: "Player",
            name: "Hero",
            initiative: 12,
            stats: [StatEntry(key: "HP", current: 8, max: 10)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )
        let created = try await createMemberCharacter(
            in: tester,
            cookieToken: playerSession.cookieToken,
            payload: createPayload
        )
        XCTAssertEqual(created.ownerId, playerSession.session.player.id)
        XCTAssertEqual(created.ownerName, "Player")
        XCTAssertFalse(created.isReferee)

        let editPayload = CharacterInput(
            id: created.id,
            campaignName: campaign.name,
            ownerName: "Referee",
            name: "Hero",
            initiative: 14,
            stats: [StatEntry(key: "HP", current: 9, max: 10)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )
        let edited = try await createMemberCharacter(
            in: tester,
            cookieToken: refereeCookie,
            payload: editPayload
        )
        XCTAssertEqual(edited.id, created.id)
        XCTAssertEqual(edited.ownerId, playerSession.session.player.id)
        XCTAssertEqual(edited.ownerName, "Player")
        XCTAssertFalse(edited.isReferee)
        XCTAssertEqual(edited.initiative, 14)

        let charactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaign.id.uuidString)/characters",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeCookie)")])
        )
        XCTAssertEqual(charactersResponse.status, .ok)
        let characters = try charactersResponse.content.decode([PlayerView].self)
        let stored = try XCTUnwrap(characters.first(where: { $0.id == created.id }))
        XCTAssertEqual(stored.ownerId, playerSession.session.player.id)
        XCTAssertEqual(stored.ownerName, "Player")
        XCTAssertFalse(stored.isReferee)
    }

    @Test
    func testCampaignEventStreamAndKeepaliveRequireMembership() async throws {
        let tester = try await makeTester()
        let campaign = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "dnd5e")
        let playerSession = try await join(displayName: "Alex", in: tester)

        let streamResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaign.id.uuidString)/events",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(streamResponse.status, .ok)
        XCTAssertEqual(streamResponse.headers.first(name: .contentType), "text/event-stream; charset=utf-8")
        XCTAssertEqual(streamResponse.headers.first(name: .cacheControl), "no-cache, no-transform")
        XCTAssertTrue(streamResponse.body.string.contains("event: snapshot"))
        XCTAssertTrue(streamResponse.body.string.contains("\"campaign\""))
        XCTAssertTrue(streamResponse.body.string.contains("\"gameState\""))

        let keepaliveResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaign.id.uuidString)/keepalive",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(keepaliveResponse.status, .ok)

        let outsiderSession = try await join(displayName: "Taylor", in: tester)
        let secondCampaign = try await activateCampaign(tester, name: "Second Route Smoke", rulesetId: "dnd5e")
        let deniedStreamResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(secondCampaign.id.uuidString)/events",
            headers: ["Cookie": "roll4_player_session=\(outsiderSession.cookieToken)"]
        )
        XCTAssertEqual(deniedStreamResponse.status, .ok)

        let deniedKeepaliveResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(secondCampaign.id.uuidString)/keepalive",
            headers: ["Cookie": "roll4_player_session=\(outsiderSession.cookieToken)"]
        )
        XCTAssertEqual(deniedKeepaliveResponse.status, .forbidden)
    }

    @Test
    func testActiveCampaignEventStreamSnapshotsSelectionChanges() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)

        let noCampaignResponse = try await tester.sendRequest(.GET, "/campaign/events")
        XCTAssertEqual(noCampaignResponse.status, .ok)
        XCTAssertEqual(
            noCampaignResponse.headers.first(name: .contentType),
            "text/event-stream; charset=utf-8"
        )
        XCTAssertTrue(noCampaignResponse.body.string.contains("event: snapshot"))
        XCTAssertTrue(noCampaignResponse.body.string.contains("\"campaign\":null"))

        let createCampaignResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Join Stream", rulesetId: "dnd5e")
            ))
        )
        XCTAssertEqual(createCampaignResponse.status, .ok)
        let createdCampaign = try createCampaignResponse.content.decode(CampaignState.self)

        let adminCookie = try await signInOwner(in: tester)
        let selectResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(createdCampaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectResponse.status, .ok)

        let campaignResponse = try await tester.sendRequest(.GET, "/campaign/events")
        XCTAssertEqual(campaignResponse.status, .ok)
        XCTAssertTrue(campaignResponse.body.string.contains("event: snapshot"))
        XCTAssertTrue(campaignResponse.body.string.contains("\"name\":\"Join Stream\""))
    }

    @Test
    func testCampaignCreateAndEditRoutesDoNotActivateCampaign() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")

        let createAlphaResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Ancients!", rulesetId: travellerLibrary.id)
            ))
        )
        XCTAssertEqual(createAlphaResponse.status, .ok)
        let alphaCampaign = try createAlphaResponse.content.decode(CampaignSummary.self)
        XCTAssertFalse(alphaCampaign.isActive)

        let noCampaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(noCampaignResponse.status, .conflict)

        let adminCookie = try await signInOwner(in: tester)
        let selectAlphaResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(alphaCampaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectAlphaResponse.status, .ok)
        let selectedAlpha = try selectAlphaResponse.content.decode(CampaignState.self)
        XCTAssertEqual(selectedAlpha.id, alphaCampaign.id)

        let createBetaResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(createBetaResponse.status, .ok)
        let betaCampaign = try createBetaResponse.content.decode(CampaignSummary.self)
        XCTAssertFalse(betaCampaign.isActive)

        let editBetaResponse = try await tester.sendRequest(
            .PATCH,
            "/campaigns/\(betaCampaign.id.uuidString)",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance Revised", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(editBetaResponse.status, .ok)
        let updatedBeta = try editBetaResponse.content.decode(CampaignSummary.self)
        XCTAssertEqual(updatedBeta.id, betaCampaign.id)
        XCTAssertEqual(updatedBeta.name, "Hell's Vengance Revised")
        XCTAssertFalse(updatedBeta.isActive)

        let activeCampaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(activeCampaignResponse.status, .ok)
        let activeCampaign = try activeCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(activeCampaign.id, alphaCampaign.id)
        XCTAssertEqual(activeCampaign.name, "Ancients!")
        XCTAssertEqual(activeCampaign.rulesetId, travellerLibrary.id)

        let campaignsResponse = try await tester.sendRequest(.GET, "/campaigns")
        XCTAssertEqual(campaignsResponse.status, .ok)
        let campaigns = try campaignsResponse.content.decode([CampaignSummary].self)
        XCTAssertEqual(campaigns.first(where: { $0.id == alphaCampaign.id })?.isActive, true)
        XCTAssertEqual(campaigns.first(where: { $0.id == betaCampaign.id })?.isActive, false)
        XCTAssertEqual(campaigns.first(where: { $0.id == betaCampaign.id })?.name, "Hell's Vengance Revised")
    }

    @Test
    func testCharacterStateAndEncounterFlowRoutes() async throws {
        let tester = try await makeTester()
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let ownerId = UUID()
        let payload = CharacterInput(
            id: nil,
            campaignName: "Route Smoke",
            ownerName: "Player",
            name: "Hero",
            initiative: 12,
            stats: [StatEntry(key: "HP", current: 8, max: 10)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let character = try await createMemberCharacter(
            in: tester,
            cookieToken: refereeSession,
            payload: payload
        )
        XCTAssertNotEqual(character.ownerId, ownerId)
        XCTAssertEqual(character.name, "Hero")
        XCTAssertEqual(character.initiative, 12)

        let initialStateResponse = try await tester.sendRequest(
            .GET,
            "/state",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(initialStateResponse.status, .ok)
        let initialState = try initialStateResponse.content.decode(GameState.self)
        XCTAssertEqual(initialState.encounterState, .new)
        XCTAssertNil(initialState.currentTurnId)
        XCTAssertEqual(initialState.players.map(\.name), ["Hero"])

        let startResponse = try await tester.sendRequest(
            .POST,
            "/encounter/start",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(startResponse.status, .ok)
        let startedState = try startResponse.content.decode(GameState.self)
        XCTAssertEqual(startedState.encounterState, .active)
        XCTAssertEqual(startedState.currentTurnName, "Hero")

        let turnCompleteResponse = try await tester.sendRequest(
            .POST,
            "/turn-complete",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(turnCompleteResponse.status, .ok)
        let nextState = try turnCompleteResponse.content.decode(GameState.self)
        XCTAssertEqual(nextState.encounterState, .active)
        XCTAssertEqual(nextState.currentTurnName, "Hero")
        XCTAssertEqual(nextState.round, 2)

        let suspendResponse = try await tester.sendRequest(
            .POST,
            "/encounter/suspend",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeSession)")])
        )
        XCTAssertEqual(suspendResponse.status, .ok)
        let suspendedState = try suspendResponse.content.decode(GameState.self)
        XCTAssertEqual(suspendedState.encounterState, .suspended)
        XCTAssertEqual(suspendedState.currentTurnName, "Hero")
        XCTAssertEqual(suspendedState.round, 2)

        let resumeResponse = try await tester.sendRequest(
            .POST,
            "/encounter/resume",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeSession)")])
        )
        XCTAssertEqual(resumeResponse.status, .ok)
        let resumedState = try resumeResponse.content.decode(GameState.self)
        XCTAssertEqual(resumedState.encounterState, .active)
        XCTAssertEqual(resumedState.currentTurnName, "Hero")
        XCTAssertEqual(resumedState.round, 2)
    }

    @Test
    func testEncounterStartAutoRollsUnsetGroupedRefereeCharacters() async throws {
        let tester = try await makeTester()
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let groupId = UUID()

        let first = try await createMemberCharacter(
            in: tester,
            cookieToken: refereeSession,
            payload: CharacterInput(
                id: nil,
                campaignName: nil,
                ownerName: "Referee",
                name: "Goblin (1)",
                initiative: nil,
                stats: [StatEntry(key: "HP", current: 5, max: 5)],
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 2,
                isHidden: false,
                revealOnTurn: false,
                initiativeGroupId: groupId,
                initiativeGroupIndex: 1,
                conditions: []
            )
        )
        let second = try await createMemberCharacter(
            in: tester,
            cookieToken: refereeSession,
            payload: CharacterInput(
                id: nil,
                campaignName: nil,
                ownerName: "Referee",
                name: "Goblin (2)",
                initiative: nil,
                stats: [StatEntry(key: "HP", current: 5, max: 5)],
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 2,
                isHidden: false,
                revealOnTurn: false,
                initiativeGroupId: groupId,
                initiativeGroupIndex: 2,
                conditions: []
            )
        )
        let solo = try await createMemberCharacter(
            in: tester,
            cookieToken: refereeSession,
            payload: CharacterInput(
                id: nil,
                campaignName: nil,
                ownerName: "Referee",
                name: "Orc",
                initiative: nil,
                stats: [StatEntry(key: "HP", current: 10, max: 10)],
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 1,
                isHidden: false,
                revealOnTurn: false,
                conditions: []
            )
        )

        let startResponse = try await tester.sendRequest(
            .POST,
            "/encounter/start",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeSession)")])
        )
        XCTAssertEqual(startResponse.status, .ok)
        let startedState = try startResponse.content.decode(GameState.self)
        XCTAssertEqual(startedState.encounterState, .active)

        let rolledFirst = try XCTUnwrap(startedState.players.first(where: { $0.id == first.id }))
        let rolledSecond = try XCTUnwrap(startedState.players.first(where: { $0.id == second.id }))
        let rolledSolo = try XCTUnwrap(startedState.players.first(where: { $0.id == solo.id }))

        XCTAssertNotNil(rolledFirst.initiative)
        XCTAssertNotNil(rolledSecond.initiative)
        XCTAssertEqual(rolledFirst.initiative, rolledSecond.initiative)
        XCTAssertNotNil(rolledSolo.initiative)
    }

    @Test
    func testEncounterStartDoesNotOverwriteAlreadyRolledGroupMembers() async throws {
        let tester = try await makeTester()
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let groupId = UUID()

        let rolled = try await createMemberCharacter(
            in: tester,
            cookieToken: refereeSession,
            payload: CharacterInput(
                id: nil,
                campaignName: nil,
                ownerName: "Referee",
                name: "Skeleton (1)",
                initiative: 15,
                stats: [StatEntry(key: "HP", current: 6, max: 6)],
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 2,
                isHidden: false,
                revealOnTurn: false,
                initiativeGroupId: groupId,
                initiativeGroupIndex: 1,
                conditions: []
            )
        )
        let unset = try await createMemberCharacter(
            in: tester,
            cookieToken: refereeSession,
            payload: CharacterInput(
                id: nil,
                campaignName: nil,
                ownerName: "Referee",
                name: "Skeleton (2)",
                initiative: nil,
                stats: [StatEntry(key: "HP", current: 6, max: 6)],
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 2,
                isHidden: false,
                revealOnTurn: false,
                initiativeGroupId: groupId,
                initiativeGroupIndex: 2,
                conditions: []
            )
        )

        let startResponse = try await tester.sendRequest(
            .POST,
            "/encounter/start",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeSession)")])
        )
        XCTAssertEqual(startResponse.status, .ok)
        let startedState = try startResponse.content.decode(GameState.self)

        let rolledCharacter = try XCTUnwrap(startedState.players.first(where: { $0.id == rolled.id }))
        let unsetCharacter = try XCTUnwrap(startedState.players.first(where: { $0.id == unset.id }))

        XCTAssertEqual(rolledCharacter.initiative, 15)
        XCTAssertNotNil(unsetCharacter.initiative)
    }

    @Test
    func testTurnCompleteRejectsInactiveEncounter() async throws {
        let tester = try await makeTester()
        let playerSession = try await join(displayName: "Player", in: tester)

        let response = try await tester.sendRequest(
            .POST,
            "/turn-complete",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(playerSession.cookieToken)")])
        )
        XCTAssertEqual(response.status, .conflict)
    }

    @Test
    func testServerBootstrapConfiguresRoutesWithoutLaunchingProductionServer() async throws {
        let app = try await Application.make(.testing)
        await app.userStore.resetMemoryForTesting()

        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Bootstrap Smoke"
        options.databaseFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-bootstrap-smoke-\(UUID().uuidString).sqlite3")
        options.restorePersistedState = false
        options.persistChanges = false
        options.launchBrowser = false
        options.verboseOutput = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app, options: options, library: library)

        XCTAssertEqual(app.http.server.configuration.hostname, "127.0.0.1")
        XCTAssertEqual(app.http.server.configuration.port, 0)

        let tester = try app.testable()
        let response = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(response.status, .conflict)
        XCTAssertTrue(response.body.string.contains("No campaign selected"))
    }

    @Test
    func testLegacyRoutesRejectRequestsWithoutActiveCampaign() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)

        let stateResponse = try await tester.sendRequest(.GET, "/state")
        XCTAssertEqual(stateResponse.status, .conflict)
        XCTAssertTrue(stateResponse.body.string.contains("No campaign selected"))

        let usersResponse = try await tester.sendRequest(.GET, "/users")
        XCTAssertEqual(usersResponse.status, .conflict)
        XCTAssertTrue(usersResponse.body.string.contains("No campaign selected"))

        let campaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(campaignResponse.status, .conflict)
        XCTAssertTrue(campaignResponse.body.string.contains("No campaign selected"))
    }

    @Test
    func testCharacterPersistsAcrossRestartWithSQLite() async throws {
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-persist-\(UUID().uuidString).sqlite3")

        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Persist Smoke"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false
        options.verboseOutput = false

        let app1 = try await Application.make(.testing)
        try await ServerBootstrap.configure(app1, options: options, library: library)
        let tester1 = try app1.testable()
        try await activateCampaign(tester1, name: "Persist Smoke", rulesetId: library.id)
        let playerSession = try await join(displayName: "Player", in: tester1)

        let payload = CharacterInput(
            id: nil,
            campaignName: "Persist Smoke",
            ownerName: "Player",
            name: "Persisted Hero",
            initiative: 17,
            stats: [StatEntry(key: "HP", current: 9, max: 12)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 1,
            isHidden: false,
            revealOnTurn: false,
            conditions: ["Blessed"]
        )

        _ = try await createMemberCharacter(
            in: tester1,
            cookieToken: playerSession.cookieToken,
            payload: payload
        )

        try await app1.asyncShutdown()
        let app2 = try await Application.make(.testing)
        await app2.userStore.resetMemoryForTesting()
        try await ServerBootstrap.configure(app2, options: options, library: library)
        let tester2 = try app2.testable()

        let usersResponse = try await tester2.sendRequest(.GET, "/users")
        XCTAssertEqual(usersResponse.status, .ok)
        let users = try usersResponse.content.decode([UserData].self)
        XCTAssertTrue(users.contains { $0.name == "Persisted Hero" && $0.initiative == 17 })

        let restoredCampaignResponse = try await tester2.sendRequest(.GET, "/campaign")
        XCTAssertEqual(restoredCampaignResponse.status, .ok)
        let restoredCampaign = try restoredCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(restoredCampaign.id, playerSession.session.campaign.id)

        try await app2.asyncShutdown()
    }

    @Test
    func testActiveCampaignPersistsAcrossRestartWithSQLite() async throws {
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-active-\(UUID().uuidString).sqlite3")

        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Active Smoke"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        let app1 = try await Application.make(.testing)
        try await ServerBootstrap.configure(app1, options: options, library: library)
        let tester1 = try app1.testable()
        _ = try await activateCampaign(tester1, name: "First Smoke", rulesetId: library.id)
        _ = try await join(displayName: "Player", in: tester1)
        let adminCookie = try await signInOwner(in: tester1)

        let secondCampaignResponse = try await tester1.sendRequest(
            .POST,
            "/campaigns",
            headers: [
                "Cookie": "roll4_session=\(adminCookie)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Last Smoke", rulesetId: library.id)
            ))
        )
        XCTAssertEqual(secondCampaignResponse.status, .ok)
        let secondCampaign = try secondCampaignResponse.content.decode(CampaignSummary.self)

        let selectSecondResponse = try await tester1.sendRequest(
            .POST,
            "/campaigns/\(secondCampaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectSecondResponse.status, .ok)
        let selectedSecond = try selectSecondResponse.content.decode(CampaignState.self)
        XCTAssertEqual(selectedSecond.id, secondCampaign.id)

        try await app1.asyncShutdown()

        let app2 = try await Application.make(.testing)
        await app2.userStore.resetMemoryForTesting()
        try await ServerBootstrap.configure(app2, options: options, library: library)
        let tester2 = try app2.testable()

        let restoredCampaignResponse = try await tester2.sendRequest(.GET, "/campaign")
        XCTAssertEqual(restoredCampaignResponse.status, .ok)
        let restoredCampaign = try restoredCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(restoredCampaign.id, secondCampaign.id)
        XCTAssertEqual(restoredCampaign.name, "Last Smoke")

        try await app2.asyncShutdown()
    }

    @Test
    func testFreshPackagedSQLiteDatabaseBootsCleanly() async throws {
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        let databaseDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-packaged-\(UUID().uuidString)", isDirectory: true)
        let databaseURL = databaseDirectory
            .appendingPathComponent("data", isDirectory: true)
            .appendingPathComponent("app.sqlite3")

        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Packaged Smoke"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false
        options.verboseOutput = false

        let app = try await Application.make(.testing)
        try await ServerBootstrap.configure(app, options: options, library: library)
        let tester = try app.testable()

        let response = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(response.status, .conflict)
        XCTAssertTrue(response.body.string.contains("No campaign selected"))

        let campaignsResponse = try await tester.sendRequest(.GET, "/campaigns")
        XCTAssertEqual(campaignsResponse.status, .ok)
        let campaigns = try campaignsResponse.content.decode([CampaignSummary].self)
        XCTAssertTrue(campaigns.isEmpty)

        XCTAssertTrue(FileManager.default.fileExists(atPath: databaseURL.path))

        try await app.asyncShutdown()
    }

    @Test
    func testChangingCampaignPreservesEachCampaignStateAndClearsRoster() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-switch-\(UUID().uuidString).sqlite3")

        let initialLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let switchedLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")

        let app = try await Application.make(.testing)

        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Ancients!"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app, options: options, library: initialLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: initialLibrary.id)

        let initialRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Traveller Referee")

        let ownerId = UUID()
        let payload = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: "Referee",
            name: "Traveller Scout",
            initiative: 11,
            stats: [StatEntry(key: "STR", current: 8, max: 8)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        _ = try await createMemberCharacter(
            in: tester,
            cookieToken: initialRefereeCookie,
            payload: payload
        )

        let beforeSwitchResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(initialRefereeCookie)")])
        )
        XCTAssertEqual(beforeSwitchResponse.status, .ok)
        let beforeSwitchState = try beforeSwitchResponse.content.decode(GameState.self)
        XCTAssertEqual(beforeSwitchState.players.map(\.name), ["Traveller Scout"])

        let startResponse = try await tester.sendRequest(
            .POST,
            "/encounter/start",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(initialRefereeCookie)")])
        )
        XCTAssertEqual(startResponse.status, .ok)
        let activeState = try startResponse.content.decode(GameState.self)
        XCTAssertEqual(activeState.encounterState, .active)
        XCTAssertEqual(activeState.currentTurnName, "Traveller Scout")

        let switchResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: switchedLibrary.id)
            ))
        )
        XCTAssertEqual(switchResponse.status, .ok)
        let switchedCampaign = try switchResponse.content.decode(CampaignState.self)
        XCTAssertEqual(switchedCampaign.name, "Hell's Vengance")
        XCTAssertEqual(switchedCampaign.rulesetId, switchedLibrary.id)
        XCTAssertEqual(switchedCampaign.encounterState, .new)

        let switchedRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Pathfinder Referee")
        let afterSwitchResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(switchedRefereeCookie)")])
        )
        XCTAssertEqual(afterSwitchResponse.status, .ok)
        let afterSwitchState = try afterSwitchResponse.content.decode(GameState.self)
        XCTAssertTrue(afterSwitchState.players.isEmpty)
        XCTAssertEqual(afterSwitchState.encounterState, .new)

        let restoreResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Ancients!", rulesetId: initialLibrary.id)
            ))
        )
        XCTAssertEqual(restoreResponse.status, .ok)
        let restoredCampaign = try restoreResponse.content.decode(CampaignState.self)
        XCTAssertEqual(restoredCampaign.name, "Ancients!")
        XCTAssertEqual(restoredCampaign.rulesetId, initialLibrary.id)
        XCTAssertEqual(restoredCampaign.encounterState, .active)

        let restoredStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(initialRefereeCookie)")])
        )
        XCTAssertEqual(restoredStateResponse.status, .ok)
        let restoredState = try restoredStateResponse.content.decode(GameState.self)
        XCTAssertEqual(restoredState.players.map(\.name), ["Traveller Scout"])
        XCTAssertEqual(restoredState.encounterState, .active)
        XCTAssertEqual(restoredState.currentTurnName, "Traveller Scout")

        try await app.asyncShutdown()
    }

    @Test
    func testCampaignEncounterStateSurvivesRestartPerCampaign() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-encounter-restart-\(UUID().uuidString).sqlite3")

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")

        func makeOptions(campaignName: String) -> ServerBootstrapOptions {
            var options = ServerBootstrapOptions.production
            options.hostname = "127.0.0.1"
            options.port = 0
            options.campaignName = campaignName
            options.databaseFileURL = databaseURL
            options.restorePersistedState = true
            options.persistChanges = true
            options.launchBrowser = false
        options.verboseOutput = false
            options.verboseOutput = false
            return options
        }

        let app1 = try await Application.make(.testing)
        try await ServerBootstrap.configure(app1, options: makeOptions(campaignName: "Ancients!"), library: travellerLibrary)
        let tester1 = try app1.testable()
        try await activateCampaign(tester1, name: "Ancients!", rulesetId: travellerLibrary.id)
        let travellerStartCookie = try await grantRefereeAccess(in: tester1, displayName: "Referee")

        let travellerCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: "Referee",
            name: "Traveller Scout",
            initiative: 11,
            stats: [StatEntry(key: "STR", current: 8, max: 8)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        _ = try await createMemberCharacter(
            in: tester1,
            cookieToken: travellerStartCookie,
            payload: travellerCharacter
        )

        let travellerStartResponse = try await tester1.sendRequest(
            .POST,
            "/encounter/start",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(travellerStartCookie)")])
        )
        XCTAssertEqual(travellerStartResponse.status, .ok)
        let travellerStartedState = try travellerStartResponse.content.decode(GameState.self)
        XCTAssertEqual(travellerStartedState.encounterState, .active)
        XCTAssertEqual(travellerStartedState.currentTurnName, "Traveller Scout")

        let switchToPathfinderResponse = try await tester1.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(switchToPathfinderResponse.status, .ok)

        let pathfinderCharacter = CharacterInput(
            id: nil,
            campaignName: "Hell's Vengance",
            ownerName: "Referee",
            name: "Pathfinder Scout",
            initiative: 14,
            stats: [StatEntry(key: "HP", current: 9, max: 10)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let pathfinderStartCookie = try await grantRefereeAccess(in: tester1, displayName: "Referee")
        _ = try await createMemberCharacter(
            in: tester1,
            cookieToken: pathfinderStartCookie,
            payload: pathfinderCharacter
        )

        let pathfinderStartResponse = try await tester1.sendRequest(
            .POST,
            "/encounter/start",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(pathfinderStartCookie)")])
        )
        XCTAssertEqual(pathfinderStartResponse.status, .ok)
        let pathfinderStartedState = try pathfinderStartResponse.content.decode(GameState.self)
        XCTAssertEqual(pathfinderStartedState.encounterState, .active)
        XCTAssertEqual(pathfinderStartedState.currentTurnName, "Pathfinder Scout")

        try await app1.asyncShutdown()
        let app2 = try await Application.make(.testing)
        await app2.userStore.resetMemoryForTesting()
        try await ServerBootstrap.configure(app2, options: makeOptions(campaignName: "Ancients!"), library: travellerLibrary)
        let tester2 = try app2.testable()
        try await activateCampaign(tester2, name: "Ancients!", rulesetId: travellerLibrary.id)

        let restoredTravellerCampaignResponse = try await tester2.sendRequest(.GET, "/campaign")
        XCTAssertEqual(restoredTravellerCampaignResponse.status, .ok)
        let restoredTravellerCampaign = try restoredTravellerCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(restoredTravellerCampaign.name, "Ancients!")
        XCTAssertEqual(restoredTravellerCampaign.rulesetId, travellerLibrary.id)
        XCTAssertEqual(restoredTravellerCampaign.encounterState, .active)

        let restoredTravellerRefereeCookie = try await grantRefereeAccess(in: tester2, displayName: "Referee")
        let restoredTravellerStateResponse = try await tester2.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(restoredTravellerRefereeCookie)")])
        )
        XCTAssertEqual(restoredTravellerStateResponse.status, .ok)
        let restoredTravellerState = try restoredTravellerStateResponse.content.decode(GameState.self)
        XCTAssertEqual(restoredTravellerState.players.map(\.name), ["Traveller Scout"])
        XCTAssertEqual(restoredTravellerState.encounterState, .active)
        XCTAssertEqual(restoredTravellerState.currentTurnName, "Traveller Scout")

        try await app2.asyncShutdown()
        let app3 = try await Application.make(.testing)
        await app3.userStore.resetMemoryForTesting()
        try await ServerBootstrap.configure(app3, options: makeOptions(campaignName: "Hell's Vengance"), library: pathfinderLibrary)
        let tester3 = try app3.testable()
        try await activateCampaign(tester3, name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)

        let restoredPathfinderCampaignResponse = try await tester3.sendRequest(.GET, "/campaign")
        XCTAssertEqual(restoredPathfinderCampaignResponse.status, .ok)
        let restoredPathfinderCampaign = try restoredPathfinderCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(restoredPathfinderCampaign.name, "Hell's Vengance")
        XCTAssertEqual(restoredPathfinderCampaign.rulesetId, pathfinderLibrary.id)
        XCTAssertEqual(restoredPathfinderCampaign.encounterState, .active)

        let pathfinderRefereeCookie = try await grantRefereeAccess(in: tester3, displayName: "Referee")
        let restoredPathfinderStateResponse = try await tester3.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(pathfinderRefereeCookie)")])
        )
        XCTAssertEqual(restoredPathfinderStateResponse.status, .ok)
        let restoredPathfinderState = try restoredPathfinderStateResponse.content.decode(GameState.self)
        XCTAssertEqual(restoredPathfinderState.players.map(\.name), ["Pathfinder Scout"])
        XCTAssertEqual(restoredPathfinderState.encounterState, .active)
        XCTAssertEqual(restoredPathfinderState.currentTurnName, "Pathfinder Scout")

        try await app3.asyncShutdown()
    }

    @Test
    func testDeletingCharacterOnlyAffectsCurrentCampaign() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-delete-\(UUID().uuidString).sqlite3")

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")

        let app = try await Application.make(.testing)
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Ancients!"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app, options: options, library: travellerLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: travellerLibrary.id)
        let ancientRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Ancients Referee")

        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: "Referee",
            name: "Ancient Scout",
            initiative: 9,
            stats: [StatEntry(key: "STR", current: 7, max: 7)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let ancientView = try await createMemberCharacter(
            in: tester,
            cookieToken: ancientRefereeCookie,
            payload: ancientCharacter
        )
        let switchResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(switchResponse.status, .ok)

        let pathfinderCharacter = CharacterInput(
            id: nil,
            campaignName: "Hell's Vengance",
            ownerName: "Referee",
            name: "Pathfinder Scout",
            initiative: 13,
            stats: [StatEntry(key: "HP", current: 8, max: 9)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let pathfinderCreateCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")
        _ = try await createMemberCharacter(
            in: tester,
            cookieToken: pathfinderCreateCookie,
            payload: pathfinderCharacter
        )

        let switchBackResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Ancients!", rulesetId: travellerLibrary.id)
            ))
        )
        XCTAssertEqual(switchBackResponse.status, .ok)

        let deleteResponse = try await tester.sendRequest(.DELETE, "/characters/\(ancientView.id.uuidString)")
        XCTAssertEqual(deleteResponse.status, .ok)

        let restoredUsersResponse = try await tester.sendRequest(.GET, "/users")
        XCTAssertEqual(restoredUsersResponse.status, .ok)
        let restoredUsers = try restoredUsersResponse.content.decode([UserData].self)
        XCTAssertTrue(restoredUsers.isEmpty)

        let switchForwardResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(switchForwardResponse.status, .ok)

        let pathfinderUsersResponse = try await tester.sendRequest(.GET, "/users")
        XCTAssertEqual(pathfinderUsersResponse.status, .ok)
        let pathfinderUsers = try pathfinderUsersResponse.content.decode([UserData].self)
        XCTAssertTrue(pathfinderUsers.contains { $0.name == "Pathfinder Scout" })
        XCTAssertFalse(pathfinderUsers.contains { $0.name == "Ancient Scout" })

        let pathfinderRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Pathfinder Referee")
        let restoredStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(pathfinderRefereeCookie)")])
        )
        XCTAssertEqual(restoredStateResponse.status, .ok)
        let restoredState = try restoredStateResponse.content.decode(GameState.self)
        XCTAssertEqual(restoredState.players.map(\.name), ["Pathfinder Scout"])

        try await app.asyncShutdown()
    }

    @Test
    func testDeletedCurrentTurnFallsBackToRemainingCharacterOnRestart() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-turn-fallback-\(UUID().uuidString).sqlite3")

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")

        let app1 = try await Application.make(.testing)
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Ancients!"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app1, options: options, library: travellerLibrary)
        let tester1 = try app1.testable()
        try await activateCampaign(tester1, name: "Ancients!", rulesetId: travellerLibrary.id)
        let refereeCookie = try await grantRefereeAccess(in: tester1, displayName: "Referee")

        let firstCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: "Referee",
            name: "Lead Scout",
            initiative: 15,
            stats: [StatEntry(key: "STR", current: 8, max: 8)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let secondCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: "Referee",
            name: "Backup Scout",
            initiative: 10,
            stats: [StatEntry(key: "STR", current: 7, max: 7)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let firstView = try await createMemberCharacter(
            in: tester1,
            cookieToken: refereeCookie,
            payload: firstCharacter
        )

        let secondView = try await createMemberCharacter(
            in: tester1,
            cookieToken: refereeCookie,
            payload: secondCharacter
        )

        let startResponse = try await tester1.sendRequest(
            .POST,
            "/encounter/start",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeCookie)")])
        )
        XCTAssertEqual(startResponse.status, .ok)
        let startedState = try startResponse.content.decode(GameState.self)
        XCTAssertEqual(startedState.currentTurnId, firstView.id)

        let deleteResponse = try await tester1.sendRequest(.DELETE, "/characters/\(firstView.id.uuidString)")
        XCTAssertEqual(deleteResponse.status, .ok)

        try await app1.asyncShutdown()
        let app2 = try await Application.make(.testing)
        await app2.userStore.resetMemoryForTesting()
        try await ServerBootstrap.configure(app2, options: options, library: travellerLibrary)
        let tester2 = try app2.testable()
        try await activateCampaign(tester2, name: "Ancients!", rulesetId: travellerLibrary.id)

        let restoredStateResponse = try await tester2.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(refereeCookie)")])
        )
        XCTAssertEqual(restoredStateResponse.status, .ok)
        let restoredState = try restoredStateResponse.content.decode(GameState.self)
        XCTAssertEqual(restoredState.currentTurnId, secondView.id)
        XCTAssertEqual(restoredState.currentTurnName, "Backup Scout")
        XCTAssertEqual(restoredState.players.map(\.name), ["Backup Scout"])

        try await app2.asyncShutdown()
    }

    @Test
    func testRenamingOwnerOnlyAffectsCurrentCampaign() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-rename-\(UUID().uuidString).sqlite3")

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")

        let app = try await Application.make(.testing)
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Ancients!"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app, options: options, library: travellerLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: travellerLibrary.id)

        let sharedOwnerId = UUID()
        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: "Shared Owner",
            name: "Ancient Scout",
            initiative: 9,
            stats: [StatEntry(key: "STR", current: 7, max: 7)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let ancientRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Ancients Referee")
        let ancientView = try await createMemberCharacter(
            in: tester,
            cookieToken: ancientRefereeCookie,
            payload: ancientCharacter
        )

        let switchResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(switchResponse.status, .ok)

        let pathfinderCharacter = CharacterInput(
            id: nil,
            campaignName: "Hell's Vengance",
            ownerName: "Shared Owner",
            name: "Pathfinder Scout",
            initiative: 13,
            stats: [StatEntry(key: "HP", current: 8, max: 9)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let pathfinderCreateCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let pathfinderView = try await createMemberCharacter(
            in: tester,
            cookieToken: pathfinderCreateCookie,
            payload: pathfinderCharacter
        )

        let renameResponse = try await tester.sendRequest(
            .POST,
            "/players/\(pathfinderView.ownerId.uuidString)/rename",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterRenameInput(name: "Referee Prime")))
        )
        XCTAssertEqual(renameResponse.status, .ok)

        let pathfinderRefereeCookie = pathfinderCreateCookie
        let pathfinderStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(pathfinderRefereeCookie)")])
        )
        XCTAssertEqual(pathfinderStateResponse.status, .ok)
        let pathfinderState = try pathfinderStateResponse.content.decode(GameState.self)
        XCTAssertTrue(pathfinderState.players.contains { $0.ownerName == "Referee Prime" && $0.name == "Pathfinder Scout" })
        XCTAssertFalse(pathfinderState.players.contains { $0.ownerId == ancientView.ownerId })

        let switchBackResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Ancients!", rulesetId: travellerLibrary.id)
            ))
        )
        XCTAssertEqual(switchBackResponse.status, .ok)

        let restoredStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(ancientRefereeCookie)")])
        )
        XCTAssertEqual(restoredStateResponse.status, .ok)
        let restoredState = try restoredStateResponse.content.decode(GameState.self)
        let restoredAncient = restoredState.players.first(where: { $0.ownerId == ancientView.ownerId })
        XCTAssertEqual(restoredAncient?.ownerName, "Ancients Referee")
        XCTAssertEqual(restoredAncient?.name, "Ancient Scout")
        XCTAssertFalse(restoredState.players.contains { $0.ownerName == "Referee Prime" })

        let restoredUsersResponse = try await tester.sendRequest(.GET, "/users")
        XCTAssertEqual(restoredUsersResponse.status, .ok)
        let restoredUsers = try restoredUsersResponse.content.decode([UserData].self)
        XCTAssertTrue(restoredUsers.contains { $0.name == "Ancient Scout" })
        XCTAssertFalse(restoredUsers.contains { $0.name == "Pathfinder Scout" })

        try await app.asyncShutdown()
    }

    @Test
    func testConditionsOnlyAffectCurrentCampaign() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-conditions-\(UUID().uuidString).sqlite3")

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")

        let app = try await Application.make(.testing)
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Ancients!"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app, options: options, library: travellerLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: travellerLibrary.id)

        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: "Referee",
            name: "Shared Scout",
            initiative: 9,
            stats: [StatEntry(key: "STR", current: 7, max: 7)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: ["Bleed"]
        )

        let ancientRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Ancients Referee")
        _ = try await createMemberCharacter(
            in: tester,
            cookieToken: ancientRefereeCookie,
            payload: ancientCharacter
        )

        let switchResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(switchResponse.status, .ok)

        let pathfinderCharacter = CharacterInput(
            id: nil,
            campaignName: "Hell's Vengance",
            ownerName: "Referee",
            name: "Shared Scout",
            initiative: 13,
            stats: [StatEntry(key: "HP", current: 8, max: 9)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: ["Flat-Footed"]
        )

        let pathfinderRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Pathfinder Referee")
        _ = try await createMemberCharacter(
            in: tester,
            cookieToken: pathfinderRefereeCookie,
            payload: pathfinderCharacter
        )

        let setConditionsResponse = try await tester.sendRequest(
            .POST,
            "/conditions",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(pathfinderRefereeCookie)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                ConditionsInput(name: "Shared Scout", conditions: ["Flat-Footed", "Shaken"])
            ))
        )
        XCTAssertEqual(setConditionsResponse.status, .ok)

        let pathfinderStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(pathfinderRefereeCookie)")])
        )
        XCTAssertEqual(pathfinderStateResponse.status, .ok)
        let pathfinderState = try pathfinderStateResponse.content.decode(GameState.self)
        let pathfinderScout = try XCTUnwrap(pathfinderState.players.first(where: { $0.name == "Shared Scout" }))
        XCTAssertEqual(Set(pathfinderScout.conditions), Set(["Flat-Footed", "Shaken"]))

        let switchBackResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Ancients!", rulesetId: travellerLibrary.id)
            ))
        )
        XCTAssertEqual(switchBackResponse.status, .ok)

        let ancientStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(ancientRefereeCookie)")])
        )
        XCTAssertEqual(ancientStateResponse.status, .ok)
        let ancientState = try ancientStateResponse.content.decode(GameState.self)
        let ancientScout = try XCTUnwrap(ancientState.players.first(where: { $0.name == "Shared Scout" }))
        XCTAssertEqual(Set(ancientScout.conditions), Set(["Bleed"]))

        try await app.asyncShutdown()
    }

    @Test
    func testVisibilityOnlyAffectsCurrentCampaign() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-visibility-\(UUID().uuidString).sqlite3")

        let travellerLibrary = try RuleSetLibraryLoader.loadLibrary(id: "traveller")
        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")

        let app = try await Application.make(.testing)
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Ancients!"
        options.databaseFileURL = databaseURL
        options.restorePersistedState = true
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app, options: options, library: travellerLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: travellerLibrary.id)

        let ancientRefereeJoin = try await join(displayName: "Referee", in: tester)
        let ancientCampaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(ancientCampaignResponse.status, .ok)
        let ancientCampaign = try ancientCampaignResponse.content.decode(CampaignState.self)
        let ancientRefereeUpdate = CampaignUpdateInput(
            name: ancientCampaign.name,
            rulesetId: ancientCampaign.rulesetId,
            claimTimeoutMinutes: ancientCampaign.claimTimeoutMinutes,
            refereeSessionIds: [ancientRefereeJoin.session.player.id]
        )
        let ancientRefereeUpdateResponse = try await tester.sendRequest(
            .PATCH,
            "/campaigns/\(ancientCampaign.id.uuidString)",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(ancientRefereeUpdate))
        )
        XCTAssertEqual(ancientRefereeUpdateResponse.status, .ok)

        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerName: ancientRefereeJoin.session.player.displayName,
            name: "Visible Scout",
            initiative: 9,
            stats: [StatEntry(key: "STR", current: 7, max: 7)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: true,
            revealOnTurn: true,
            conditions: []
        )

        let ancientView = try await createMemberCharacter(
            in: tester,
            cookieToken: ancientRefereeJoin.cookieToken,
            payload: ancientCharacter
        )
        XCTAssertTrue(ancientView.isHidden)
        XCTAssertTrue(ancientView.revealOnTurn)

        let switchResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Hell's Vengance", rulesetId: pathfinderLibrary.id)
            ))
        )
        XCTAssertEqual(switchResponse.status, .ok)

        let pathfinderRefereeJoin = try await join(displayName: "Pathfinder Referee", in: tester)
        let pathfinderCampaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(pathfinderCampaignResponse.status, .ok)
        let pathfinderCampaign = try pathfinderCampaignResponse.content.decode(CampaignState.self)
        let pathfinderRefereeUpdate = CampaignUpdateInput(
            name: pathfinderCampaign.name,
            rulesetId: pathfinderCampaign.rulesetId,
            claimTimeoutMinutes: pathfinderCampaign.claimTimeoutMinutes,
            refereeSessionIds: [pathfinderRefereeJoin.session.player.id]
        )
        let pathfinderRefereeUpdateResponse = try await tester.sendRequest(
            .PATCH,
            "/campaigns/\(pathfinderCampaign.id.uuidString)",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(pathfinderRefereeUpdate))
        )
        XCTAssertEqual(pathfinderRefereeUpdateResponse.status, .ok)

        let pathfinderCharacter = CharacterInput(
            id: nil,
            campaignName: "Hell's Vengance",
            ownerName: pathfinderRefereeJoin.session.player.displayName,
            name: "Visible Scout",
            initiative: 13,
            stats: [StatEntry(key: "HP", current: 8, max: 9)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )

        let pathfinderView = try await createMemberCharacter(
            in: tester,
            cookieToken: pathfinderRefereeJoin.cookieToken,
            payload: pathfinderCharacter
        )

        let visibilityResponse = try await tester.sendRequest(
            .PATCH,
            "/characters/\(pathfinderView.id.uuidString)/visibility",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(pathfinderRefereeJoin.cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterVisibilityInput(isHidden: true, revealOnTurn: true)))
        )
        XCTAssertEqual(visibilityResponse.status, .ok)
        let hiddenPathfinder = try visibilityResponse.content.decode(PlayerView.self)
        XCTAssertTrue(hiddenPathfinder.isHidden)
        XCTAssertTrue(hiddenPathfinder.revealOnTurn)

        let pathfinderStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(pathfinderRefereeJoin.cookieToken)")])
        )
        XCTAssertEqual(pathfinderStateResponse.status, .ok)
        let pathfinderState = try pathfinderStateResponse.content.decode(GameState.self)
        let pathfinderScout = try XCTUnwrap(pathfinderState.players.first(where: { $0.name == "Visible Scout" }))
        XCTAssertTrue(pathfinderScout.isHidden)
        XCTAssertTrue(pathfinderScout.revealOnTurn)

        let switchBackResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Ancients!", rulesetId: travellerLibrary.id)
            ))
        )
        XCTAssertEqual(switchBackResponse.status, .ok)

        let ancientStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(ancientRefereeJoin.cookieToken)")])
        )
        XCTAssertEqual(ancientStateResponse.status, .ok)
        let ancientState = try ancientStateResponse.content.decode(GameState.self)
        let ancientScout = try XCTUnwrap(ancientState.players.first(where: { $0.name == "Visible Scout" }))
        XCTAssertTrue(ancientScout.isHidden)
        XCTAssertTrue(ancientScout.revealOnTurn)

        try await app.asyncShutdown()
    }

    @discardableResult
    private func activateCampaign(
        _ tester: XCTApplicationTester,
        name: String,
        rulesetId: String
    ) async throws -> CampaignState {
        let response = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: name, rulesetId: rulesetId)
            ))
        )
        XCTAssertEqual(response.status, .ok)
        return try response.content.decode(CampaignState.self)
    }

    private func join(
        displayName: String,
        in tester: XCTApplicationTester
    ) async throws -> (session: PlayerSessionResponse, cookieToken: String) {
        let joinPayload = PlayerJoinInput(displayName: displayName)
        let joinResponse = try await tester.sendRequest(
            .POST,
            "/player/join",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(joinPayload))
        )
        XCTAssertEqual(joinResponse.status, .ok)
        let session = try joinResponse.content.decode(PlayerSessionResponse.self)
        let joinCookie = try XCTUnwrap(joinResponse.headers.first(name: .setCookie))
        let joinToken = try XCTUnwrap(joinCookie.split(separator: ";").first?.split(separator: "=").last)
        return (session, String(joinToken))
    }

    private func grantRefereeAccess(
        in tester: XCTApplicationTester,
        displayName: String = "Referee"
    ) async throws -> String {
        let refereeJoin = try await join(displayName: displayName, in: tester)
        let campaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaign = try campaignResponse.content.decode(CampaignState.self)
        let updatePayload = CampaignUpdateInput(
            name: campaign.name,
            rulesetId: campaign.rulesetId,
            claimTimeoutMinutes: campaign.claimTimeoutMinutes,
            refereeSessionIds: [refereeJoin.session.player.id]
        )
        let updateResponse = try await tester.sendRequest(
            .PATCH,
            "/campaigns/\(campaign.id.uuidString)",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(updatePayload))
        )
        XCTAssertEqual(updateResponse.status, .ok)
        return refereeJoin.cookieToken
    }

    private func makeTester(
        selectDefaultCampaign: Bool = true,
        creatureLibraryConfiguration: CreatureLibraryConfiguration = CreatureLibraryConfiguration(includeLocalCreatures: false),
        appDataDirectoryOverride: URL? = nil
    ) async throws -> XCTApplicationTester {
        _ = Self.setupLogging
        Self.environmentKeeper.current = nil
        let app = try await Application.make(.testing)
        await app.userStore.resetMemoryForTesting()
        var appPaths = app.appPaths
        appPaths.appDataDirectoryOverride = appDataDirectoryOverride
        app.appPaths = appPaths
        app.creatureLibraryConfiguration = creatureLibraryConfiguration
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Route Smoke"
        if let appDataDirectoryOverride {
            options.databaseFileURL = appDataDirectoryOverride
                .appendingPathComponent("data", isDirectory: true)
                .appendingPathComponent("app.sqlite3")
        } else {
            options.databaseFileURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("roll4initiative-route-smoke-\(UUID().uuidString).sqlite3")
        }
        options.restorePersistedState = false
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false
        options.verboseOutput = false
        try await ServerBootstrap.configure(app, options: options, library: library)
        let tester = try app.testable()
        Self.environmentKeeper.current = TestEnvironment(app: app, tester: tester)

        if selectDefaultCampaign {
            let response = try await tester.sendRequest(
                .POST,
                "/campaign",
                headers: HTTPHeaders([("Content-Type", "application/json")]),
                body: ByteBuffer(data: try JSONEncoder().encode(
                    CampaignUpdateInput(name: "Route Smoke", rulesetId: library.id)
                ))
            )
            XCTAssertEqual(response.status, .ok)
        }

        return tester
    }

    private func signInOwner(in tester: XCTApplicationTester) async throws -> String {
        let uniqueEmail = "owner+\(UUID().uuidString.lowercased())@example.com"
        let payload = AuthSignupInput(
            email: uniqueEmail,
            password: "s3cr3t-password"
        )
        let response = try await tester.sendRequest(
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(response.status, .ok)
        let cookie = try XCTUnwrap(response.headers.first(name: .setCookie))
        return try XCTUnwrap(cookie.split(separator: ";").first?.split(separator: "=").last).description
    }

    private func createMemberCharacter(
        in tester: XCTApplicationTester,
        cookieToken: String,
        payload: CharacterInput
    ) async throws -> PlayerView {
        let campaignResponse = try await tester.sendRequest(
            .GET,
            "/campaign",
            headers: HTTPHeaders([("Cookie", "roll4_player_session=\(cookieToken)")])
        )
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaign = try campaignResponse.content.decode(CampaignState.self)

        let response = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaign.id.uuidString)/me/characters",
            headers: HTTPHeaders([
                ("Content-Type", "application/json"),
                ("Cookie", "roll4_player_session=\(cookieToken)")
            ]),
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(response.status, .ok)
        return try response.content.decode(PlayerView.self)
    }
}
