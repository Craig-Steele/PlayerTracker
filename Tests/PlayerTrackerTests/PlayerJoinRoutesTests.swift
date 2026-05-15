import Vapor
import XCTVapor
import XCTest
@testable import PlayerTracker

final class PlayerJoinRoutesTests: XCTestCase {
    func testPlayerJoinSessionRoundTripsThroughCookie() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)

        let joinPayload = PlayerJoinInput(displayName: "Alex")
        let joinResponse = try await tester.sendRequest(
            .POST,
            "/player/join",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(joinPayload))
        )
        XCTAssertEqual(joinResponse.status, .ok)

        let session = try joinResponse.content.decode(PlayerSessionResponse.self)
        XCTAssertEqual(session.player.displayName, "Alex")
        XCTAssertEqual(session.player.campaignID, campaignID)
        XCTAssertEqual(session.campaign.id, campaignID)

        let joinCookie = try XCTUnwrap(joinResponse.headers.first(name: .setCookie))
        let joinToken = try XCTUnwrap(joinCookie.split(separator: ";").first?.split(separator: "=").last)

        let sessionResponse = try await tester.sendRequest(
            .GET,
            "/player/session",
            headers: ["Cookie": "roll4_player_session=\(joinToken)"]
        )
        XCTAssertEqual(sessionResponse.status, .ok)
        let restored = try sessionResponse.content.decode(PlayerSessionResponse.self)
        XCTAssertEqual(restored.player.id, session.player.id)
        XCTAssertEqual(restored.player.displayName, "Alex")
        XCTAssertEqual(restored.campaign.id, campaignID)

        let logoutResponse = try await tester.sendRequest(
            .POST,
            "/player/logout",
            headers: ["Cookie": "roll4_player_session=\(joinToken)"]
        )
        XCTAssertEqual(logoutResponse.status, .ok)

        let revokedSessionResponse = try await tester.sendRequest(
            .GET,
            "/player/session",
            headers: ["Cookie": "roll4_player_session=\(joinToken)"]
        )
        XCTAssertEqual(revokedSessionResponse.status, .unauthorized)
    }

    func testPlayerJoinReusesIdentityForSameDisplayName() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        _ = try await activateCampaign(in: tester)

        let firstJoin = try await join(displayName: "Alex", tester: tester)
        let secondJoin = try await join(displayName: "Alex", tester: tester)

        XCTAssertEqual(firstJoin.session.player.id, secondJoin.session.player.id)
        XCTAssertEqual(firstJoin.session.player.displayName, secondJoin.session.player.displayName)
    }

    func testPlayerJoinRequiresActiveCampaign() async throws {
        let app = try await makeApp(activeCampaign: false)
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let joinPayload = PlayerJoinInput(displayName: "Alex")
        let joinResponse = try await tester.sendRequest(
            .POST,
            "/player/join",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(joinPayload))
        )
        XCTAssertEqual(joinResponse.status, .conflict)
    }

    func testPlayerSessionOverridesClientOwnerIdOnCharacterWrites() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)

        let joinSession = try await join(displayName: "Alex", tester: tester)
        let forgedOwnerID = UUID()
        let payload = CharacterInput(
            id: nil,
            campaignName: nil,
            ownerId: forgedOwnerID,
            ownerName: "Alex",
            name: "Scout",
            initiative: nil,
            stats: nil,
            revealStats: nil,
            autoSkipTurn: nil,
            useAppInitiativeRoll: nil,
            initiativeBonus: nil,
            isHidden: nil,
            revealOnTurn: nil,
            conditions: nil
        )

        let cookie = "roll4_player_session=\(joinSession.cookieToken)"
        let response = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: [
                "Content-Type": "application/json",
                "Cookie": cookie
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(response.status, .ok)
        let player = try response.content.decode(PlayerView.self)
        XCTAssertEqual(player.ownerId, joinSession.session.player.id)
        XCTAssertEqual(player.ownerName, "Alex")
        XCTAssertEqual(campaignID, joinSession.session.player.campaignID)
    }

    func testRenamingPlayerKeepsTheSameIdentity() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        _ = try await activateCampaign(in: tester)

        let initialJoin = try await join(displayName: "Alex", tester: tester)
        let renameResponse = try await tester.sendRequest(
            .PATCH,
            "/player/session",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(initialJoin.cookieToken)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(PlayerJoinInput(displayName: "Ally")))
        )
        XCTAssertEqual(renameResponse.status, .ok)
        let renamed = try renameResponse.content.decode(PlayerSessionResponse.self)
        XCTAssertEqual(renamed.player.id, initialJoin.session.player.id)
        XCTAssertEqual(renamed.player.displayName, "Ally")

        let legacyJoin = try await join(displayName: "Alex", tester: tester)
        XCTAssertEqual(legacyJoin.session.player.id, initialJoin.session.player.id)
        XCTAssertEqual(legacyJoin.session.player.displayName, "Ally")
    }

    private func join(displayName: String, tester: XCTApplicationTester) async throws -> (session: PlayerSessionResponse, cookieToken: String) {
        let joinPayload = PlayerJoinInput(displayName: displayName)
        let joinResponse = try await tester.sendRequest(
            .POST,
            "/player/join",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(joinPayload))
        )
        XCTAssertEqual(joinResponse.status, .ok)
        let session = try joinResponse.content.decode(PlayerSessionResponse.self)
        let joinCookie = try XCTUnwrap(joinResponse.headers.first(name: .setCookie))
        let joinToken = try XCTUnwrap(joinCookie.split(separator: ";").first?.split(separator: "=").last)
        return (session, String(joinToken))
    }

    private func activateCampaign(in tester: XCTApplicationTester) async throws -> UUID {
        let createPayload = CampaignUpdateInput(name: "Player Smoke", rulesetId: "dnd5e")
        let createResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(createPayload))
        )
        XCTAssertEqual(createResponse.status, .ok)
        let created = try createResponse.content.decode(CampaignSummary.self)

        let selectResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(created.id.uuidString)/select"
        )
        XCTAssertEqual(selectResponse.status, .ok)
        let selected = try selectResponse.content.decode(CampaignState.self)
        return selected.id
    }

    private func makeApp(activeCampaign: Bool = true) async throws -> Application {
        let app = try await Application.make(.testing)
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Player Smoke"
        options.databaseFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-player-\(UUID().uuidString).sqlite3")
        options.restorePersistedState = false
        options.persistChanges = true
        options.launchBrowser = false
        try await ServerBootstrap.configure(app, options: options, library: library)
        if !activeCampaign {
            return app
        }
        return app
    }
}
