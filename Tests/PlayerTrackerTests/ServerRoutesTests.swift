import Vapor
import XCTVapor
import XCTest
@testable import PlayerTracker

final class ServerRoutesTests: XCTestCase {
    private var app: Application!

    override func tearDown() async throws {
        try await app?.asyncShutdown()
        await userStore.resetMemoryForTesting()
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
        XCTAssertEqual(response.status, .ok)
        let campaign = try response.content.decode(CampaignState.self)
        XCTAssertEqual(campaign.name, "Bootstrap Smoke")
        XCTAssertEqual(campaign.rulesetId, "dnd5e")
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

        let createResponse = try await tester1.sendRequest(
            .POST,
            "/characters",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(createResponse.status, .ok)
        _ = try createResponse.content.decode(PlayerView.self)

        try await app1.asyncShutdown()
        await userStore.resetMemoryForTesting()

        let app2 = try await Application.make(.testing)
        try await ServerBootstrap.configure(app2, options: options, library: library)
        let tester2 = try app2.testable()

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
        XCTAssertEqual(response.status, .ok)
        let campaign = try response.content.decode(CampaignState.self)
        XCTAssertEqual(campaign.name, "Packaged Smoke")
        XCTAssertEqual(campaign.rulesetId, "dnd5e")
        XCTAssertEqual(campaign.encounterState, .new)

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

        let createResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(createResponse.status, .ok)

        let beforeSwitchResponse = try await tester.sendRequest(.GET, "/state?view=referee")
        XCTAssertEqual(beforeSwitchResponse.status, .ok)
        let beforeSwitchState = try beforeSwitchResponse.content.decode(GameState.self)
        XCTAssertEqual(beforeSwitchState.players.map(\.name), ["Traveller Scout"])

        let startResponse = try await tester.sendRequest(.POST, "/encounter/start")
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

        let afterSwitchResponse = try await tester.sendRequest(.GET, "/state?view=referee")
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

        let restoredStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
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

        let travellerCreateResponse = try await tester1.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(travellerCharacter))
        )
        XCTAssertEqual(travellerCreateResponse.status, .ok)

        let travellerStartResponse = try await tester1.sendRequest(.POST, "/encounter/start")
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

