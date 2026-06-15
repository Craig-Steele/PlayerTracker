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

struct CampaignUserDataFileSummary: Content {
    let name: String
    let selected: Bool
    let missing: Bool
}

struct CampaignUserDataResponse: Content {
    let rulesetId: String
    let files: [CampaignUserDataFileSummary]
}

struct CampaignUserDataUpdateInput: Content {
    let files: [String]
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

struct CurrencyAmount: Content {
    let unitId: String
    let amount: Int
}

struct InventoryEntry: Content {
    let id: UUID?
    let name: String
    let quantity: Int
    let value: Double
    let weight: Double
    let url: String?
    let containerId: UUID?
    let isContainer: Bool

    init(
        id: UUID? = nil,
        name: String,
        quantity: Int,
        value: Double,
        weight: Double,
        url: String?,
        containerId: UUID? = nil,
        isContainer: Bool = false
    ) {
        self.id = id
        self.name = name
        self.quantity = quantity
        self.value = value
        self.weight = weight
        self.url = url
        self.containerId = containerId
        self.isContainer = isContainer
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        if let idString = try container.decodeIfPresent(String.self, forKey: .id)?.trimmingCharacters(in: .whitespacesAndNewlines),
           let parsedID = UUID(uuidString: idString) {
            id = parsedID
        } else {
            id = nil
        }
        name = try container.decode(String.self, forKey: .name)
        quantity = try container.decode(Int.self, forKey: .quantity)
        value = try container.decode(Double.self, forKey: .value)
        weight = try container.decode(Double.self, forKey: .weight)
        url = try container.decodeIfPresent(String.self, forKey: .url)
        if let containerIDString = try container.decodeIfPresent(String.self, forKey: .containerId)?.trimmingCharacters(in: .whitespacesAndNewlines),
           let parsedContainerID = UUID(uuidString: containerIDString) {
            containerId = parsedContainerID
        } else {
            containerId = nil
        }
        isContainer = try container.decodeIfPresent(Bool.self, forKey: .isContainer) ?? false
    }
}

struct CreatureLibraryCreature: Content {
    let id: String
    let name: String
    let baseCreatureId: String?
    let baseCreatureName: String?
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

struct EquipmentLibraryItem: Content {
    let id: String
    let name: String
    let value: Double?
    let weight: Double?
    let url: String?
    let source: String?
    let notes: String?
}

struct EquipmentLibraryResponse: Content {
    let rulesetId: String
    let rulesetLabel: String
    let query: String?
    let totalMatches: Int
    let hasMore: Bool
    let items: [EquipmentLibraryItem]
}

struct CreatureLibraryImportFile: Content {
    let filename: String
    let contents: String
}

struct CreatureLibraryImportInput: Content {
    let files: [CreatureLibraryImportFile]
    let overwrite: Bool?
}

struct CreatureLibraryImportResponse: Content {
    let rulesetId: String
    let destination: String
    let imported: Int
    let skipped: Int
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
    let userdataFiles: [String]
    let partyTreasure: [InventoryEntry]
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

struct PartyTreasureUpdateInput: Content {
    let items: [InventoryEntry]
}

struct PartyTreasureClaimInput: Content {
    let characterId: UUID
    let itemId: UUID
}

struct CharacterState {
    let id: UUID
    var campaignName: String
    var ownerId: UUID
    var ownerName: String
    var referenceUrl: String?
    var statBlockId: String?
    var lastPlayedByName: String?
    var claimedSessionId: UUID?
    var claimedDisplayName: String?
    var claimedAt: Date?
    var isReferee: Bool
    var isClaimable: Bool
    var characterName: String
    var initiative: Double?
    var initiativeGroupId: UUID?
    var initiativeGroupIndex: Int?
    var stats: [String: StatEntry]
    var currency: [CurrencyAmount]
    var inventory: [InventoryEntry]
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
    let referenceUrl: String?
    let statBlockId: String?
    let initiativeGroupId: UUID?
    let lastPlayedByName: String?
    let claimedSessionId: UUID?
    let claimedDisplayName: String?
    let claimedAt: Date?
    let name: String
    let initiative: Double?
    let stats: [StatEntry]
    let currency: [CurrencyAmount]
    let inventory: [InventoryEntry]
    let revealStats: Bool
    let autoSkipTurn: Bool
    let useAppInitiativeRoll: Bool
    let initiativeBonus: Int
    let isHidden: Bool
    let revealOnTurn: Bool
    let conditions: [String]
    let isReferee: Bool
    let isClaimable: Bool
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
    let referenceUrl: String?
    let statBlockId: String?
    let initiative: Double?
    let stats: [StatEntry]?
    let currency: [CurrencyAmount]?
    let inventory: [InventoryEntry]?
    let revealStats: Bool?
    let autoSkipTurn: Bool?
    let useAppInitiativeRoll: Bool?
    let initiativeBonus: Int?
    let isHidden: Bool?
    let revealOnTurn: Bool?
    let initiativeGroupId: UUID?
    let initiativeGroupIndex: Int?
    let conditions: [String]?

    init(
        id: UUID? = nil,
        campaignName: String? = nil,
        ownerId: UUID? = nil,
        ownerName: String,
        name: String,
        referenceUrl: String? = nil,
        statBlockId: String? = nil,
        initiative: Double? = nil,
        stats: [StatEntry]? = nil,
        currency: [CurrencyAmount]? = nil,
        inventory: [InventoryEntry]? = nil,
        revealStats: Bool? = nil,
        autoSkipTurn: Bool? = nil,
        useAppInitiativeRoll: Bool? = nil,
        initiativeBonus: Int? = nil,
        isHidden: Bool? = nil,
        revealOnTurn: Bool? = nil,
        initiativeGroupId: UUID? = nil,
        initiativeGroupIndex: Int? = nil,
        conditions: [String]? = nil
    ) {
        self.id = id
        self.campaignName = campaignName
        self.ownerId = ownerId
        self.ownerName = ownerName
        self.name = name
        self.referenceUrl = referenceUrl
        self.statBlockId = statBlockId
        self.initiative = initiative
        self.initiativeGroupId = initiativeGroupId
        self.initiativeGroupIndex = initiativeGroupIndex
        self.stats = stats
        self.currency = currency
        self.inventory = inventory
        self.revealStats = revealStats
        self.autoSkipTurn = autoSkipTurn
        self.useAppInitiativeRoll = useAppInitiativeRoll
        self.initiativeBonus = initiativeBonus
        self.isHidden = isHidden
        self.revealOnTurn = revealOnTurn
        self.conditions = conditions
    }
}

struct CharacterVisibilityInput: Content {
    let isHidden: Bool?
    let revealOnTurn: Bool?
}

struct CharacterRenameInput: Content {
    let name: String
}
