import Foundation
import XCTest
@testable import PlayerTracker

final class CampaignEventHubTests: XCTestCase {
    func testCampaignEventHubStreamsPublishedUpdates() async throws {
        let hub = CampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Live Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: []
        )
        let snapshot = CampaignStreamSnapshot(
            campaign: campaign,
            gameState: GameState(
                round: 3,
                encounterState: .active,
                currentTurnId: nil,
                currentTurnName: nil,
                players: []
            )
        )
        let stream = await hub.subscribe(campaignID: campaign.id)
        var iterator = stream.makeAsyncIterator()

        await hub.publish(
            campaignID: campaign.id,
            message: CampaignStreamMessage(event: "campaign-updated", snapshot: snapshot)
        )

        let message = await iterator.next()
        XCTAssertEqual(message?.event, "campaign-updated")
        XCTAssertEqual(message?.snapshot.campaign.id, campaign.id)
        XCTAssertEqual(message?.snapshot.gameState.round, 3)
    }

    func testCampaignEventHubStreamsTurnChangedUpdates() async throws {
        let hub = CampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Live Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: []
        )
        let snapshot = CampaignStreamSnapshot(
            campaign: campaign,
            gameState: GameState(
                round: 4,
                encounterState: .active,
                currentTurnId: UUID(),
                currentTurnName: "Hero",
                players: []
            )
        )
        let stream = await hub.subscribe(campaignID: campaign.id)
        var iterator = stream.makeAsyncIterator()

        await hub.publish(
            campaignID: campaign.id,
            message: CampaignStreamMessage(event: "turn-changed", snapshot: snapshot)
        )

        let message = await iterator.next()
        XCTAssertEqual(message?.event, "turn-changed")
        XCTAssertEqual(message?.snapshot.campaign.id, campaign.id)
        XCTAssertEqual(message?.snapshot.gameState.round, 4)
        XCTAssertEqual(message?.snapshot.gameState.currentTurnName, "Hero")
    }

    func testCampaignEventHubShutdownFinishesStreams() async throws {
        let hub = CampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Live Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: []
        )
        let stream = await hub.subscribe(campaignID: campaign.id)
        var iterator = stream.makeAsyncIterator()

        await hub.shutdown()

        let message = await iterator.next()
        XCTAssertNil(message)
    }
}
