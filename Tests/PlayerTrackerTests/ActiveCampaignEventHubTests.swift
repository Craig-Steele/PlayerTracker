import Foundation
import Testing
@testable import PlayerTracker

@Suite("Active Campaign Event Hub")
struct ActiveCampaignEventHubTests {
    @Test("streams published updates")
    func streamsPublishedUpdates() async throws {
        let hub = ActiveCampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Join Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: [],
            partyTreasure: [],
            currency: []
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
        #expect(message?.event == "campaign-updated")
        #expect(message?.snapshot.campaign?.id == campaign.id)
        #expect(message?.snapshot.campaign?.name == "Join Campaign")
    }

    @Test("shutdown finishes streams")
    func shutdownFinishesStreams() async throws {
        let hub = ActiveCampaignEventHub()
        let stream = await hub.subscribe()
        var iterator = stream.makeAsyncIterator()

        await hub.shutdown()

        let message = await iterator.next()
        #expect(message == nil)
    }
}
