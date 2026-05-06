import Vapor
import XCTVapor
import XCTest
@testable import PlayerTracker

final class ServerRoutesTests: XCTestCase {
    private var app: Application!

    override func tearDown() async throws {
        await userStore.clear()
        try await app?.asyncShutdown()
        app = nil
    }

    func testCampaignAndRulesetRoutesReturnInitialState() async throws {
        let tester = try await makeTester()

        let campaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaign = try campaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(campaign.name, "Route Smoke")
        XCTAssertEqual(campaign.rulesetId, "dnd5e")
        XCTAssertEqual(campaign.encounterState, .new)

        let rulesetsResponse = try await tester.sendRequest(.GET, "/rulesets")
        XCTAssertEqual(rulesetsResponse.status, .ok)
        let rulesets = try rulesetsResponse.content.decode([RulesetSummary].self)
        XCTAssertTrue(rulesets.contains { $0.id == "dnd5e" })
        XCTAssertTrue(rulesets.contains { $0.id == "none" })
    }

    func testCharacterStateAndEncounterFlowRoutes() async throws {
        let tester = try await makeTester()

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

        let createResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(createResponse.status, .ok)
        let character = try createResponse.content.decode(PlayerView.self)
        XCTAssertEqual(character.ownerId, ownerId)
        XCTAssertEqual(character.name, "Hero")
        XCTAssertEqual(character.initiative, 12)

        let initialStateResponse = try await tester.sendRequest(.GET, "/state")
        XCTAssertEqual(initialStateResponse.status, .ok)
        let initialState = try initialStateResponse.content.decode(GameState.self)
        XCTAssertEqual(initialState.encounterState, .new)
        XCTAssertNil(initialState.currentTurnId)
        XCTAssertEqual(initialState.players.map(\.name), ["Hero"])

        let startResponse = try await tester.sendRequest(.POST, "/encounter/start")
        XCTAssertEqual(startResponse.status, .ok)
        let startedState = try startResponse.content.decode(GameState.self)
        XCTAssertEqual(startedState.encounterState, .active)
        XCTAssertEqual(startedState.currentTurnName, "Hero")

        let turnCompleteResponse = try await tester.sendRequest(.POST, "/turn-complete")
        XCTAssertEqual(turnCompleteResponse.status, .ok)
        let nextState = try turnCompleteResponse.content.decode(GameState.self)
        XCTAssertEqual(nextState.encounterState, .active)
        XCTAssertEqual(nextState.currentTurnName, "Hero")
        XCTAssertEqual(nextState.round, 2)
    }

    func testTurnCompleteRejectsInactiveEncounter() async throws {
        let tester = try await makeTester()

        let response = try await tester.sendRequest(.POST, "/turn-complete")
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
        options.restorePersistedState = false
        options.persistChanges = false
        options.launchBrowser = false

        try await ServerBootstrap.configure(app, options: options, library: library)

        XCTAssertEqual(app.http.server.configuration.hostname, "127.0.0.1")
        XCTAssertEqual(app.http.server.configuration.port, 0)

        let tester = try app.testable()
        let response = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(response.status, .ok)
        let campaign = try response.content.decode(CampaignState.self)
        XCTAssertEqual(campaign.name, "Bootstrap Smoke")
        XCTAssertEqual(campaign.rulesetId, "dnd5e")
    }

    private func makeTester() async throws -> XCTApplicationTester {
        await userStore.clear()
        app = try await Application.make(.testing)
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        let campaignStore = CampaignStore(
            defaultLibrary: library,
            defaultName: "Route Smoke",
            restorePersistedState: false,
            persistChanges: false
        )
        try routes(app, campaignStore: campaignStore)
        return try app.testable()
    }
}
