import Foundation

public struct ConditionDefinition: Codable, Sendable, Equatable {
    public let name: String
    public let abbreviation: String?
    public let description: String?

    public init(name: String, abbreviation: String? = nil, description: String? = nil) {
        self.name = name
        self.abbreviation = abbreviation
        self.description = description
    }
}

public struct RuleSet: Codable, Sendable, Equatable {
    public let id: String
    public let label: String
    public let icon: String?
    public let rulesBaseURL: String?
    public let conditions: [ConditionDefinition]
    public let stats: [String]
    public let supportsTempHP: Bool
    public let allowNegativeHealth: Bool
    public let license: String?
    public let standardDie: String?

    public init(
        id: String,
        label: String,
        icon: String? = nil,
        rulesBaseURL: String? = nil,
        conditions: [ConditionDefinition] = [],
        stats: [String] = [],
        supportsTempHP: Bool = false,
        allowNegativeHealth: Bool = false,
        license: String? = nil,
        standardDie: String? = nil
    ) {
        self.id = id
        self.label = label
        self.icon = icon
        self.rulesBaseURL = rulesBaseURL
        self.conditions = conditions
        self.stats = stats
        self.supportsTempHP = supportsTempHP
        self.allowNegativeHealth = allowNegativeHealth
        self.license = license
        self.standardDie = standardDie
    }
}

public enum EncounterState: String, Codable, Sendable {
    case new
    case active
    case suspended
}

public struct CampaignState: Codable, Sendable, Equatable {
    public let name: String
    public let rulesetID: String
    public let rulesetLabel: String
    public let encounterState: EncounterState

    public init(name: String, rulesetID: String, rulesetLabel: String, encounterState: EncounterState) {
        self.name = name
        self.rulesetID = rulesetID
        self.rulesetLabel = rulesetLabel
        self.encounterState = encounterState
    }
}

public struct StatEntry: Codable, Sendable, Equatable {
    public let key: String
    public let current: Int
    public let max: Int

    public init(key: String, current: Int, max: Int) {
        self.key = key
        self.current = current
        self.max = max
    }
}

public struct CharacterRecord: Codable, Sendable, Equatable {
    public let id: UUID
    public var campaignName: String
    public var ownerID: UUID
    public var ownerName: String
    public var characterName: String
    public var initiative: Int
    public var stats: [String: StatEntry]
    public var revealStats: Bool
    public var isHidden: Bool
    public var revealOnTurn: Bool
    public var conditions: Set<String>

    public init(
        id: UUID,
        campaignName: String,
        ownerID: UUID,
        ownerName: String,
        characterName: String,
        initiative: Int,
        stats: [String: StatEntry] = [:],
        revealStats: Bool = false,
        isHidden: Bool = false,
        revealOnTurn: Bool = false,
        conditions: Set<String> = []
    ) {
        self.id = id
        self.campaignName = campaignName
        self.ownerID = ownerID
        self.ownerName = ownerName
        self.characterName = characterName
        self.initiative = initiative
        self.stats = stats
        self.revealStats = revealStats
        self.isHidden = isHidden
        self.revealOnTurn = revealOnTurn
        self.conditions = conditions
    }
}

public struct PlayerView: Codable, Sendable, Equatable {
    public let id: UUID
    public let ownerID: UUID
    public let ownerName: String
    public let name: String
    public let initiative: Int
    public let stats: [StatEntry]
    public let revealStats: Bool
    public let isHidden: Bool
    public let revealOnTurn: Bool
    public let conditions: [String]

    public init(
        id: UUID,
        ownerID: UUID,
        ownerName: String,
        name: String,
        initiative: Int,
        stats: [StatEntry],
        revealStats: Bool,
        isHidden: Bool,
        revealOnTurn: Bool,
        conditions: [String]
    ) {
        self.id = id
        self.ownerID = ownerID
        self.ownerName = ownerName
        self.name = name
        self.initiative = initiative
        self.stats = stats
        self.revealStats = revealStats
        self.isHidden = isHidden
        self.revealOnTurn = revealOnTurn
        self.conditions = conditions
    }
}

public struct GameState: Codable, Sendable, Equatable {
    public let round: Int
    public let encounterState: EncounterState
    public let currentTurnID: UUID?
    public let currentTurnName: String?
    public let players: [PlayerView]

    public init(
        round: Int,
        encounterState: EncounterState,
        currentTurnID: UUID?,
        currentTurnName: String?,
        players: [PlayerView]
    ) {
        self.round = round
        self.encounterState = encounterState
        self.currentTurnID = currentTurnID
        self.currentTurnName = currentTurnName
        self.players = players
    }
}

public enum ViewerRole: String, Codable, Sendable {
    case player
    case referee
}
