import Foundation
import Testing
@testable import PlayerTracker

@Suite(.serialized)
struct TacticalEventHubTests {
    @Test
    func publishesTokenUpdatesToSubscribers() async throws {
        let hub = TacticalEventHub()
        let stream = await hub.subscribe()
        let token = TacticalTokenSnapshot(
            id: "campaign:player:one",
            characterId: UUID(),
            displayName: "Player One",
            ownerName: "Player One",
            tokenDescription: nil,
            conditions: [],
            ownerId: "owner-one",
            team: "player",
            x: 4,
            y: 7,
            z: 0,
            isHidden: false
        )

        await hub.publish(token: token)
        var iterator = stream.makeAsyncIterator()
        let message = try #require(await iterator.next())

        #expect(message.event == "token-updated")
        #expect(message.payload.token == token)
    }
}
