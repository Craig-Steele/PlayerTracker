import Foundation

actor CampaignEventHub {
    private var subscribers: [UUID: [UUID: AsyncStream<CampaignStreamMessage>.Continuation]] = [:]

    func subscribe(campaignID: UUID) -> AsyncStream<CampaignStreamMessage> {
        let subscriberID = UUID()
        let (stream, continuation) = AsyncStream<CampaignStreamMessage>.makeStream()
        var currentSubscribers = subscribers[campaignID] ?? [:]
        currentSubscribers[subscriberID] = continuation
        subscribers[campaignID] = currentSubscribers
        continuation.onTermination = { [campaignID, subscriberID] _ in
            Task {
                await self.removeSubscriber(campaignID: campaignID, subscriberID: subscriberID)
            }
        }
        return stream
    }

    func publish(campaignID: UUID, message: CampaignStreamMessage) {
        guard let currentSubscribers = subscribers[campaignID] else {
            return
        }
        for continuation in currentSubscribers.values {
            continuation.yield(message)
        }
    }

    private func removeSubscriber(campaignID: UUID, subscriberID: UUID) {
        guard var currentSubscribers = subscribers[campaignID] else {
            return
        }
        currentSubscribers.removeValue(forKey: subscriberID)
        if currentSubscribers.isEmpty {
            subscribers.removeValue(forKey: campaignID)
        } else {
            subscribers[campaignID] = currentSubscribers
        }
    }
}
