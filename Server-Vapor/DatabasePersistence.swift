import Fluent
import Vapor

final class CampaignRow: Model, @unchecked Sendable {
    static let schema = "campaigns"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "name")
    var name: String

    @Field(key: "ruleset_id")
    var rulesetId: String

    @Field(key: "is_archived")
    var isArchived: Bool

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(id: UUID? = nil, name: String, rulesetId: String, isArchived: Bool = false) {
        self.id = id
        self.name = name
        self.rulesetId = rulesetId
        self.isArchived = isArchived
    }
}

final class CampaignEncounterRow: Model, @unchecked Sendable {
    static let schema = "campaign_encounters"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "campaign_id")
    var campaignID: UUID

    @Field(key: "encounter_state")
    var encounterState: String

    @Field(key: "round_index")
    var roundIndex: Int

    @Field(key: "turn_index")
    var turnIndex: Int

    @OptionalField(key: "current_character_id")
    var currentCharacterID: UUID?

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        campaignID: UUID,
        encounterState: EncounterState,
        roundIndex: Int,
        turnIndex: Int,
        currentCharacterID: UUID? = nil
    ) {
        self.id = id
        self.campaignID = campaignID
        self.encounterState = encounterState.rawValue
        self.roundIndex = roundIndex
        self.turnIndex = turnIndex
        self.currentCharacterID = currentCharacterID
    }
}

final class CharacterRow: Model, @unchecked Sendable {
    static let schema = "characters"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "campaign_id")
    var campaignID: UUID

    @Field(key: "owner_id")
    var ownerID: UUID

    @Field(key: "owner_name")
    var ownerName: String

    @Field(key: "name")
    var name: String

    @OptionalField(key: "initiative")
    var initiative: Double?

    @Field(key: "reveal_stats")
    var revealStats: Bool

    @Field(key: "auto_skip_turn")
    var autoSkipTurn: Bool

    @Field(key: "use_app_initiative_roll")
    var useAppInitiativeRoll: Bool

    @Field(key: "initiative_bonus")
    var initiativeBonus: Int

    @Field(key: "is_hidden")
    var isHidden: Bool

    @Field(key: "reveal_on_turn")
    var revealOnTurn: Bool

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        campaignID: UUID,
        ownerID: UUID,
        ownerName: String,
        name: String,
        initiative: Double?,
        revealStats: Bool,
        autoSkipTurn: Bool,
        useAppInitiativeRoll: Bool,
        initiativeBonus: Int,
        isHidden: Bool,
        revealOnTurn: Bool
    ) {
        self.id = id
        self.campaignID = campaignID
        self.ownerID = ownerID
        self.ownerName = ownerName
        self.name = name
        self.initiative = initiative
        self.revealStats = revealStats
        self.autoSkipTurn = autoSkipTurn
        self.useAppInitiativeRoll = useAppInitiativeRoll
        self.initiativeBonus = initiativeBonus
        self.isHidden = isHidden
        self.revealOnTurn = revealOnTurn
    }
}

final class CharacterStatRow: Model, @unchecked Sendable {
    static let schema = "character_stats"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "character_id")
    var characterID: UUID

    @Field(key: "stat_key")
    var statKey: String

    @Field(key: "current_value")
    var currentValue: Int

    @Field(key: "max_value")
    var maxValue: Int

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        characterID: UUID,
        statKey: String,
        currentValue: Int,
        maxValue: Int
    ) {
        self.id = id
        self.characterID = characterID
        self.statKey = statKey
        self.currentValue = currentValue
        self.maxValue = maxValue
    }
}

final class CharacterConditionRow: Model, @unchecked Sendable {
    static let schema = "character_conditions"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "character_id")
    var characterID: UUID

    @Field(key: "condition")
    var condition: String

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(id: UUID? = nil, characterID: UUID, condition: String) {
        self.id = id
        self.characterID = characterID
        self.condition = condition
    }
}

