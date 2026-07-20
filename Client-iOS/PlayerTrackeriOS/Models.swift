import Foundation

struct CampaignStateDTO: Codable, Equatable {
    let id: UUID
    let name: String
    let rulesetId: String
    let rulesetLabel: String
    let encounterState: EncounterStateDTO
    var currency: [CurrencyAmountDTO]?
    var partyTreasure: [InventoryEntryDTO]?
}

struct PlayerIdentityDTO: Codable, Equatable {
    let id: UUID
    let campaignID: UUID
    let displayName: String
    let isReferee: Bool
}

struct PlayerSessionDTO: Codable, Equatable {
    let player: PlayerIdentityDTO
    let campaign: CampaignStateDTO
}

struct PlayerSessionResult: Equatable {
    let sessionToken: String
    let session: PlayerSessionDTO
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
    let creatureLibrary: CreatureLibraryReferenceDTO?
    let equipmentLibrary: EquipmentLibraryReferenceDTO?
    let conditions: [ConditionDefinitionDTO]
    let stats: [String]?
    let statAliases: [String: String]?
    let statBlocks: [StatBlockDefinitionDTO]?
    let initiative: InitiativeRuleDTO?
    let supportsTempHp: Bool?
    let allowNegativeHealth: Bool?
    let license: String?
    let standardDie: String?
    let currency: CurrencySystemDTO?
}

struct CreatureLibraryReferenceDTO: Codable, Equatable {
    let file: String
}

struct EquipmentLibraryReferenceDTO: Codable, Equatable {
    let file: String
    let categoryIcons: [String: String]?
    let commonWeightUnits: [String]?
}

struct StatBlockDefinitionDTO: Codable, Equatable, Identifiable {
    let id: String
    let label: String
    let appliesTo: [String]?
    let stats: [String]
    let defaultBlock: Bool?
}

struct InitiativeRuleDTO: Codable, Equatable {
    let mode: String?
    let stats: [String]?
    let chart: [InitiativeChartEntryDTO]?
}

struct InitiativeChartEntryDTO: Codable, Equatable {
    let min: Int
    let max: Int?
    let bonus: Int
}

struct EquipmentLibraryResponseDTO: Codable, Equatable {
    let rulesetId: String
    let rulesetLabel: String
    let query: String?
    let totalMatches: Int
    let hasMore: Bool
    let items: [EquipmentLibraryItemDTO]
}

struct EquipmentLibraryItemDTO: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let category: String?
    let value: Double?
    let weight: Double?
    let url: String?
    let source: String?
    let notes: String?
}

struct CurrencySystemDTO: Codable, Equatable {
    let commonCurrencyId: String
    let units: [CurrencyUnitDTO]
}

struct CurrencyUnitDTO: Codable, Equatable, Identifiable {
    let id: String
    let label: String
    let symbol: String?
    let valueInCommonCurrency: Double
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

struct CurrencyAmountDTO: Codable, Equatable, Identifiable {
    var id: String { unitId }
    let unitId: String
    let amount: Int
}

enum EquipmentPreset {
    static func normalizeItemName(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
    }

    static func findEquipmentPreset(
        itemName: String,
        equipmentLibraryItems: [EquipmentLibraryItemDTO]
    ) -> EquipmentLibraryItemDTO? {
        let normalizedName = normalizeItemName(itemName)
        guard !normalizedName.isEmpty else { return nil }
        return equipmentLibraryItems.first { normalizeItemName($0.name) == normalizedName }
    }
}

struct InventoryEntryDTO: Codable, Equatable {
    var id: UUID?
    let name: String
    let quantity: Int
    let value: Double
    let weight: Double
    let url: String?
    let category: String?
    let containerId: UUID?
    let isContainer: Bool
}

struct PlayerViewDTO: Codable, Equatable, Identifiable {
    let id: UUID
    let ownerId: UUID
    let ownerName: String
    let claimedSessionId: UUID?
    let claimedDisplayName: String?
    let name: String
    let initiative: Double?
    let stats: [StatEntryDTO]
    let currency: [CurrencyAmountDTO]?
    var inventory: [InventoryEntryDTO]?
    let revealStats: Bool
    let autoSkipTurn: Bool
    let useAppInitiativeRoll: Bool
    let initiativeBonus: Int
    let isHidden: Bool
    let revealOnTurn: Bool
    let conditions: [String]
    let isReferee: Bool
    let isClaimable: Bool

