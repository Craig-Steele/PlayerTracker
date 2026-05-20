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
            "/campaigns/\(campaignID.uuidString)/me/characters",
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
        let campaignID = try await activateCampaign(in: tester)

        let initialJoin = try await join(displayName: "Alex", tester: tester)
        let createResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(initialJoin.cookieToken)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterInput(
                id: nil,
                campaignName: nil,
                ownerId: UUID(),
                ownerName: "Alex",
                name: "Scout",
                initiative: 1,
                stats: nil,
                revealStats: nil,
                autoSkipTurn: nil,
                useAppInitiativeRoll: nil,
                initiativeBonus: nil,
                isHidden: nil,
                revealOnTurn: nil,
                conditions: nil
            )))
        )
        XCTAssertEqual(createResponse.status, .ok)

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

        let charactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: [
                "Cookie": "roll4_player_session=\(initialJoin.cookieToken)"
            ]
        )
        XCTAssertEqual(charactersResponse.status, .ok)
        let characters = try charactersResponse.content.decode([PlayerView].self)
        XCTAssertTrue(characters.contains { $0.ownerName == "Ally" && $0.name == "Scout" })

        let legacyJoin = try await join(displayName: "Alex", tester: tester)
        XCTAssertEqual(legacyJoin.session.player.id, initialJoin.session.player.id)
        XCTAssertEqual(legacyJoin.session.player.displayName, "Ally")
    }

    func testMeRouteAndCampaignScopedCharacterRoutesUsePlayerSessionIdentity() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)

        let joinSession = try await join(displayName: "Alex", tester: tester)
        let meResponse = try await tester.sendRequest(
            .GET,
            "/me",
            headers: ["Cookie": "roll4_player_session=\(joinSession.cookieToken)"]
        )
        XCTAssertEqual(meResponse.status, .ok)
        let me = try meResponse.content.decode(PlayerIdentityResponse.self)
        XCTAssertEqual(me.id, joinSession.session.player.id)
        XCTAssertEqual(me.campaignID, campaignID)
        XCTAssertEqual(me.displayName, "Alex")

        let renameResponse = try await tester.sendRequest(
            .PATCH,
            "/me",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(joinSession.cookieToken)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(PlayerJoinInput(displayName: "Ally")))
        )
        XCTAssertEqual(renameResponse.status, .ok)
        let renamed = try renameResponse.content.decode(PlayerIdentityResponse.self)
        XCTAssertEqual(renamed.id, joinSession.session.player.id)
        XCTAssertEqual(renamed.displayName, "Ally")

        let listResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: ["Cookie": "roll4_player_session=\(joinSession.cookieToken)"]
        )
        XCTAssertEqual(listResponse.status, .ok)
        let initialCharacters = try listResponse.content.decode([PlayerView].self)
        XCTAssertTrue(initialCharacters.isEmpty)

        let forgedOwnerID = UUID()
        let createPayload = CharacterInput(
            id: nil,
            campaignName: nil,
            ownerId: forgedOwnerID,
            ownerName: "Not Alex",
            name: "Scout",
            initiative: 5,
            stats: [StatEntry(key: "HP", current: 6, max: 8)],
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
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(joinSession.cookieToken)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(createPayload))
        )
        XCTAssertEqual(createResponse.status, .ok)
        let created = try createResponse.content.decode(PlayerView.self)
        XCTAssertEqual(created.ownerId, joinSession.session.player.id)
        XCTAssertEqual(created.ownerName, "Ally")

        let updatePayload = CharacterInput(
            id: created.id,
            campaignName: nil,
            ownerId: forgedOwnerID,
            ownerName: "Still Not Alex",
            name: "Scout II",
            initiative: 7,
            stats: [StatEntry(key: "HP", current: 7, max: 8)],
            revealStats: true,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 1,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )
        let updateResponse = try await tester.sendRequest(
            .PATCH,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(created.id.uuidString)",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(joinSession.cookieToken)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(updatePayload))
        )
        XCTAssertEqual(updateResponse.status, .ok)
        let updated = try updateResponse.content.decode(PlayerView.self)
        XCTAssertEqual(updated.ownerId, joinSession.session.player.id)
        XCTAssertEqual(updated.ownerName, "Ally")
        XCTAssertEqual(updated.name, "Scout II")

        let deleteResponse = try await tester.sendRequest(
            .DELETE,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(created.id.uuidString)",
            headers: ["Cookie": "roll4_player_session=\(joinSession.cookieToken)"]
        )
        XCTAssertEqual(deleteResponse.status, .ok)

        let finalListResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: ["Cookie": "roll4_player_session=\(joinSession.cookieToken)"]
        )
        XCTAssertEqual(finalListResponse.status, .ok)
        let finalCharacters = try finalListResponse.content.decode([PlayerView].self)
        XCTAssertTrue(finalCharacters.isEmpty)
    }

    func testCampaignInvitesAndMeCampaignListRoundTrip() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let firstCampaignID = try await activateCampaign(in: tester)
        let secondCampaignResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignUpdateInput(
                name: "Invite Target",
                rulesetId: "pathfinder"
            )))
        )
        XCTAssertEqual(secondCampaignResponse.status, .ok)
        let secondCampaign = try secondCampaignResponse.content.decode(CampaignSummary.self)
        XCTAssertEqual(secondCampaign.name, "Invite Target")

        let adminCookie = try await signInOwner(in: tester)
        let inviteResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(secondCampaign.id.uuidString)/invites",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(inviteResponse.status, .ok)
        let invite = try inviteResponse.content.decode(CampaignInviteResponse.self)
        XCTAssertEqual(invite.campaign.id, secondCampaign.id)
        XCTAssertNil(invite.playerName)

        let playerSession = try await join(displayName: "Alex", tester: tester)
        let acceptResponse = try await tester.sendRequest(
            .POST,
            "/invites/\(invite.token)/accept",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(acceptResponse.status, .ok)
        let acceptedCampaign = try acceptResponse.content.decode(CampaignSummary.self)
        XCTAssertEqual(acceptedCampaign.id, secondCampaign.id)

        let campaignsResponse = try await tester.sendRequest(
            .GET,
            "/me/campaigns",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(campaignsResponse.status, .ok)
        let campaigns = try campaignsResponse.content.decode([CampaignSummary].self)
        XCTAssertEqual(campaigns.count, 2)
        XCTAssertTrue(campaigns.contains { $0.id == firstCampaignID && $0.isActive })
        XCTAssertTrue(campaigns.contains { $0.id == secondCampaign.id && !$0.isActive })
    }

    func testNamedInviteCanTargetAPlayerAndRejectMismatchedPlayer() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let campaignResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignUpdateInput(
                name: "Targeted Invite",
                rulesetId: "pathfinder"
            )))
        )
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaign = try campaignResponse.content.decode(CampaignSummary.self)

        let adminCookie = try await signInOwner(in: tester)
        let activateResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(activateResponse.status, .ok)

        let inviteResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaign.id.uuidString)/invites",
            headers: [
                "Cookie": "roll4_session=\(adminCookie)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignInviteCreateInput(playerName: "Alex")))
        )
        XCTAssertEqual(inviteResponse.status, .ok)
        let invite = try inviteResponse.content.decode(CampaignInviteResponse.self)
        XCTAssertEqual(invite.playerName, "Alex")

        let wrongPlayer = try await join(displayName: "Taylor", tester: tester)
        let wrongAcceptResponse = try await tester.sendRequest(
            .POST,
            "/invites/\(invite.token)/accept",
            headers: ["Cookie": "roll4_player_session=\(wrongPlayer.cookieToken)"]
        )
        XCTAssertEqual(wrongAcceptResponse.status, .notFound)

        let correctPlayer = try await join(displayName: "Alex", tester: tester)
        let correctAcceptResponse = try await tester.sendRequest(
            .POST,
            "/invites/\(invite.token)/accept",
            headers: ["Cookie": "roll4_player_session=\(correctPlayer.cookieToken)"]
        )
        XCTAssertEqual(correctAcceptResponse.status, .ok)
        let acceptedCampaign = try correctAcceptResponse.content.decode(CampaignSummary.self)
        XCTAssertEqual(acceptedCampaign.id, campaign.id)
    }

    func testRefereeCanAddPlayerToCampaignByName() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let campaignID = try await activateCampaign(in: tester)
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let inviteResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/members",
            headers: [
                "Cookie": "roll4_player_session=\(refereeSession)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignMemberCreateInput(playerName: "Morgan")))
        )
        XCTAssertEqual(inviteResponse.status, .ok)
        let member = try inviteResponse.content.decode(CampaignMemberSummary.self)
        XCTAssertEqual(member.displayName, "Morgan")
        XCTAssertFalse(member.isReferee)
    }

    func testAdminCanAddPlayerToCampaignByNameAndPlayerSessionCannot() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let campaignID = try await activateCampaign(in: tester)
        let adminCookie = try await signInOwner(in: tester)
        let adminResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/members",
            headers: [
                "Cookie": "roll4_session=\(adminCookie)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignMemberCreateInput(playerName: "Morgan")))
        )
        XCTAssertEqual(adminResponse.status, .ok)
        let adminMember = try adminResponse.content.decode(CampaignMemberSummary.self)
        XCTAssertEqual(adminMember.displayName, "Morgan")
        XCTAssertFalse(adminMember.isReferee)

        let playerSession = try await join(displayName: "Alex", tester: tester)
        let playerResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/members",
            headers: [
                "Cookie": "roll4_player_session=\(playerSession.cookieToken)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignMemberCreateInput(playerName: "Taylor")))
        )
        XCTAssertEqual(playerResponse.status, .forbidden)
    }

    func testLegacyCharacterCreateRouteIsUnavailable() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        _ = try await activateCampaign(in: tester)
        let playerSession = try await join(displayName: "Alex", tester: tester)

        let legacyCreateResponse = try await tester.sendRequest(
            .POST,
            "/characters",
            headers: [
                "Cookie": "roll4_player_session=\(playerSession.cookieToken)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterInput(
                id: nil,
                campaignName: nil,
                ownerId: UUID(),
                ownerName: "Alex",
                name: "Legacy Scout",
                initiative: nil,
                stats: nil,
                revealStats: false,
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

    func testInviteOnlyCampaignRejectsPlainJoinAndAcceptsNamedMembership() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let campaignResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignUpdateInput(
                name: "Invite Only",
                rulesetId: "dnd5e",
                isInviteOnly: true
            )))
        )
        XCTAssertEqual(campaignResponse.status, .ok)
        let inviteOnlyCampaign = try campaignResponse.content.decode(CampaignSummary.self)

        let adminCookie = try await signInOwner(in: tester)
        let activateResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(inviteOnlyCampaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(activateResponse.status, .ok)

        let plainJoinResponse = try await tester.sendRequest(
            .POST,
            "/player/join",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(PlayerJoinInput(displayName: "Alex")))
        )
        XCTAssertEqual(plainJoinResponse.status, .forbidden)

        let memberResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(inviteOnlyCampaign.id.uuidString)/members",
            headers: [
                "Cookie": "roll4_session=\(adminCookie)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CampaignMemberCreateInput(playerName: "Alex")))
        )
        XCTAssertEqual(memberResponse.status, .ok)
        let member = try memberResponse.content.decode(CampaignMemberSummary.self)
        XCTAssertEqual(member.displayName, "Alex")
        XCTAssertFalse(member.isReferee)

        let memberJoinResponse = try await tester.sendRequest(
            .POST,
            "/player/join",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(PlayerJoinInput(displayName: "Alex")))
        )
        XCTAssertEqual(memberJoinResponse.status, .ok)
        let joined = try memberJoinResponse.content.decode(PlayerSessionResponse.self)
        XCTAssertEqual(joined.campaign.id, inviteOnlyCampaign.id)
        XCTAssertEqual(joined.player.displayName, "Alex")
        let joinCookie = try XCTUnwrap(memberJoinResponse.headers.first(name: .setCookie))
        let joinToken = try XCTUnwrap(joinCookie.split(separator: ";").first?.split(separator: "=").last)

        let campaignsResponse = try await tester.sendRequest(
            .GET,
            "/me/campaigns",
            headers: ["Cookie": "roll4_player_session=\(joinToken)"]
        )
        XCTAssertEqual(campaignsResponse.status, .ok)
        let campaigns = try campaignsResponse.content.decode([CampaignSummary].self)
        XCTAssertTrue(campaigns.contains { $0.id == inviteOnlyCampaign.id })
    }

    func testCharacterClaimAndReleaseRoutesWorkForCurrentSession() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let refereeCharacter = try await createUnclaimedRefereeCharacter(in: tester)
        let alexSession = try await join(displayName: "Alex", tester: tester)

        let claimResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(refereeCharacter.id.uuidString)/claim",
            headers: ["Cookie": "roll4_player_session=\(alexSession.cookieToken)"]
        )
        XCTAssertEqual(claimResponse.status, .ok)
        let claimed = try claimResponse.content.decode(PlayerView.self)
        XCTAssertEqual(claimed.ownerName, "Referee")
        XCTAssertEqual(claimed.lastPlayedByName, "Alex")
        XCTAssertEqual(claimed.claimedSessionId, alexSession.session.player.id)
        XCTAssertEqual(claimed.claimedDisplayName, "Alex")

        let allCharactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaignID.uuidString)/characters",
            headers: ["Cookie": "roll4_player_session=\(alexSession.cookieToken)"]
        )
        XCTAssertEqual(allCharactersResponse.status, .ok)
        let allCharacters = try allCharactersResponse.content.decode([PlayerView].self)
        XCTAssertTrue(allCharacters.contains {
            $0.id == refereeCharacter.id &&
            $0.ownerName == "Referee" &&
            $0.lastPlayedByName == "Alex" &&
            $0.claimedSessionId == alexSession.session.player.id
        })

        let releaseResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(refereeCharacter.id.uuidString)/release",
            headers: ["Cookie": "roll4_player_session=\(alexSession.cookieToken)"]
        )
        XCTAssertEqual(releaseResponse.status, .ok)
        let released = try releaseResponse.content.decode(PlayerView.self)
        XCTAssertEqual(released.ownerName, "Referee")
        XCTAssertEqual(released.lastPlayedByName, "Alex")
        XCTAssertNil(released.claimedSessionId)

        let bobSession = try await join(displayName: "Bob", tester: tester)
        let bobClaimResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(refereeCharacter.id.uuidString)/claim",
            headers: ["Cookie": "roll4_player_session=\(bobSession.cookieToken)"]
        )
        XCTAssertEqual(bobClaimResponse.status, .ok)
        let bobClaimed = try bobClaimResponse.content.decode(PlayerView.self)
        XCTAssertEqual(bobClaimed.ownerName, "Referee")
        XCTAssertEqual(bobClaimed.lastPlayedByName, "Bob")
        XCTAssertEqual(bobClaimed.claimedSessionId, bobSession.session.player.id)
    }

    func testClaimedCharacterRejectsSecondSession() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let refereeCharacter = try await createUnclaimedRefereeCharacter(in: tester)
        let alexSession = try await join(displayName: "Alex", tester: tester)
        let bobSession = try await join(displayName: "Bob", tester: tester)

        let firstClaimResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(refereeCharacter.id.uuidString)/claim",
            headers: ["Cookie": "roll4_player_session=\(alexSession.cookieToken)"]
        )
        XCTAssertEqual(firstClaimResponse.status, .ok)

        let secondClaimResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(refereeCharacter.id.uuidString)/claim",
            headers: ["Cookie": "roll4_player_session=\(bobSession.cookieToken)"]
        )
        XCTAssertEqual(secondClaimResponse.status, .conflict)
    }

    func testRefereeCanForceReleaseClaimedCharacterWithoutPlayerLogin() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let refereeCharacter = try await createUnclaimedRefereeCharacter(in: tester)
        let playerSession = try await join(displayName: "Alex", tester: tester)
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let claimResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(refereeCharacter.id.uuidString)/claim",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(claimResponse.status, .ok)

        let releaseResponse = try await tester.sendRequest(
            .POST,
            "/referee/campaigns/\(campaignID.uuidString)/characters/\(refereeCharacter.id.uuidString)/release",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(releaseResponse.status, .ok)
        let released = try releaseResponse.content.decode(PlayerView.self)
        XCTAssertNil(released.claimedSessionId)
        XCTAssertEqual(released.ownerName, "Referee")
        XCTAssertEqual(released.lastPlayedByName, "Alex")
    }

    func testRefereeCanClaimAndReleaseCharacterFromRefereeRoute() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let playerSession = try await join(displayName: "Alex", tester: tester)
        let createResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(playerSession.cookieToken)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterInput(
                id: nil,
                campaignName: nil,
                ownerId: playerSession.session.player.id,
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
            )))
        )
        XCTAssertEqual(createResponse.status, .ok)
        let created = try createResponse.content.decode(PlayerView.self)

        let releaseAsPlayerResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters/\(created.id.uuidString)/release",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(releaseAsPlayerResponse.status, .ok)

        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let claimResponse = try await tester.sendRequest(
            .POST,
            "/referee/campaigns/\(campaignID.uuidString)/characters/\(created.id.uuidString)/claim",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(claimResponse.status, .ok)
        let claimed = try claimResponse.content.decode(PlayerView.self)
        XCTAssertEqual(claimed.ownerName, "Alex")
        XCTAssertEqual(claimed.lastPlayedByName, "Referee")
        XCTAssertNotNil(claimed.claimedSessionId)

        let releaseResponse = try await tester.sendRequest(
            .POST,
            "/referee/campaigns/\(campaignID.uuidString)/characters/\(created.id.uuidString)/release",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(releaseResponse.status, .ok)
        let released = try releaseResponse.content.decode(PlayerView.self)
        XCTAssertNil(released.claimedSessionId)
        XCTAssertEqual(released.ownerName, "Alex")
        XCTAssertEqual(released.lastPlayedByName, "Referee")
    }

    func testPlayerCannotUseRefereeOnlyRoutes() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let playerSession = try await join(displayName: "Alex", tester: tester)
        let refereeCharacter = try await createUnclaimedRefereeCharacter(in: tester)

        let stateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(stateResponse.status, .forbidden)

        let refereeReleaseResponse = try await tester.sendRequest(
            .POST,
            "/referee/campaigns/\(campaignID.uuidString)/characters/\(refereeCharacter.id.uuidString)/release",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(refereeReleaseResponse.status, .forbidden)

        let refereeClaimResponse = try await tester.sendRequest(
            .POST,
            "/referee/campaigns/\(campaignID.uuidString)/characters/\(refereeCharacter.id.uuidString)/claim",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(refereeClaimResponse.status, .forbidden)
    }

    func testAdminSessionAloneCannotUseRefereeOnlyRoutes() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let refereeCharacter = try await createUnclaimedRefereeCharacter(in: tester)
        let adminCookie = try await signInOwner(in: tester)

        let stateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(stateResponse.status, .unauthorized)

        let refereeReleaseResponse = try await tester.sendRequest(
            .POST,
            "/referee/campaigns/\(campaignID.uuidString)/characters/\(refereeCharacter.id.uuidString)/release",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(refereeReleaseResponse.status, .unauthorized)
    }

    func testRevokingRefereeAccessRemovesRefereeRouteAccess() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let refereeCharacter = try await createUnclaimedRefereeCharacter(in: tester)
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")

        let allowedStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(allowedStateResponse.status, .ok)

        let revokePayload = CampaignUpdateInput(
            name: "Player Smoke",
            rulesetId: "dnd5e",
            claimTimeoutMinutes: 60,
            refereeSessionIds: []
        )
        let revokeResponse = try await tester.sendRequest(
            .PATCH,
            "/campaigns/\(campaignID.uuidString)",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(revokePayload))
        )
        XCTAssertEqual(revokeResponse.status, .ok)

        let deniedStateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(deniedStateResponse.status, .forbidden)

        let deniedReleaseResponse = try await tester.sendRequest(
            .POST,
            "/referee/campaigns/\(campaignID.uuidString)/characters/\(refereeCharacter.id.uuidString)/release",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(deniedReleaseResponse.status, .forbidden)
    }

    func testCampaignMembersRouteRequiresAdminSessionAndRejectsPlayerSession() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let playerSession = try await join(displayName: "Alex", tester: tester)
        let adminCookie = try await signInOwner(in: tester)

        let adminResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaignID.uuidString)/members",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(adminResponse.status, .ok)
        _ = try adminResponse.content.decode([CampaignMemberSummary].self)

        let playerResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(campaignID.uuidString)/members",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(playerResponse.status, .unauthorized)
    }

    func testAdminSessionCannotUsePlayerRoutes() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let campaignID = try await activateCampaign(in: tester)
        let adminCookie = try await signInOwner(in: tester)

        let meResponse = try await tester.sendRequest(
            .GET,
            "/me",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(meResponse.status, .unauthorized)

        let playerSessionResponse = try await tester.sendRequest(
            .GET,
            "/player/session",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(playerSessionResponse.status, .unauthorized)

        let createCharacterResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_session=\(adminCookie)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(CharacterInput(
                id: nil,
                campaignName: nil,
                ownerId: UUID(),
                ownerName: "Admin",
                name: "Admin Character",
                initiative: nil,
                stats: nil,
                revealStats: false,
                autoSkipTurn: false,
                useAppInitiativeRoll: true,
                initiativeBonus: 0,
                isHidden: false,
                revealOnTurn: false,
                conditions: []
            )))
        )
        XCTAssertEqual(createCharacterResponse.status, .unauthorized)
    }

    func testPlayerWithoutCampaignMembershipIsForbiddenAfterActiveCampaignSwitch() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let firstCampaignID = try await activateCampaign(in: tester)
        let playerSession = try await join(displayName: "Alex", tester: tester)
        let adminCookie = try await signInOwner(in: tester)

        let secondCampaignPayload = CampaignUpdateInput(name: "Player Smoke 2", rulesetId: "dnd5e")
        let secondCampaignResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: [
                "Cookie": "roll4_session=\(adminCookie)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(secondCampaignPayload))
        )
        XCTAssertEqual(secondCampaignResponse.status, .ok)
        let secondCampaign = try secondCampaignResponse.content.decode(CampaignSummary.self)
        XCTAssertNotEqual(firstCampaignID, secondCampaign.id)

        let selectResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(secondCampaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectResponse.status, .ok)

        let stateResponse = try await tester.sendRequest(
            .GET,
            "/state",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(stateResponse.status, .forbidden)

        let meCharactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(secondCampaign.id.uuidString)/me/characters",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(meCharactersResponse.status, .forbidden)

        let claimableCharactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(secondCampaign.id.uuidString)/characters",
            headers: ["Cookie": "roll4_player_session=\(playerSession.cookieToken)"]
        )
        XCTAssertEqual(claimableCharactersResponse.status, .forbidden)
    }

    func testRefereeWithoutCampaignMembershipIsForbiddenAfterActiveCampaignSwitch() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()
        let firstCampaignID = try await activateCampaign(in: tester)
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let adminCookie = try await signInOwner(in: tester)

        let secondCampaignPayload = CampaignUpdateInput(name: "Referee Smoke 2", rulesetId: "dnd5e")
        let secondCampaignResponse = try await tester.sendRequest(
            .POST,
            "/campaigns",
            headers: [
                "Cookie": "roll4_session=\(adminCookie)",
                "Content-Type": "application/json"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(secondCampaignPayload))
        )
        XCTAssertEqual(secondCampaignResponse.status, .ok)
        let secondCampaign = try secondCampaignResponse.content.decode(CampaignSummary.self)
        XCTAssertNotEqual(firstCampaignID, secondCampaign.id)

        let selectResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(secondCampaign.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectResponse.status, .ok)

        let stateResponse = try await tester.sendRequest(
            .GET,
            "/state?view=referee",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(stateResponse.status, .forbidden)

        let meCharactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(secondCampaign.id.uuidString)/me/characters",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(meCharactersResponse.status, .forbidden)

        let claimableCharactersResponse = try await tester.sendRequest(
            .GET,
            "/campaigns/\(secondCampaign.id.uuidString)/characters",
            headers: ["Cookie": "roll4_player_session=\(refereeSession)"]
        )
        XCTAssertEqual(claimableCharactersResponse.status, .forbidden)
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

    private func createUnclaimedRefereeCharacter(in tester: XCTApplicationTester) async throws -> PlayerView {
        let refereeSession = try await grantRefereeAccess(in: tester, displayName: "Referee")
        let campaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaignID = try campaignResponse.content.decode(CampaignState.self).id
        let payload = CharacterInput(
            id: nil,
            campaignName: nil,
            ownerId: UUID(),
            ownerName: "Referee",
            name: "Unclaimed Scout",
            initiative: nil,
            stats: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )
        let response = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(refereeSession)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(response.status, .ok)
        return try response.content.decode(PlayerView.self)
    }

    private func createUnclaimedPlayerCharacter(in tester: XCTApplicationTester) async throws -> PlayerView {
        let playerSession = try await join(displayName: "Alex", tester: tester)
        let campaignResponse = try await tester.sendRequest(.GET, "/campaign")
        XCTAssertEqual(campaignResponse.status, .ok)
        let campaignID = try campaignResponse.content.decode(CampaignState.self).id
        let payload = CharacterInput(
            id: nil,
            campaignName: nil,
            ownerId: UUID(),
            ownerName: "Alex",
            name: "Unclaimed Scout",
            initiative: nil,
            stats: nil,
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            isHidden: false,
            revealOnTurn: false,
            conditions: []
        )
        let response = try await tester.sendRequest(
            .POST,
            "/campaigns/\(campaignID.uuidString)/me/characters",
            headers: [
                "Content-Type": "application/json",
                "Cookie": "roll4_player_session=\(playerSession.cookieToken)"
            ],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(response.status, .ok)
        return try response.content.decode(PlayerView.self)
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

        let adminCookie = try await signInOwner(in: tester)
        let selectResponse = try await tester.sendRequest(
            .POST,
            "/campaigns/\(created.id.uuidString)/select",
            headers: ["Cookie": "roll4_session=\(adminCookie)"]
        )
        XCTAssertEqual(selectResponse.status, .ok)
        let selected = try selectResponse.content.decode(CampaignState.self)
        return selected.id
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

    private func grantRefereeAccess(
        in tester: XCTApplicationTester,
        displayName: String = "Referee"
    ) async throws -> String {
        let refereeJoin = try await join(displayName: displayName, tester: tester)
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
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(updatePayload))
        )
        XCTAssertEqual(updateResponse.status, .ok)
        return refereeJoin.cookieToken
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
