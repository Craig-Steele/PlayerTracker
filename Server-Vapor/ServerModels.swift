import Foundation
import Vapor

struct ServerAddressResponse: Content {
    let ip: String
    let localIP: String
    let publicIP: String?
}

struct RulesetSummary: Content {
    let id: String
    let label: String
}

struct CampaignSummary: Content {
    let id: UUID
    let name: String
    let rulesetId: String
    let rulesetLabel: String
    let encounterState: EncounterState
    let isActive: Bool
    let claimTimeoutMinutes: Int
    let isInviteOnly: Bool
}

struct CampaignInviteResponse: Content {
    let campaign: CampaignSummary
    let token: String
    let playerName: String?
}

struct CampaignInviteCreateInput: Content {
    let playerName: String?

    init(playerName: String? = nil) {
        self.playerName = playerName
    }
}

struct CampaignMemberCreateInput: Content {
    let playerName: String

    init(playerName: String) {
        self.playerName = playerName
    }
}

struct StatEntry: Content {
    let key: String
    let current: Int
    let max: Int
}

struct CreatureLibraryCreature: Content {
    let id: String
    let name: String
    let cr: String?
    let alignment: String?
    let type: String?
    let size: String?
    let hp: Int?
    let ac: Int?
    let initiativeBonus: Int?
    let source: String?
    let referenceUrl: String?
    let notes: String?
    let tags: [String]?
    let stats: [StatEntry]?
}

struct CreatureLibraryResponse: Content {
    let rulesetId: String
    let rulesetLabel: String
    let query: String?
    let totalMatches: Int
    let hasMore: Bool
    let creatures: [CreatureLibraryCreature]
}

enum EncounterState: String, Content, Codable {
    case new = "new"
    case active = "active"
    case suspended = "suspended"
}

struct CampaignState: Content {
    let id: UUID
    let name: String
    let rulesetId: String
    let rulesetLabel: String
    let encounterState: EncounterState
    let claimTimeoutMinutes: Int
    let isInviteOnly: Bool
}

struct CampaignUpdateInput: Content {
    let name: String
    let rulesetId: String
    let claimTimeoutMinutes: Int?
    let isInviteOnly: Bool?
    let refereeSessionIds: [UUID]?

    init(
        name: String,
        rulesetId: String,
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool? = nil,
        refereeSessionIds: [UUID]? = nil
    ) {
        self.name = name
        self.rulesetId = rulesetId
        self.claimTimeoutMinutes = claimTimeoutMinutes
        self.isInviteOnly = isInviteOnly
        self.refereeSessionIds = refereeSessionIds
    }
}

struct AuthSignupInput: Content {
    let email: String
    let password: String
}

struct AuthLoginInput: Content {
    let email: String
    let password: String
}

struct AuthUserResponse: Content {
    let id: UUID
    let email: String
}

struct AuthSessionResponse: Content {
    let user: AuthUserResponse
}

struct PlayerJoinInput: Content {
    let displayName: String
    let inviteToken: String?

    init(displayName: String, inviteToken: String? = nil) {
        self.displayName = displayName
        self.inviteToken = inviteToken
    }
}

struct PlayerIdentityResponse: Content {
    let id: UUID
    let campaignID: UUID
    let loginName: String
    let displayName: String
    let isReferee: Bool
}

struct CampaignMemberSummary: Content {
    let id: UUID
    let displayName: String
    let isReferee: Bool
}

struct PlayerSessionResponse: Content {
    let player: PlayerIdentityResponse
    let campaign: CampaignState
}

struct UserData: Content {
    let name: String
    let initiative: Double?
}

struct CharacterState {
    let id: UUID
    var campaignName: String
    var ownerId: UUID
    var ownerName: String
    var lastPlayedByName: String?
    var claimedSessionId: UUID?
    var claimedDisplayName: String?
    var claimedAt: Date?
    var isReferee: Bool
    var characterName: String
    var initiative: Double?
    var stats: [String: StatEntry]
    var revealStats: Bool
    var autoSkipTurn: Bool
    var useAppInitiativeRoll: Bool
    var initiativeBonus: Int
    var isHidden: Bool
    var revealOnTurn: Bool
    var conditions: Set<String>
}

struct PlayerView: Content {
    let id: UUID
    let ownerId: UUID
    let ownerName: String
    let lastPlayedByName: String?
    let claimedSessionId: UUID?
    let claimedDisplayName: String?
    let claimedAt: Date?
    let name: String
    let initiative: Double?
    let stats: [StatEntry]
    let revealStats: Bool
    let autoSkipTurn: Bool
    let useAppInitiativeRoll: Bool
    let initiativeBonus: Int
    let isHidden: Bool
    let revealOnTurn: Bool
    let conditions: [String]
    let isReferee: Bool
}

struct GameState: Content {
    let round: Int
    let encounterState: EncounterState
    let currentTurnId: UUID?
    let currentTurnName: String?
    let players: [PlayerView]
}

struct CampaignStreamSnapshot: Content {
    let campaign: CampaignState
    let gameState: GameState
}

struct CampaignStreamMessage: Sendable {
    let event: String
    let snapshot: CampaignStreamSnapshot
}

struct ActiveCampaignStreamSnapshot: Content {
    let campaign: CampaignState?

    enum CodingKeys: String, CodingKey {
        case campaign
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        if let campaign {
            try container.encode(campaign, forKey: .campaign)
        } else {
            try container.encodeNil(forKey: .campaign)
        }
    }
}

struct ActiveCampaignStreamMessage: Sendable {
    let event: String
    let snapshot: ActiveCampaignStreamSnapshot
}

struct ConditionsInput: Content {
    let name: String
    let conditions: [String]
}

struct CharacterInput: Content {
    let id: UUID?
    let campaignName: String?
    let ownerId: UUID?
    let ownerName: String
    let name: String
    let initiative: Double?
    let stats: [StatEntry]?
    let revealStats: Bool?
    let autoSkipTurn: Bool?
    let useAppInitiativeRoll: Bool?
    let initiativeBonus: Int?
    let isHidden: Bool?
    let revealOnTurn: Bool?
    let conditions: [String]?
}

struct CharacterVisibilityInput: Content {
    let isHidden: Bool?
    let revealOnTurn: Bool?
}

struct CharacterRenameInput: Content {
    let name: String
}