enum DatabasePersistence {
    static func loadCampaign(
        named campaignName: String,
        on database: any Database
    ) async throws -> (id: UUID, rulesetId: String, encounterState: EncounterState, roundIndex: Int, turnIndex: Int, currentTurnID: UUID?)? {
        guard let campaign = try await CampaignRow.query(on: database)
            .filter(\.$name == campaignName)
            .first(),
              let campaignID = campaign.id else {
            return nil
        }

        let encounter = try await CampaignEncounterRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .first()

        let encounterState = encounter.flatMap { EncounterState(rawValue: $0.encounterState) } ?? .new
        let roundIndex = encounter?.roundIndex ?? 1
        let turnIndex = encounter?.turnIndex ?? 0
        let currentTurnID = encounter?.currentCharacterID
        return (campaignID, campaign.rulesetId, encounterState, roundIndex, turnIndex, currentTurnID)
    }

    static func upsertCampaignMetadata(
        name: String,
        rulesetId: String,
        isArchived: Bool = false,
        on database: any Database
    ) async throws -> UUID {
        if let campaign = try await CampaignRow.query(on: database)
            .filter(\.$name == name)
            .first(),
           let id = campaign.id {
            campaign.rulesetId = rulesetId
            campaign.isArchived = isArchived
            try await campaign.save(on: database)
            return id
        }

        let campaign = CampaignRow(name: name, rulesetId: rulesetId, isArchived: isArchived)
        try await campaign.create(on: database)
        guard let id = campaign.id else {
            throw Abort(.internalServerError, reason: "Failed to create campaign record.")
        }
        return id
    }

    static func renameCampaign(
        existingName: String,
        newName: String,
        rulesetId: String,
        on database: any Database
    ) async throws -> UUID {
        if let campaign = try await CampaignRow.query(on: database)
            .filter(\.$name == existingName)
            .first(),
           let id = campaign.id {
            campaign.name = newName
            campaign.rulesetId = rulesetId
            try await campaign.save(on: database)
            return id
        }

        return try await upsertCampaignMetadata(name: newName, rulesetId: rulesetId, on: database)
    }

    static func upsertCampaign(
        name: String,
        rulesetId: String,
        encounterState: EncounterState,
        roundIndex: Int,
        turnIndex: Int,
        currentTurnID: UUID?,
        on database: any Database
    ) async throws {
        let campaignID = try await upsertCampaignMetadata(name: name, rulesetId: rulesetId, on: database)
        try await upsertEncounter(
            campaignID: campaignID,
            encounterState: encounterState,
            roundIndex: roundIndex,
            turnIndex: turnIndex,
            currentTurnID: currentTurnID,
            on: database
        )
    }

    static func upsertEncounter(
        campaignID: UUID,
        encounterState: EncounterState,
        roundIndex: Int,
        turnIndex: Int,
        currentTurnID: UUID?,
        on database: any Database
    ) async throws {
        if let encounter = try await CampaignEncounterRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .first() {
            encounter.encounterState = encounterState.rawValue
            encounter.roundIndex = roundIndex
            encounter.turnIndex = turnIndex
            encounter.currentCharacterID = currentTurnID
            try await encounter.save(on: database)
            return
        }

        let encounter = CampaignEncounterRow(
            campaignID: campaignID,
            encounterState: encounterState,
            roundIndex: roundIndex,
            turnIndex: turnIndex,
            currentCharacterID: currentTurnID
        )
        try await encounter.create(on: database)
    }

    static func loadCharacters(
        campaignID: UUID,
        campaignName: String,
        on database: any Database
    ) async throws -> [CharacterState] {
        let rows = try await CharacterRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .all()

        let ids = rows.compactMap { $0.id }
        let stats = try await CharacterStatRow.query(on: database)
            .filter(\.$characterID ~~ ids)
            .all()
        let conditions = try await CharacterConditionRow.query(on: database)
            .filter(\.$characterID ~~ ids)
            .all()

        let statsByCharacter = Dictionary(grouping: stats) { $0.characterID }
        let conditionsByCharacter = Dictionary(grouping: conditions) { $0.characterID }

        return rows.compactMap { row in
            guard let id = row.id else { return nil }
            let characterStats = Dictionary(uniqueKeysWithValues: (statsByCharacter[id] ?? []).map {
                ($0.statKey, StatEntry(key: $0.statKey, current: $0.currentValue, max: $0.maxValue))
            })
            let conditionSet = Set((conditionsByCharacter[id] ?? []).map(\.condition))
            return CharacterState(
                id: id,
                campaignName: campaignName,
                ownerId: row.ownerID,
                ownerName: row.ownerName,
                characterName: row.name,
                initiative: row.initiative,
                stats: characterStats,
                revealStats: row.revealStats,
                autoSkipTurn: row.autoSkipTurn,
                useAppInitiativeRoll: row.useAppInitiativeRoll,
                initiativeBonus: row.initiativeBonus,
                isHidden: row.isHidden,
                revealOnTurn: row.revealOnTurn,
                conditions: conditionSet
            )
        }
    }

