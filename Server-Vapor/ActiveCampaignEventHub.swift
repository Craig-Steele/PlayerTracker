import Foundation

actor ActiveCampaignEventHub {
    private var subscribers: [UUID: AsyncStream<ActiveCampaignStreamMessage>.Continuation] = [:]

    func subscribe() -> AsyncStream<ActiveCampaignStreamMessage> {
        let subscriberID = UUID()
        let (stream, continuation) = AsyncStream<ActiveCampaignStreamMessage>.makeStream()
        subscribers[subscriberID] = continuation
        continuation.onTermination = { [subscriberID] _ in
            Task {
                await self.removeSubscriber(subscriberID: subscriberID)
            }
        }
        return stream
    }

    func publish(message: ActiveCampaignStreamMessage) {
        for continuation in subscribers.values {
            continuation.yield(message)
        }
    }

    private func removeSubscriber(subscriberID: UUID) {
        subscribers.removeValue(forKey: subscriberID)
    }
}
