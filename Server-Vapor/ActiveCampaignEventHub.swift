import Foundation

actor ActiveCampaignEventHub {
    private var subscribers: [UUID: AsyncStream<ActiveCampaignStreamMessage>.Continuation] = [:]
    private var isShutdown = false

    func subscribe() -> AsyncStream<ActiveCampaignStreamMessage> {
        let subscriberID = UUID()
        let (stream, continuation) = AsyncStream<ActiveCampaignStreamMessage>.makeStream()
        guard !isShutdown else {
            continuation.finish()
            return stream
        }
        subscribers[subscriberID] = continuation
        continuation.onTermination = { [subscriberID] _ in
            Task {
                await self.removeSubscriber(subscriberID: subscriberID)
            }
        }
        return stream
    }

    func publish(message: ActiveCampaignStreamMessage) {
        guard !isShutdown else {
            return
        }
        for continuation in subscribers.values {
            continuation.yield(message)
        }
    }

    func shutdown() {
        guard !isShutdown else {
            return
        }
        isShutdown = true
        let currentSubscribers = subscribers
        subscribers.removeAll()
        for continuation in currentSubscribers.values {
            continuation.finish()
        }
    }

    private func removeSubscriber(subscriberID: UUID) {
        guard !isShutdown else {
            return
        }
        subscribers.removeValue(forKey: subscriberID)
    }
}
