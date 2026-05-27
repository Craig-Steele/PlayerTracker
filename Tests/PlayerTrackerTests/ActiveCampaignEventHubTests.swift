import Foundation
import XCTest
@testable import PlayerTracker

final class ActiveCampaignEventHubTests: XCTestCase {
    func testActiveCampaignEventHubStreamsPublishedUpdates() async throws {
        let hub = ActiveCampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Join Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: []
        )
        let stream = await hub.subscribe()
        var iterator = stream.makeAsyncIterator()

        await hub.publish(
            message: ActiveCampaignStreamMessage(
                event: "campaign-updated",
                snapshot: ActiveCampaignStreamSnapshot(campaign: campaign)
            )
        )

        let message = await iterator.next()
        XCTAssertEqual(message?.event, "campaign-updated")
        XCTAssertEqual(message?.snapshot.campaign?.id, campaign.id)
        XCTAssertEqual(message?.snapshot.campaign?.name, "Join Campaign")
    }

    func testActiveCampaignEventHubShutdownFinishesStreams() async throws {
        let hub = ActiveCampaignEventHub()
        let stream = await hub.subscribe()
        var iterator = stream.makeAsyncIterator()

        await hub.shutdown()

        let message = await iterator.next()
        XCTAssertNil(message)
    }
}