        let pathfinderCreateResponse = try await tester1.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(pathfinderCharacter))
        )
        XCTAssertEqual(pathfinderCreateResponse.status, .ok)

        let pathfinderStartResponse = try await tester1.sendRequest(.POST, "/encounter/start")
        XCTAssertEqual(pathfinderStartResponse.status, .ok)
        let pathfinderStartedState = try pathfinderStartResponse.content.decode(GameState.self)
        XCTAssertEqual(pathfinderStartedState.encounterState, .active)
        XCTAssertEqual(pathfinderStartedState.currentTurnName, "Pathfinder Scout")

        try await app1.asyncShutdown()
        await userStore.resetMemoryForTesting()

        let app2 = try await Application.make(.testing)
        try await ServerBootstrap.configure(app2, options: makeOptions(campaignName: "Ancients!"), library: travellerLibrary)
        let tester2 = try app2.testable()

        let restoredTravellerCampaignResponse = try await tester2.sendRequest(.GET, "/campaign")
        XCTAssertEqual(restoredTravellerCampaignResponse.status, .ok)
        let restoredTravellerCampaign = try restoredTravellerCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(restoredTravellerCampaign.name, "Ancients!")
        XCTAssertEqual(restoredTravellerCampaign.rulesetId, travellerLibrary.id)
        XCTAssertEqual(restoredTravellerCampaign.encounterState, .active)

        let restoredTravellerStateResponse = try await tester2.sendRequest(.GET, "/state?view=referee")
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

        let restoredPathfinderCampaignResponse = try await tester3.sendRequest(.GET, "/campaign")
        XCTAssertEqual(restoredPathfinderCampaignResponse.status, .ok)
        let restoredPathfinderCampaign = try restoredPathfinderCampaignResponse.content.decode(CampaignState.self)
        XCTAssertEqual(restoredPathfinderCampaign.name, "Hell's Vengance")
        XCTAssertEqual(restoredPathfinderCampaign.rulesetId, pathfinderLibrary.id)
        XCTAssertEqual(restoredPathfinderCampaign.encounterState, .active)

        let restoredPathfinderStateResponse = try await tester3.sendRequest(.GET, "/state?view=referee")
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

        let ancientCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(ancientCharacter))
        )
        XCTAssertEqual(ancientCreateResponse.status, .ok)
        let ancientView = try ancientCreateResponse.content.decode(PlayerView.self)

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

        let pathfinderCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(pathfinderCharacter))
        )
        XCTAssertEqual(pathfinderCreateResponse.status, .ok)

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

        let restoredStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
        XCTAssertEqual(restoredStateResponse.status, .ok)
        let restoredState = try restoredStateResponse.content.decode(GameState.self)
        XCTAssertEqual(restoredState.players.map(\.name), ["Pathfinder Scout"])

        try await app.asyncShutdown()
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

        let ancientCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(ancientCharacter))
        )
        XCTAssertEqual(ancientCreateResponse.status, .ok)

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

        let pathfinderCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(pathfinderCharacter))
        )
        XCTAssertEqual(pathfinderCreateResponse.status, .ok)

        let renameResponse = try await tester.sendRequest(
            .POST,
            "/players/\(sharedOwnerId.uuidString)/rename",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterRenameInput(name: "Referee Prime")))
        )
        XCTAssertEqual(renameResponse.status, .ok)

        let pathfinderStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
        XCTAssertEqual(pathfinderStateResponse.status, .ok)
        let pathfinderState = try pathfinderStateResponse.content.decode(GameState.self)
        XCTAssertTrue(pathfinderState.players.contains { $0.ownerName == "Referee Prime" && $0.name == "Pathfinder Scout" })

        let switchBackResponse = try await tester.sendRequest(
            .POST,
            "/campaign",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                CampaignUpdateInput(name: "Ancients!", rulesetId: travellerLibrary.id)
            ))
        )
        XCTAssertEqual(switchBackResponse.status, .ok)

        let restoredStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
        XCTAssertEqual(restoredStateResponse.status, .ok)
        let restoredState = try restoredStateResponse.content.decode(GameState.self)
        XCTAssertTrue(restoredState.players.contains { $0.ownerName == "Shared Owner" && $0.name == "Ancient Scout" })
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

        let ancientCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(ancientCharacter))
        )
        XCTAssertEqual(ancientCreateResponse.status, .ok)

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

        let pathfinderCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(pathfinderCharacter))
        )
        XCTAssertEqual(pathfinderCreateResponse.status, .ok)

        let setConditionsResponse = try await tester.sendRequest(
            .POST,
            "/conditions",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(
                ConditionsInput(name: "Shared Scout", conditions: ["Flat-Footed", "Shaken"])
            ))
        )
        XCTAssertEqual(setConditionsResponse.status, .ok)

        let pathfinderStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
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

        let ancientStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
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

        let ancientCharacter = CharacterInput(
            id: nil,
            campaignName: "Ancients!",
            ownerId: UUID(),
            ownerName: "Referee",
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

        let ancientCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(ancientCharacter))
        )
        XCTAssertEqual(ancientCreateResponse.status, .ok)
        let ancientView = try ancientCreateResponse.content.decode(PlayerView.self)
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

        let pathfinderCharacter = CharacterInput(
            id: nil,
            campaignName: "Hell's Vengance",
            ownerId: UUID(),
            ownerName: "Referee",
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

        let pathfinderCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(pathfinderCharacter))
        )
        XCTAssertEqual(pathfinderCreateResponse.status, .ok)
        let pathfinderView = try pathfinderCreateResponse.content.decode(PlayerView.self)

        let visibilityResponse = try await tester.sendRequest(
            .PATCH,
            "/characters/\(pathfinderView.id.uuidString)/visibility",
            headers: HTTPHeaders([("Content-Type", "application/json")]),
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterVisibilityInput(isHidden: true, revealOnTurn: true)))
        )
        XCTAssertEqual(visibilityResponse.status, .ok)
        let hiddenPathfinder = try visibilityResponse.content.decode(PlayerView.self)
        XCTAssertTrue(hiddenPathfinder.isHidden)
        XCTAssertTrue(hiddenPathfinder.revealOnTurn)

        let pathfinderStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
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

        let ancientStateResponse = try await tester.sendRequest(.GET, "/state?view=referee")
        XCTAssertEqual(ancientStateResponse.status, .ok)
        let ancientState = try ancientStateResponse.content.decode(GameState.self)
        let ancientScout = try XCTUnwrap(ancientState.players.first(where: { $0.name == "Visible Scout" }))
        XCTAssertTrue(ancientScout.isHidden)
        XCTAssertTrue(ancientScout.revealOnTurn)

        try await app.asyncShutdown()
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
