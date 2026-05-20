import Foundation

actor CampaignEventHub {
    private var subscribers: [UUID: [UUID: AsyncStream<CampaignStreamMessage>.Continuation]] = [:]
    private var isShutdown = false

    func subscribe(campaignID: UUID) -> AsyncStream<CampaignStreamMessage> {
        let subscriberID = UUID()
        let (stream, continuation) = AsyncStream<CampaignStreamMessage>.makeStream()
        guard !isShutdown else {
            continuation.finish()
            return stream
        }
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
        guard !isShutdown else {
            return
        }
        guard let currentSubscribers = subscribers[campaignID] else {
            return
        }
        for continuation in currentSubscribers.values {
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
        for continuations in currentSubscribers.values {
            for continuation in continuations.values {
                continuation.finish()
            }
        }
    }

    private func removeSubscriber(campaignID: UUID, subscriberID: UUID) {
        guard !isShutdown else {
            return
        }
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
