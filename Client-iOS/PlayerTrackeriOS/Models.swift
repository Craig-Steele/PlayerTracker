import Foundation

struct CampaignStateDTO: Codable, Equatable {
    let name: String
    let rulesetId: String
    let rulesetLabel: String
    let encounterState: EncounterStateDTO
}

enum EncounterStateDTO: String, Codable, Equatable {
    case new
    case active
    case suspended
}

struct RuleSetLibraryDTO: Codable, Equatable {
    let id: String
    let label: String
    let icon: String?
    let rulesBaseUrl: String?
    let conditions: [ConditionDefinitionDTO]
    let stats: [String]?
    let supportsTempHp: Bool?
    let allowNegativeHealth: Bool?
    let license: String?
    let standardDie: String?
}

struct ConditionDefinitionDTO: Codable, Equatable, Identifiable {
    var id: String { name }
    let name: String
    let abbreviation: String?
    let description: String?
}

struct StatEntryDTO: Codable, Equatable, Identifiable {
    var id: String { key }
    let key: String
    let current: Int
    let max: Int
}

struct PlayerViewDTO: Codable, Equatable, Identifiable {
    let id: UUID
    let ownerId: UUID
    let ownerName: String
    let name: String
    let initiative: Double?
    let stats: [StatEntryDTO]
    let revealStats: Bool
    let autoSkipTurn: Bool
    let useAppInitiativeRoll: Bool
    let initiativeBonus: Int
    let isHidden: Bool
    let revealOnTurn: Bool
    let conditions: [String]
}

struct GameStateDTO: Codable, Equatable {
    let round: Int
    let encounterState: EncounterStateDTO
    let currentTurnId: UUID?
    let currentTurnName: String?
    let players: [PlayerViewDTO]
}

struct CharacterInputDTO: Codable {
    let id: UUID?
    let campaignName: String?
    let ownerId: UUID?
    let ownerName: String
    let name: String
    let initiative: Double?
    let stats: [StatEntryDTO]?
    let revealStats: Bool?
    let autoSkipTurn: Bool?
    let useAppInitiativeRoll: Bool?
    let initiativeBonus: Int?
    let isHidden: Bool?
    let revealOnTurn: Bool?
    let conditions: [String]?
}

struct CharacterRenameInputDTO: Codable {
    let name: String
}

struct EditableStat: Identifiable, Equatable {
    var id: String { key }
    let key: String
    var current: String
    var max: String

    var currentValue: Int {
        Int(current.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
    }

    var maxValue: Int {
        Int(max.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
    }
}

struct CharacterDraft: Identifiable, Equatable {
    let id: UUID?
    var name: String
    var revealStats: Bool
    var autoSkipTurn: Bool
    var useAppInitiativeRoll: Bool
    var initiativeBonus: String
    var stats: [EditableStat]
    var selectedConditions: Set<String>

    init(
        id: UUID?,
        name: String,
        revealStats: Bool,
        autoSkipTurn: Bool,
        useAppInitiativeRoll: Bool,
        initiativeBonus: Int,
        statKeys: [String],
        supportsTempHp: Bool,
        sourceStats: [StatEntryDTO],
        selectedConditions: [String]
    ) {
        self.id = id
        self.name = name
        self.revealStats = revealStats
        self.autoSkipTurn = autoSkipTurn
        self.useAppInitiativeRoll = useAppInitiativeRoll
        self.initiativeBonus = String(initiativeBonus)
        self.selectedConditions = Set(selectedConditions)

        var orderedKeys = statKeys
        if supportsTempHp && !orderedKeys.contains("TempHP") {
            orderedKeys.append("TempHP")
        }
        if orderedKeys.isEmpty {
            orderedKeys = ["HP"]
        }

        self.stats = orderedKeys.map { key in
            let existing = sourceStats.first(where: { $0.key == key })
            let current: String
            if let existing {
                current = String(existing.current)
            } else if key == "TempHP" {
                current = "0"
            } else {
                current = ""
            }
            let max: String
            if key == "TempHP" {
                max = ""
            } else {
                max = existing.map { String($0.max) } ?? ""
            }
            return EditableStat(key: key, current: current, max: max)
        }
    }

    static func new(ruleSet: RuleSetLibraryDTO?) -> CharacterDraft {
        CharacterDraft(
            id: nil,
            name: "",
            revealStats: false,
            autoSkipTurn: false,
            useAppInitiativeRoll: true,
            initiativeBonus: 0,
            statKeys: ruleSet?.stats ?? ["HP"],
            supportsTempHp: ruleSet?.supportsTempHp ?? false,
            sourceStats: [],
            selectedConditions: []
        )
    }

    init(player: PlayerViewDTO, ruleSet: RuleSetLibraryDTO?) {
        self.init(
            id: player.id,
            name: player.name,
            revealStats: player.revealStats,
            autoSkipTurn: player.autoSkipTurn,
            useAppInitiativeRoll: player.useAppInitiativeRoll,
            initiativeBonus: player.initiativeBonus,
            statKeys: ruleSet?.stats ?? ["HP"],
            supportsTempHp: ruleSet?.supportsTempHp ?? false,
            sourceStats: player.stats,
            selectedConditions: player.conditions
        )
    }

    func buildStatsPayload(allowNegativeHealth: Bool) -> [StatEntryDTO]? {
        let payload = stats.compactMap { entry -> StatEntryDTO? in
            let currentValue = Int(entry.current.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
            if entry.key == "TempHP" {
                return StatEntryDTO(key: entry.key, current: max(0, currentValue), max: 0)
            }

            let maxValue = Int(entry.max.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
            guard maxValue > 0 else { return nil }
            let boundedCurrent = allowNegativeHealth
                ? min(currentValue, maxValue)
                : min(max(currentValue, 0), maxValue)
            return StatEntryDTO(key: entry.key, current: boundedCurrent, max: maxValue)
        }
        return payload.isEmpty ? nil : payload
    }

    mutating func adjustStat(
        named key: String,
        delta: Int,
        allowNegativeHealth: Bool
    ) {
        guard let index = stats.firstIndex(where: { $0.key == key }) else { return }
        let currentValue = stats[index].currentValue
        if key == "TempHP" {
            stats[index].current = String(max(0, currentValue + delta))
            return
        }

        let maxValue = max(0, stats[index].maxValue)
        let lowerBound = allowNegativeHealth ? Int.min : 0
        let upperBound = maxValue > 0 ? maxValue : Int.max
        let nextValue = min(max(currentValue + delta, lowerBound), upperBound)
        stats[index].current = String(nextValue)
    }
}
