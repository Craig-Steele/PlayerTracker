import Foundation

struct TacticalStreamMessage: Sendable {
    let event: String
    let payload: TacticalTokenUpdateEvent
}

actor TacticalEventHub {
    private var subscribers: [UUID: AsyncStream<TacticalStreamMessage>.Continuation] = [:]
    private var isShutdown = false

    func subscribe() -> AsyncStream<TacticalStreamMessage> {
        let subscriberID = UUID()
        let (stream, continuation) = AsyncStream<TacticalStreamMessage>.makeStream()
        guard !isShutdown else {
            continuation.finish()
            return stream
        }
        subscribers[subscriberID] = continuation
        continuation.onTermination = { [subscriberID] _ in
            Task { await self.removeSubscriber(subscriberID: subscriberID) }
        }
        return stream
    }

    func publish(token: TacticalTokenSnapshot) {
        guard !isShutdown else { return }
        let message = TacticalStreamMessage(
            event: "token-updated",
            payload: TacticalTokenUpdateEvent(token: token)
        )
        for continuation in subscribers.values {
            continuation.yield(message)
        }
    }

    func shutdown() {
        guard !isShutdown else { return }
        isShutdown = true
        let currentSubscribers = subscribers
        subscribers.removeAll()
        for continuation in currentSubscribers.values {
            continuation.finish()
        }
    }

    private func removeSubscriber(subscriberID: UUID) {
        guard !isShutdown else { return }
        subscribers.removeValue(forKey: subscriberID)
    }
}