    static func persistCharacter(
        _ state: CharacterState,
        campaignID: UUID,
        on database: any Database
    ) async throws {
        let characterID: UUID
        do {
            if let row = try await CharacterRow.query(on: database)
                .filter(\.$id == state.id)
                .first() {
                row.campaignID = campaignID
                row.ownerID = state.ownerId
                row.ownerName = state.ownerName
                row.name = state.characterName
                row.initiative = state.initiative
                row.revealStats = state.revealStats
                row.autoSkipTurn = state.autoSkipTurn
                row.useAppInitiativeRoll = state.useAppInitiativeRoll
                row.initiativeBonus = state.initiativeBonus
                row.isHidden = state.isHidden
                row.revealOnTurn = state.revealOnTurn
                try await row.save(on: database)
                guard let id = row.id else {
                    throw Abort(.internalServerError, reason: "Failed to resolve character record identifier.")
                }
                characterID = id
            } else {
                let row = CharacterRow(
                    id: state.id,
                    campaignID: campaignID,
                    ownerID: state.ownerId,
                    ownerName: state.ownerName,
                    name: state.characterName,
                    initiative: state.initiative,
                    revealStats: state.revealStats,
                    autoSkipTurn: state.autoSkipTurn,
                    useAppInitiativeRoll: state.useAppInitiativeRoll,
                    initiativeBonus: state.initiativeBonus,
                    isHidden: state.isHidden,
                    revealOnTurn: state.revealOnTurn
                )
                try await row.create(on: database)
                guard let id = row.id else {
                    throw Abort(.internalServerError, reason: "Failed to resolve created character record identifier.")
                }
                characterID = id
            }
        } catch {
            print("Character row persistence failed for campaignID=\(campaignID):", error)
            throw error
        }

        do {
            try await CharacterStatRow.query(on: database)
                .filter(\.$characterID == characterID)
                .delete()
            for stat in state.stats.values {
                let row = CharacterStatRow(
                    characterID: characterID,
                    statKey: stat.key,
                    currentValue: stat.current,
                    maxValue: stat.max
                )
                try await row.create(on: database)
            }
        } catch {
            print("Character stat persistence failed for characterID=\(characterID):", error)
            throw error
        }

        do {
            try await CharacterConditionRow.query(on: database)
                .filter(\.$characterID == characterID)
                .delete()
            for condition in state.conditions {
                let row = CharacterConditionRow(characterID: characterID, condition: condition)
                try await row.create(on: database)
            }
        } catch {
            print("Character condition persistence failed for characterID=\(characterID):", error)
            throw error
        }
    }

    static func deleteCharacter(id: UUID, on database: any Database) async throws {
        try await CharacterStatRow.query(on: database).filter(\.$characterID == id).delete()
        try await CharacterConditionRow.query(on: database).filter(\.$characterID == id).delete()
        try await CharacterRow.query(on: database).filter(\.$id == id).delete()
    }

    static func deleteCampaignCharacters(named campaignName: String, on database: any Database) async throws {
        guard let campaign = try await CampaignRow.query(on: database)
            .filter(\.$name == campaignName)
            .first(),
              let campaignID = campaign.id else {
            return
        }
        try await deleteCampaignCharacters(campaignID: campaignID, on: database)
    }

    static func deleteCampaignCharacters(campaignID: UUID, on database: any Database) async throws {
        let characters = try await CharacterRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .all()
        let ids = characters.compactMap(\.id)
        if !ids.isEmpty {
            try await CharacterStatRow.query(on: database).filter(\.$characterID ~~ ids).delete()
            try await CharacterConditionRow.query(on: database).filter(\.$characterID ~~ ids).delete()
        }
        try await CharacterRow.query(on: database).filter(\.$campaignID == campaignID).delete()
    }
}
