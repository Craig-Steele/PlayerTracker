import CryptoKit
import Fluent
import Vapor

struct CampaignPersistenceState {
    let id: UUID
    let name: String
    let rulesetId: String
    let encounterState: EncounterState
    let roundIndex: Int
    let turnIndex: Int
    let currentTurnID: UUID?
}

struct UserPersistenceState {
    let id: UUID
    let email: String
    let passwordHash: String
    let displayName: String?
}

struct SessionPersistenceState {
    let id: UUID
    let userID: UUID
    let expiresAt: Date
    let revokedAt: Date?
}

struct PlayerSessionPersistenceState {
    let id: UUID
    let campaignID: UUID
    let displayName: String
    let previousDisplayNames: [String]
    let token: String
    let expiresAt: Date
}

final class UserRow: Model, @unchecked Sendable {
    static let schema = "users"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "email")
    var email: String

    @Field(key: "password_hash")
    var passwordHash: String

    @OptionalField(key: "display_name")
    var displayName: String?

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        email: String,
        passwordHash: String,
        displayName: String? = nil
    ) {
        self.id = id
        self.email = email
        self.passwordHash = passwordHash
        self.displayName = displayName
    }
}

final class SessionRow: Model, @unchecked Sendable {
    static let schema = "sessions"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "user_id")
    var userID: UUID

    @Field(key: "token_hash")
    var tokenHash: String

    @Field(key: "expires_at")
    var expiresAt: Date

    @OptionalField(key: "revoked_at")
    var revokedAt: Date?

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        userID: UUID,
        tokenHash: String,
        expiresAt: Date,
        revokedAt: Date? = nil
    ) {
        self.id = id
        self.userID = userID
        self.tokenHash = tokenHash
        self.expiresAt = expiresAt
        self.revokedAt = revokedAt
    }
}