    init(
        id: UUID,
        ownerId: UUID,
        ownerName: String,
        claimedSessionId: UUID?,
        claimedDisplayName: String?,
        name: String,
        initiative: Double?,
        stats: [StatEntryDTO],
        currency: [CurrencyAmountDTO]?,
        inventory: [InventoryEntryDTO]? = nil,
        revealStats: Bool,
        autoSkipTurn: Bool,
        useAppInitiativeRoll: Bool,
        initiativeBonus: Int,
        isHidden: Bool,
        revealOnTurn: Bool,
        conditions: [String],
        isReferee: Bool,
        isClaimable: Bool
    ) {
        self.id = id
        self.ownerId = ownerId
        self.ownerName = ownerName
        self.claimedSessionId = claimedSessionId
        self.claimedDisplayName = claimedDisplayName
        self.name = name
        self.initiative = initiative
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
        self.isReferee = isReferee
        self.isClaimable = isClaimable
    }
}

extension PlayerViewDTO {
    var controllerDisplayName: String {
        let claimedName = claimedDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !claimedName.isEmpty {
            return claimedName
        }
        if isReferee {
            return "Referee"
        }
        return ownerName.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var isUnclaimed: Bool {
        claimedSessionId == nil
    }

    var canBeClaimed: Bool {
        isUnclaimed && (!isReferee || isClaimable)
    }

    func isClaimed(by playerID: UUID) -> Bool {
        claimedSessionId == playerID
    }
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
    let ownerName: String
    let name: String
    let initiative: Double?
    let stats: [StatEntryDTO]?
    let currency: [CurrencyAmountDTO]?
    let inventory: [InventoryEntryDTO]?
    let revealStats: Bool?
    let autoSkipTurn: Bool?
    let useAppInitiativeRoll: Bool?
    let initiativeBonus: Int?
    let isHidden: Bool?
    let revealOnTurn: Bool?
    let conditions: [String]?

    init(
        id: UUID? = nil,
        campaignName: String? = nil,
        ownerName: String,
        name: String,
        initiative: Double? = nil,
        stats: [StatEntryDTO]? = nil,
        currency: [CurrencyAmountDTO]? = nil,
        inventory: [InventoryEntryDTO]? = nil,
        revealStats: Bool? = nil,
        autoSkipTurn: Bool? = nil,
        useAppInitiativeRoll: Bool? = nil,
        initiativeBonus: Int? = nil,
        isHidden: Bool? = nil,
        revealOnTurn: Bool? = nil,
        conditions: [String]? = nil
    ) {
        self.id = id
        self.campaignName = campaignName
        self.ownerName = ownerName
        self.name = name
        self.initiative = initiative
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

struct PartyTreasureUpdateInputDTO: Codable {
    let items: [InventoryEntryDTO]
    let currency: [CurrencyAmountDTO]?

    init(items: [InventoryEntryDTO], currency: [CurrencyAmountDTO]? = nil) {
        self.items = items
        self.currency = currency
    }
}

struct PartyTreasureClaimInputDTO: Codable {
    let characterId: UUID
    let itemId: UUID
    let quantity: Int?

    init(characterId: UUID, itemId: UUID, quantity: Int? = nil) {
        self.characterId = characterId
        self.itemId = itemId
        self.quantity = quantity
    }
}

struct CharacterRenameInputDTO: Codable {
    let name: String
}

struct PlayerJoinInputDTO: Codable {
    let displayName: String
    let inviteToken: String?

    init(displayName: String, inviteToken: String? = nil) {
        self.displayName = displayName
        self.inviteToken = inviteToken
    }
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
        initiativeBonus: String,
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
        self.initiativeBonus = initiativeBonus
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
            initiativeBonus: "",
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
            initiativeBonus: String(player.initiativeBonus),
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

func rollInitiative(standardDie: String?, bonus: Int) -> Double? {
    let sanitizedDie = (standardDie?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()).flatMap { $0.isEmpty ? nil : $0 }
        ?? "d20"
    let parts = sanitizedDie.split(separator: "d", omittingEmptySubsequences: false)
    guard parts.count == 2 else {
        return nil
    }

    let count = Int(parts[0]) ?? 1
    guard let sides = Int(parts[1]), count > 0, sides > 0 else {
        return nil
    }

    let rollTotal = (0..<count).reduce(0) { partialResult, _ in
        partialResult + Int.random(in: 1...sides)
    }
    return Double(rollTotal + bonus)
}
