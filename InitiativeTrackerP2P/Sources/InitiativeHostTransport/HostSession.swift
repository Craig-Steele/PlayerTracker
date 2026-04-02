import Foundation
import InitiativeCore

public struct HostAnnouncement: Codable, Sendable, Equatable {
    public let sessionID: UUID
    public let campaignName: String
    public let hostDisplayName: String
    public let port: Int
    public let joinCode: String

    public init(
        sessionID: UUID,
        campaignName: String,
        hostDisplayName: String,
        port: Int,
        joinCode: String
    ) {
        self.sessionID = sessionID
        self.campaignName = campaignName
        self.hostDisplayName = hostDisplayName
        self.port = port
        self.joinCode = joinCode
    }
}

public enum HostCommand: Codable, Sendable, Equatable {
    case upsertCharacter(GameSession.CharacterInput)
    case renameOwner(ownerID: UUID, name: String)
    case renameCharacter(id: UUID, name: String)
    case deleteCharacter(id: UUID)
    case setEncounterState(EncounterState)
    case advanceTurn
    case setCurrentTurn(characterID: UUID)
}

public enum HostEvent: Codable, Sendable, Equatable {
    case snapshot(GameState)
    case campaign(CampaignState)
    case ruleset(RuleSet)
    case error(String)
}

public protocol HostSessionTransport: Sendable {
    func start(announcement: HostAnnouncement) async throws
    func stop() async
    func broadcast(_ event: HostEvent) async
}

public actor HostSessionCoordinator {
    private let session: GameSession
    private let transport: HostSessionTransport

    public init(session: GameSession, transport: HostSessionTransport) {
        self.session = session
        self.transport = transport
    }

    public func start(announcement: HostAnnouncement) async throws {
        try await transport.start(announcement: announcement)
        await transport.broadcast(.campaign(await session.campaign()))
        await transport.broadcast(.snapshot(await session.state(for: .player)))
    }

    public func stop() async {
        await transport.stop()
    }

    public func handle(_ command: HostCommand) async {
        switch command {
        case .upsertCharacter(let input):
            _ = await session.upsertCharacter(input)
            await publishState()
        case .renameOwner(let ownerID, let name):
            await session.renameOwner(ownerID: ownerID, to: name)
            await publishState()
        case .renameCharacter(let id, let name):
            await session.renameCharacter(id: id, to: name)
            await publishState()
        case .deleteCharacter(let id):
            _ = await session.deleteCharacter(id: id)
            await publishState()
        case .setEncounterState(let state):
            await session.setEncounterState(state)
            await publishState()
        case .advanceTurn:
            _ = await session.advanceTurn()
            await publishState()
        case .setCurrentTurn(let characterID):
            _ = await session.setCurrentTurn(characterID: characterID)
            await publishState()
        }
    }

    private func publishState() async {
        await transport.broadcast(.campaign(await session.campaign()))
        await transport.broadcast(.snapshot(await session.state(for: .player)))
    }
}