final class PlayerSessionRow: Model, @unchecked Sendable {
    static let schema = "campaign_player_sessions"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "campaign_id")
    var campaignID: UUID

    @Field(key: "display_name")
    var displayName: String

    @Field(key: "display_name_normalized")
    var displayNameNormalized: String

    @OptionalField(key: "previous_display_names_json")
    var previousDisplayNamesJSON: String?

    @Field(key: "token_hash")
    var tokenHash: String

    @Field(key: "expires_at")
    var expiresAt: Date

    @OptionalField(key: "revoked_at")
    var revokedAt: Date?

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        campaignID: UUID,
        displayName: String,
        displayNameNormalized: String,
        previousDisplayNamesJSON: String? = nil,
        tokenHash: String,
        expiresAt: Date,
        revokedAt: Date? = nil
    ) {
        self.id = id
        self.campaignID = campaignID
        self.displayName = displayName
        self.displayNameNormalized = displayNameNormalized
        self.previousDisplayNamesJSON = previousDisplayNamesJSON
        self.tokenHash = tokenHash
        self.expiresAt = expiresAt
        self.revokedAt = revokedAt
    }
}

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
    private static func randomSessionToken() -> String {
        let parts = [UUID().uuidString, UUID().uuidString, UUID().uuidString]
        return parts
            .joined()
            .replacingOccurrences(of: "-", with: "")
    }

    private static func hashSessionToken(_ token: String) -> String {
        let digest = SHA256.hash(data: Data(token.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    private static func normalizedDisplayName(_ displayName: String) -> String {
        displayName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private static func decodePreviousDisplayNames(_ json: String?) -> [String] {
        guard let json,
              let data = json.data(using: .utf8),
              let names = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return names
    }

    private static func encodePreviousDisplayNames(_ names: [String]) throws -> String? {
        let normalized = names
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !normalized.isEmpty else { return nil }
        let unique = Array(Set(normalized)).sorted { lhs, rhs in
            lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
        }
        let data = try JSONEncoder().encode(unique)
        return String(decoding: data, as: UTF8.self)
    }

    static func loadUser(
        email: String,
        on database: any Database
    ) async throws -> UserPersistenceState? {
        guard let row = try await UserRow.query(on: database)
            .filter(\.$email == email)
            .first(),
              let id = row.id else {
            return nil
        }

        return UserPersistenceState(
            id: id,
            email: row.email,
            passwordHash: row.passwordHash,
            displayName: row.displayName
        )
    }

    static func loadUser(id userID: UUID, on database: any Database) async throws -> UserPersistenceState? {
        guard let row = try await UserRow.query(on: database)
            .filter(\.$id == userID)
            .first(),
              let id = row.id else {
            return nil
        }

        return UserPersistenceState(
            id: id,
            email: row.email,
            passwordHash: row.passwordHash,
            displayName: row.displayName
        )
    }

    static func createUser(
        email: String,
        passwordHash: String,
        displayName: String? = nil,
        on database: any Database
    ) async throws -> UUID {
        let trimmedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedEmail.isEmpty else {
            throw Abort(.badRequest, reason: "Email is required.")
        }
        if let existing = try await UserRow.query(on: database)
            .filter(\.$email == trimmedEmail)
            .first(),
           existing.id != nil {
            throw Abort(.conflict, reason: "User already exists.")
        }

        let row = UserRow(email: trimmedEmail, passwordHash: passwordHash, displayName: displayName)
        try await row.create(on: database)
        guard let id = row.id else {
            throw Abort(.internalServerError, reason: "Failed to create user record.")
        }
        return id
    }

    static func createSession(
        userID: UUID,
        expiresAt: Date = Date().addingTimeInterval(60 * 60 * 24 * 30),
        on database: any Database
    ) async throws -> String {
        let token = randomSessionToken()
        let row = SessionRow(
            userID: userID,
            tokenHash: hashSessionToken(token),
            expiresAt: expiresAt
        )
        try await row.create(on: database)
        return token
    }

    static func loadSession(
        token: String,
        on database: any Database
    ) async throws -> SessionPersistenceState? {
        let tokenHash = hashSessionToken(token)
        guard let row = try await SessionRow.query(on: database)
            .filter(\.$tokenHash == tokenHash)
            .filter(\.$revokedAt == nil)
            .filter(\.$expiresAt > Date())
            .first(),
              let id = row.id else {
            return nil
        }

        return SessionPersistenceState(
            id: id,
            userID: row.userID,
            expiresAt: row.expiresAt,
            revokedAt: row.revokedAt
        )
    }

    static func revokeSession(
        token: String,
        on database: any Database
    ) async throws {
        let tokenHash = hashSessionToken(token)
        guard let row = try await SessionRow.query(on: database)
            .filter(\.$tokenHash == tokenHash)
            .first() else {
            return
        }
        row.revokedAt = Date()
        try await row.save(on: database)
    }

    static func sessionUser(
        token: String,
        on database: any Database
    ) async throws -> UserPersistenceState? {
        guard let session = try await loadSession(token: token, on: database) else {
            return nil
        }
        return try await loadUser(id: session.userID, on: database)
    }

    static func loadPlayerSessions(
        campaignID: UUID,
        on database: any Database
    ) async throws -> [PlayerSessionPersistenceState] {
        let rows = try await PlayerSessionRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .all()

        return rows.compactMap { row in
            guard let id = row.id else { return nil }
            return PlayerSessionPersistenceState(
                id: id,
                campaignID: row.campaignID,
                displayName: row.displayName,
                previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
                token: "",
                expiresAt: row.expiresAt
            )
        }
    }

    static func loadPlayerSession(
        campaignID: UUID,
        displayName: String,
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState? {
        let normalized = normalizedDisplayName(displayName)
        let sessions = try await loadPlayerSessions(campaignID: campaignID, on: database)
        return sessions.first(where: { session in
            normalizedDisplayName(session.displayName) == normalized ||
            session.previousDisplayNames.contains(where: { normalizedDisplayName($0) == normalized })
        })
    }

    static func renamePlayerSession(
        token: String,
        to displayName: String,
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState? {
        let trimmedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDisplayName.isEmpty else {
            throw Abort(.badRequest, reason: "Display name is required.")
        }
        let tokenHash = hashSessionToken(token)
        guard let row = try await PlayerSessionRow.query(on: database)
            .filter(\.$tokenHash == tokenHash)
            .filter(\.$revokedAt == nil)
            .filter(\.$expiresAt > Date())
            .first(),
              let id = row.id else {
            return nil
        }

        var previous = decodePreviousDisplayNames(row.previousDisplayNamesJSON)
        if row.displayName.caseInsensitiveCompare(trimmedDisplayName) != .orderedSame {
            previous.append(row.displayName)
        }
        row.displayName = trimmedDisplayName
        row.displayNameNormalized = normalizedDisplayName(trimmedDisplayName)
        row.previousDisplayNamesJSON = try encodePreviousDisplayNames(previous)
        try await row.save(on: database)
        return PlayerSessionPersistenceState(
            id: id,
            campaignID: row.campaignID,
            displayName: row.displayName,
            previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
            token: token,
            expiresAt: row.expiresAt
        )
    }

    static func createOrRefreshPlayerSession(
        campaignID: UUID,
        displayName: String,
        expiresAt: Date = Date().addingTimeInterval(60 * 60 * 24 * 30),
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState {
        let trimmedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDisplayName.isEmpty else {
            throw Abort(.badRequest, reason: "Display name is required.")
        }

        let normalized = normalizedDisplayName(trimmedDisplayName)
        if let row = try await PlayerSessionRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .all()
            .first(where: { row in
                row.displayNameNormalized == normalized ||
                decodePreviousDisplayNames(row.previousDisplayNamesJSON).contains(where: { normalizedDisplayName($0) == normalized })
            }) {
            let token = randomSessionToken()
            row.tokenHash = hashSessionToken(token)
            row.expiresAt = expiresAt
            row.revokedAt = nil
            try await row.save(on: database)
            guard let id = row.id else {
                throw Abort(.internalServerError, reason: "Failed to load player session record.")
            }
            return PlayerSessionPersistenceState(
                id: id,
                campaignID: row.campaignID,
                displayName: row.displayName,
                previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
                token: token,
                expiresAt: row.expiresAt
            )
        }

        let token = randomSessionToken()
        let tokenHash = hashSessionToken(token)

        let row = PlayerSessionRow(
            campaignID: campaignID,
            displayName: trimmedDisplayName,
            displayNameNormalized: normalized,
            previousDisplayNamesJSON: nil,
            tokenHash: tokenHash,
            expiresAt: expiresAt
        )
        try await row.create(on: database)
        guard let id = row.id else {
            throw Abort(.internalServerError, reason: "Failed to create player session record.")
        }
        return PlayerSessionPersistenceState(
            id: id,
            campaignID: row.campaignID,
            displayName: row.displayName,
            previousDisplayNames: [],
            token: token,
            expiresAt: row.expiresAt
        )
    }

    static func loadPlayerSession(
        token: String,
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState? {
        let tokenHash = hashSessionToken(token)
        guard let row = try await PlayerSessionRow.query(on: database)
            .filter(\.$tokenHash == tokenHash)
            .filter(\.$revokedAt == nil)
            .filter(\.$expiresAt > Date())
            .first(),
              let id = row.id else {
            return nil
        }

        return PlayerSessionPersistenceState(
            id: id,
            campaignID: row.campaignID,
            displayName: row.displayName,
            previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
            token: token,
            expiresAt: row.expiresAt
        )
    }

    static func revokePlayerSession(
        token: String,
        on database: any Database
    ) async throws {
        let tokenHash = hashSessionToken(token)
        guard let row = try await PlayerSessionRow.query(on: database)
            .filter(\.$tokenHash == tokenHash)
            .first() else {
            return
        }
        row.revokedAt = Date()
        try await row.save(on: database)
    }

    static func loadCampaign(
        named campaignName: String,
        on database: any Database
    ) async throws -> CampaignPersistenceState? {
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
        return CampaignPersistenceState(
            id: campaignID,
            name: campaign.name,
            rulesetId: campaign.rulesetId,
            encounterState: encounterState,
            roundIndex: roundIndex,
            turnIndex: turnIndex,
            currentTurnID: currentTurnID
        )
    }

    static func loadCampaign(
        id campaignID: UUID,
        on database: any Database
    ) async throws -> CampaignPersistenceState? {
        guard let campaign = try await CampaignRow.query(on: database)
            .filter(\.$id == campaignID)
            .first(),
              let resolvedID = campaign.id else {
            return nil
        }

        let encounter = try await CampaignEncounterRow.query(on: database)
            .filter(\.$campaignID == resolvedID)
            .first()

        let encounterState = encounter.flatMap { EncounterState(rawValue: $0.encounterState) } ?? .new
        let roundIndex = encounter?.roundIndex ?? 1
        let turnIndex = encounter?.turnIndex ?? 0
        let currentTurnID = encounter?.currentCharacterID
        return CampaignPersistenceState(
            id: resolvedID,
            name: campaign.name,
            rulesetId: campaign.rulesetId,
            encounterState: encounterState,
            roundIndex: roundIndex,
            turnIndex: turnIndex,
            currentTurnID: currentTurnID
        )
    }

    static func loadCampaigns(on database: any Database) async throws -> [CampaignPersistenceState] {
        let campaigns = try await CampaignRow.query(on: database).all()
        let encounters = try await CampaignEncounterRow.query(on: database).all()
        let encountersByCampaign = Dictionary(grouping: encounters) { $0.campaignID }

        return campaigns.compactMap { campaign in
            guard let campaignID = campaign.id else { return nil }
            let encounter = encountersByCampaign[campaignID]?.first
            let encounterState = encounter.flatMap { EncounterState(rawValue: $0.encounterState) } ?? .new
            let roundIndex = encounter?.roundIndex ?? 1
            let turnIndex = encounter?.turnIndex ?? 0
            let currentTurnID = encounter?.currentCharacterID
            return CampaignPersistenceState(
                id: campaignID,
                name: campaign.name,
                rulesetId: campaign.rulesetId,
                encounterState: encounterState,
                roundIndex: roundIndex,
                turnIndex: turnIndex,
                currentTurnID: currentTurnID
            )
        }
        .sorted { lhs, rhs in
            lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
        }
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

    static func createCampaignMetadata(
        name: String,
        rulesetId: String,
        isArchived: Bool = false,
        on database: any Database
    ) async throws -> UUID {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw Abort(.badRequest, reason: "Campaign name is required.")
        }
        if let existing = try await CampaignRow.query(on: database)
            .filter(\.$name == trimmedName)
            .first(),
           existing.id != nil {
            throw Abort(.conflict, reason: "Campaign name already exists.")
        }
        let library = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        let campaign = CampaignRow(name: trimmedName, rulesetId: library.id, isArchived: isArchived)
        try await campaign.create(on: database)
        guard let id = campaign.id else {
            throw Abort(.internalServerError, reason: "Failed to create campaign record.")
        }
        return id
    }

    static func updateCampaignMetadata(
        id campaignID: UUID,
        name: String,
        rulesetId: String,
        on database: any Database
    ) async throws -> UUID {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw Abort(.badRequest, reason: "Campaign name is required.")
        }

        guard let campaign = try await CampaignRow.query(on: database)
            .filter(\.$id == campaignID)
            .first() else {
            throw Abort(.notFound, reason: "Campaign not found.")
        }

        if let duplicate = try await CampaignRow.query(on: database)
            .filter(\.$name == trimmedName)
            .first(),
           duplicate.id != campaignID {
            throw Abort(.conflict, reason: "Campaign name already exists.")
        }

        let library = try RuleSetLibraryLoader.loadLibrary(id: rulesetId)
        campaign.name = trimmedName
        campaign.rulesetId = library.id
        try await campaign.save(on: database)
        return campaignID
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
