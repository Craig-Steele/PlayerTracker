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

struct StatEntry: Content {
    let key: String
    let current: Int
    let max: Int
}

enum EncounterState: String, Content, Codable {
    case new = "new"
    case active = "active"
    case suspended = "suspended"
}

struct CampaignState: Content {
    let name: String
    let rulesetId: String
    let rulesetLabel: String
    let encounterState: EncounterState
}

struct CampaignPersistedState: Content {
    let name: String
    let rulesetId: String
    let encounterState: EncounterState?
}

struct CampaignUpdateInput: Content {
    let name: String
    let rulesetId: String
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
}

struct GameState: Content {
    let round: Int
    let encounterState: EncounterState
    let currentTurnId: UUID?
    let currentTurnName: String?
    let players: [PlayerView]
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
