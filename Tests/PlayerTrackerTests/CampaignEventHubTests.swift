import Foundation
import Testing
@testable import PlayerTracker

@Suite("Campaign Event Hub")
struct CampaignEventHubTests {
    @Test("streams published updates")
    func streamsPublishedUpdates() async throws {
        let hub = CampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Live Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: [],
            partyTreasure: [],
            currency: []
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
        #expect(message?.event == "campaign-updated")
        #expect(message?.snapshot.campaign.id == campaign.id)
        #expect(message?.snapshot.gameState.round == 3)
    }

    @Test("streams turn changed updates")
    func streamsTurnChangedUpdates() async throws {
        let hub = CampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Live Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: [],
            partyTreasure: [],
            currency: []
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
        #expect(message?.event == "turn-changed")
        #expect(message?.snapshot.campaign.id == campaign.id)
        #expect(message?.snapshot.gameState.round == 4)
        #expect(message?.snapshot.gameState.currentTurnName == "Hero")
    }

    @Test("shutdown finishes streams")
    func shutdownFinishesStreams() async throws {
        let hub = CampaignEventHub()
        let campaign = CampaignState(
            id: UUID(),
            name: "Live Campaign",
            rulesetId: "traveller",
            rulesetLabel: "Traveller (SRD)",
            encounterState: .active,
            claimTimeoutMinutes: 5,
            isInviteOnly: false,
            userdataFiles: [],
            partyTreasure: [],
            currency: []
        )
        let stream = await hub.subscribe(campaignID: campaign.id)
        var iterator = stream.makeAsyncIterator()

        await hub.shutdown()

        let message = await iterator.next()
        #expect(message == nil)
    }
}
