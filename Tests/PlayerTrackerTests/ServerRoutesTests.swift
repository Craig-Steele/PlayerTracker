import Vapor
import XCTVapor
import XCTest
@testable import PlayerTracker

final class ServerRoutesTests: XCTestCase {
    private var app: Application!

    override func tearDown() async throws {
        try await app?.asyncShutdown()
        await userStore.resetMemoryForTesting()
        CreatureLibraryConfiguration.includeLocalCreatures = true
        app = nil
    }

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

    func testCreatureLibraryRouteReturnsFilteredCreaturesForActiveRuleset() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        _ = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "pathfinder")

        let pathfinderLibrary = try RuleSetLibraryLoader.loadLibrary(id: "pathfinder")
        XCTAssertEqual(pathfinderLibrary.creatureLibrary?.file, "pathfinder-bestiary.json")

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
                ownerId: UUID(),
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

    func testRefereeCharacterCreatePersistsStatBlockId() async throws {
        let tester = try await makeTester(selectDefaultCampaign: false)
        let campaign = try await activateCampaign(tester, name: "Route Smoke", rulesetId: "traveller")
        let refereeCookie = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let createPayload = CharacterInput(
            id: nil,
            campaignName: campaign.name,
            ownerId: UUID(),
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

    func testCharacterStateAndEncounterFlowRoutes() async throws {
        let tester = try await makeTester()
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let ownerId = UUID()
        let payload = CharacterInput(
            id: nil,
            campaignName: "Route Smoke",
            ownerId: ownerId,
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
    }

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

    func testServerBootstrapConfiguresRoutesWithoutLaunchingProductionServer() async throws {
        await userStore.clear()
        app = try await Application.make(.testing)

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

        try await ServerBootstrap.configure(app, options: options, library: library)

        XCTAssertEqual(app.http.server.configuration.hostname, "127.0.0.1")
        XCTAssertEqual(app.http.server.configuration.port, 0)

        let tester = try app.testable()
        let response = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(response.status, .conflict)
        XCTAssertTrue(response.body.string.contains("No campaign selected"))
    }

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

        let app1 = try await Application.make(.testing)
        try await ServerBootstrap.configure(app1, options: options, library: library)
        let tester1 = try app1.testable()
        try await activateCampaign(tester1, name: "Persist Smoke", rulesetId: library.id)
        let playerSession = try await join(displayName: "Player", in: tester1)

        let payload = CharacterInput(
            id: nil,
            campaignName: "Persist Smoke",
            ownerId: UUID(),
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
        await userStore.resetMemoryForTesting()

        let app2 = try await Application.make(.testing)
        try await ServerBootstrap.configure(app2, options: options, library: library)
        let tester2 = try app2.testable()
        try await activateCampaign(tester2, name: "Persist Smoke", rulesetId: library.id)

        let usersResponse = try await tester2.sendRequest(.GET, "/users")
        XCTAssertEqual(usersResponse.status, .ok)
        let users = try usersResponse.content.decode([UserData].self)
        XCTAssertTrue(users.contains { $0.name == "Persisted Hero" && $0.initiative == 17 })

        try await app2.asyncShutdown()
    }

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

        try await ServerBootstrap.configure(app, options: options, library: initialLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: initialLibrary.id)

        let initialRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Traveller Referee")

        let ownerId = UUID()
        let payload = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerId: ownerId,
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
            ownerId: UUID(),
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
            ownerId: UUID(),
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
        await userStore.resetMemoryForTesting()

        let app2 = try await Application.make(.testing)
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
        await userStore.resetMemoryForTesting()

        let app3 = try await Application.make(.testing)
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

        try await ServerBootstrap.configure(app, options: options, library: travellerLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: travellerLibrary.id)
        let ancientRefereeCookie = try await grantRefereeAccess(in: tester, displayName: "Ancients Referee")

        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerId: UUID(),
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
            ownerId: UUID(),
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

        try await ServerBootstrap.configure(app1, options: options, library: travellerLibrary)
        let tester1 = try app1.testable()
        try await activateCampaign(tester1, name: "Ancients!", rulesetId: travellerLibrary.id)
        let refereeCookie = try await grantRefereeAccess(in: tester1, displayName: "Referee")

        let firstCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerId: UUID(),
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
            ownerId: UUID(),
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
        await userStore.resetMemoryForTesting()

        let app2 = try await Application.make(.testing)
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

        try await ServerBootstrap.configure(app, options: options, library: travellerLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: travellerLibrary.id)

        let sharedOwnerId = UUID()
        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerId: sharedOwnerId,
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
            ownerId: sharedOwnerId,
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

        try await ServerBootstrap.configure(app, options: options, library: travellerLibrary)
        let tester = try app.testable()
        try await activateCampaign(tester, name: "Ancients!", rulesetId: travellerLibrary.id)

        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerId: UUID(),
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
            ownerId: UUID(),
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
            ownerId: ancientRefereeJoin.session.player.id,
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
            ownerId: pathfinderRefereeJoin.session.player.id,
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

    private func makeTester(selectDefaultCampaign: Bool = true) async throws -> XCTApplicationTester {
        await userStore.clear()
        CreatureLibraryConfiguration.includeLocalCreatures = false
        app = try await Application.make(.testing)
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Route Smoke"
        options.databaseFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-route-smoke-\(UUID().uuidString).sqlite3")
        options.restorePersistedState = false
        options.persistChanges = true
        options.launchBrowser = false
        try await ServerBootstrap.configure(app, options: options, library: library)
        let tester = try app.testable()

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
