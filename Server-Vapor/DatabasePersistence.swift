import CryptoKit
import Fluent
import Vapor

struct CampaignPersistenceState {
    let id: UUID
    let name: String
    let rulesetId: String
    let encounterState: EncounterState
    let claimTimeoutMinutes: Int
    let isInviteOnly: Bool
    let userdataFiles: [String]
    let partyTreasure: [InventoryEntry]
    let roundIndex: Int
    let turnIndex: Int
    let currentTurnID: UUID?
}

struct UserPersistenceState {
    let id: UUID
    let email: String
    let passwordHash: String
}

struct SessionPersistenceState {
    let id: UUID
    let userID: UUID
    let expiresAt: Date
    let revokedAt: Date?
}

struct PlayerSessionPersistenceState {
    let id: UUID
    let loginName: String
    let displayName: String
    let previousDisplayNames: [String]
    let token: String
    let expiresAt: Date
}

struct CampaignInvitePersistenceState {
    let id: UUID
    let campaignID: UUID
    let createdByUserID: UUID
    let invitedPlayerName: String?
    let acceptedPlayerID: UUID?
    let acceptedAt: Date?
}

final class UserRow: Model, @unchecked Sendable {
    static let schema = "users"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "email")
    var email: String

    @Field(key: "password_hash")
    var passwordHash: String

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        email: String,
        passwordHash: String
    ) {
        self.id = id
        self.email = email
        self.passwordHash = passwordHash
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
    static let schema = "players"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "login_name")
    var loginName: String

    @Field(key: "login_name_normalized")
    var loginNameNormalized: String

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
        loginName: String,
        loginNameNormalized: String,
        displayName: String,
        displayNameNormalized: String,
        previousDisplayNamesJSON: String? = nil,
        tokenHash: String,
        expiresAt: Date,
        revokedAt: Date? = nil
    ) {
        self.id = id
        self.loginName = loginName
        self.loginNameNormalized = loginNameNormalized
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

    @OptionalField(key: "claim_timeout_minutes")
    var claimTimeoutMinutes: Int?

    @Field(key: "is_invite_only")
    var isInviteOnly: Bool

    @OptionalField(key: "userdata_files_json")
    var userdataFilesJSON: String?

    @OptionalField(key: "party_treasure_json")
    var partyTreasureJSON: String?

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        name: String,
        rulesetId: String,
        isArchived: Bool = false,
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool = false,
        userdataFilesJSON: String? = nil,
        partyTreasureJSON: String? = nil
    ) {
        self.id = id
        self.name = name
        self.rulesetId = rulesetId
        self.isArchived = isArchived
        self.claimTimeoutMinutes = claimTimeoutMinutes
        self.isInviteOnly = isInviteOnly
        self.userdataFilesJSON = userdataFilesJSON
        self.partyTreasureJSON = partyTreasureJSON
    }
}

final class CampaignMembershipRow: Model, @unchecked Sendable {
    static let schema = "campaign_memberships"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "campaign_id")
    var campaignID: UUID

    @Field(key: "user_id")
    var userID: UUID

    @Field(key: "role")
    var role: String

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        campaignID: UUID,
        userID: UUID,
        role: String
    ) {
        self.id = id
        self.campaignID = campaignID
        self.userID = userID
        self.role = role
    }
}

final class CampaignInviteRow: Model, @unchecked Sendable {
    static let schema = "campaign_invites"

    @ID(key: .id)
    var id: UUID?

    @Field(key: "campaign_id")
    var campaignID: UUID

    @Field(key: "created_by_user_id")
    var createdByUserID: UUID

    @Field(key: "token_hash")
    var tokenHash: String

    @OptionalField(key: "invited_player_name")
    var invitedPlayerName: String?

    @OptionalField(key: "accepted_player_id")
    var acceptedPlayerID: UUID?

    @OptionalField(key: "accepted_at")
    var acceptedAt: Date?

    @OptionalField(key: "created_at")
    var createdAt: Date?

    @OptionalField(key: "updated_at")
    var updatedAt: Date?

    init() {}

    init(
        id: UUID? = nil,
        campaignID: UUID,
        createdByUserID: UUID,
        tokenHash: String,
        invitedPlayerName: String? = nil,
        acceptedPlayerID: UUID? = nil,
        acceptedAt: Date? = nil
    ) {
        self.id = id
        self.campaignID = campaignID
        self.createdByUserID = createdByUserID
        self.tokenHash = tokenHash
        self.invitedPlayerName = invitedPlayerName
        self.acceptedPlayerID = acceptedPlayerID
        self.acceptedAt = acceptedAt
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

    @OptionalField(key: "reference_url")
    var referenceUrl: String?

    @Field(key: "is_claimable")
    var isClaimable: Bool

    @OptionalField(key: "stat_block_id")
    var statBlockId: String?

    @OptionalField(key: "currency_json")
    var currencyJSON: String?

    @OptionalField(key: "inventory_json")
    var inventoryJSON: String?

    @OptionalField(key: "last_played_by_name")
    var lastPlayedByName: String?

    @OptionalField(key: "claimed_session_id")
    var claimedSessionID: UUID?

    @OptionalField(key: "claimed_display_name")
    var claimedDisplayName: String?

    @OptionalField(key: "claimed_at")
    var claimedAt: Date?

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
        referenceUrl: String? = nil,
        isClaimable: Bool = false,
        statBlockId: String? = nil,
        currencyJSON: String? = nil,
        inventoryJSON: String? = nil,
        lastPlayedByName: String? = nil,
        claimedSessionID: UUID? = nil,
        claimedDisplayName: String? = nil,
        claimedAt: Date? = nil,
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
        self.referenceUrl = referenceUrl
        self.isClaimable = isClaimable
        self.statBlockId = statBlockId
        self.currencyJSON = currencyJSON
        self.inventoryJSON = inventoryJSON
        self.lastPlayedByName = lastPlayedByName
        self.claimedSessionID = claimedSessionID
        self.claimedDisplayName = claimedDisplayName
        self.claimedAt = claimedAt
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
    private static let defaultClaimTimeoutMinutes = 5

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

    private static func hashInviteToken(_ token: String) -> String {
        hashSessionToken(token)
    }

    private static func normalizedDisplayName(_ displayName: String) -> String {
        displayName
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private static func sanitizeDisplayName(_ displayName: String) -> String {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Player" : trimmed
    }

    private static func resolvedClaimTimeoutMinutes(_ campaign: CampaignRow) -> Int {
        max(-1, campaign.claimTimeoutMinutes ?? defaultClaimTimeoutMinutes)
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

    private static func decodeUserDataFiles(_ json: String?) -> [String] {
        guard let json,
              let data = json.data(using: .utf8),
              let files = try? JSONDecoder().decode([String].self, from: data) else {
            return []
        }
        return normalizeUserDataFiles(files)
    }

    private static func encodeUserDataFiles(_ files: [String]) throws -> String? {
        let normalized = normalizeUserDataFiles(files)
        guard !normalized.isEmpty else { return nil }
        let data = try JSONEncoder().encode(normalized)
        return String(decoding: data, as: UTF8.self)
    }

    private static func decodeCurrencyAmounts(_ json: String?) -> [CurrencyAmount] {
        guard let json,
              let data = json.data(using: .utf8),
              let amounts = try? JSONDecoder().decode([CurrencyAmount].self, from: data) else {
            return []
        }
        return amounts.filter { !$0.unitId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private static func decodeInventoryEntries(_ json: String?) -> [InventoryEntry] {
        guard let json,
              let data = json.data(using: .utf8),
              let entries = try? JSONDecoder().decode([InventoryEntry].self, from: data) else {
            return []
        }
        return entries.filter { !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    private static func encodeCurrencyAmounts(_ amounts: [CurrencyAmount]) throws -> String? {
        var normalized: [CurrencyAmount] = []
        var seenUnitIDs = Set<String>()
        for amount in amounts {
            let unitId = amount.unitId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !unitId.isEmpty, seenUnitIDs.insert(unitId).inserted else {
                continue
            }
            normalized.append(CurrencyAmount(unitId: unitId, amount: amount.amount))
        }
        guard !normalized.isEmpty else { return nil }
        let data = try JSONEncoder().encode(normalized)
        return String(decoding: data, as: UTF8.self)
    }

    private static func encodeInventoryEntries(_ entries: [InventoryEntry]) throws -> String? {
        var normalized: [InventoryEntry] = []
        for entry in entries {
            let name = entry.name.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { continue }
            let quantity = max(1, entry.quantity)
            normalized.append(
                InventoryEntry(
                    id: entry.id,
                    name: name,
                    quantity: quantity,
                    value: entry.value,
                    weight: entry.weight,
                    url: {
                        guard let raw = entry.url?.trimmingCharacters(in: .whitespacesAndNewlines) else {
                            return nil
                        }
                        return raw.isEmpty ? nil : raw
                    }(),
                    containerId: entry.containerId,
                    isContainer: entry.isContainer
                )
            )
        }
        guard !normalized.isEmpty else { return nil }
        let data = try JSONEncoder().encode(normalized)
        return String(decoding: data, as: UTF8.self)
    }

    private static func normalizeUserDataFiles(_ files: [String]) -> [String] {
        let normalized = files
            .compactMap { file -> String? in
                let trimmed = file.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { return nil }
                return URL(fileURLWithPath: trimmed).lastPathComponent
            }
        return Array(Set(normalized)).sorted { lhs, rhs in
            lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
        }
    }

    static func updateCampaignUserDataFiles(
        campaignID: UUID,
        files: [String],
        on database: any Database
    ) async throws {
        guard let campaign = try await CampaignRow.query(on: database)
            .filter(\.$id == campaignID)
            .first() else {
            throw Abort(.notFound, reason: "Campaign not found.")
        }
        campaign.userdataFilesJSON = try encodeUserDataFiles(files)
        try await campaign.save(on: database)
    }

    static func updateCampaignPartyTreasure(
        campaignID: UUID,
        items: [InventoryEntry],
        on database: any Database
    ) async throws {
        guard let campaign = try await CampaignRow.query(on: database)
            .filter(\.$id == campaignID)
            .first() else {
            throw Abort(.notFound, reason: "Campaign not found.")
        }
        campaign.partyTreasureJSON = try encodeInventoryEntries(items)
        try await campaign.save(on: database)
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
            passwordHash: row.passwordHash
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
            passwordHash: row.passwordHash
        )
    }

    static func createUser(
        email: String,
        passwordHash: String,
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

        let row = UserRow(email: trimmedEmail, passwordHash: passwordHash)
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

    static func loadPlayerSessions(on database: any Database) async throws -> [PlayerSessionPersistenceState] {
        let rows = try await PlayerSessionRow.query(on: database).all()

        return rows.compactMap { row in
            guard let id = row.id else { return nil }
            return PlayerSessionPersistenceState(
                id: id,
                loginName: row.loginName,
                displayName: row.displayName,
                previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
                token: "",
                expiresAt: row.expiresAt
            )
        }
    }

    static func loadPlayers(
        ids: [UUID],
        on database: any Database
    ) async throws -> [PlayerSessionPersistenceState] {
        guard !ids.isEmpty else { return [] }
        let rows = try await PlayerSessionRow.query(on: database)
            .filter(\.$id ~~ ids)
            .all()

        return rows.compactMap { row in
            guard let id = row.id else { return nil }
            return PlayerSessionPersistenceState(
                id: id,
                loginName: row.loginName,
                displayName: row.displayName,
                previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
                token: "",
                expiresAt: row.expiresAt
            )
        }
    }

    static func loadCampaignRefereeSessionIDs(
        campaignID: UUID,
        on database: any Database
    ) async throws -> Set<UUID> {
        let rows = try await CampaignMembershipRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .filter(\.$role == "referee")
            .all()
        return Set(rows.compactMap(\.userID))
    }

    static func loadCampaignIDs(
        for playerID: UUID,
        on database: any Database
    ) async throws -> Set<UUID> {
        let rows = try await CampaignMembershipRow.query(on: database)
            .filter(\.$userID == playerID)
            .all()
        return Set(rows.compactMap(\.campaignID))
    }

    static func isCampaignMember(
        campaignID: UUID,
        playerID: UUID,
        on database: any Database
    ) async throws -> Bool {
        try await CampaignMembershipRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .filter(\.$userID == playerID)
            .first() != nil
    }

    static func setCampaignRefereeSessionIDs(
        campaignID: UUID,
        refereeSessionIDs: [UUID],
        on database: any Database
    ) async throws {
        let existingRows = try await CampaignMembershipRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .all()
        let selectedIDs = Set(refereeSessionIDs)
        let existingIDs = Set(existingRows.compactMap(\.userID))
        for row in existingRows {
            row.role = selectedIDs.contains(row.userID) ? "referee" : "player"
            try await row.save(on: database)
        }
        for refereeID in selectedIDs where !existingIDs.contains(refereeID) {
            let row = CampaignMembershipRow(
                campaignID: campaignID,
                userID: refereeID,
                role: "referee"
            )
            try await row.create(on: database)
        }
    }

    static func loadCampaignMembers(
        campaignID: UUID,
        on database: any Database
    ) async throws -> [CampaignMemberSummary] {
        let memberships = try await CampaignMembershipRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .all()
        let playerIDs = memberships.compactMap(\.userID)
        let players = try await loadPlayers(ids: playerIDs, on: database)
        let playersByID = Dictionary(uniqueKeysWithValues: players.map { ($0.id, $0) })

        return memberships.compactMap { membership in
            guard let player = playersByID[membership.userID] else { return nil }
            return CampaignMemberSummary(
                id: player.id,
                displayName: player.displayName,
                isReferee: membership.role == "referee"
            )
        }
        .sorted {
            $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending
        }
    }

    static func ensureCampaignMember(
        campaignID: UUID,
        playerID: UUID,
        role: String = "player",
        on database: any Database
    ) async throws {
        if let row = try await CampaignMembershipRow.query(on: database)
            .filter(\.$campaignID == campaignID)
            .filter(\.$userID == playerID)
            .first() {
            if row.role != "referee" || role == "referee" {
                row.role = role
                try await row.save(on: database)
            }
            return
        }

        let row = CampaignMembershipRow(
            campaignID: campaignID,
            userID: playerID,
            role: role
        )
        try await row.create(on: database)
    }

    static func ensureCampaignMember(
        campaignID: UUID,
        playerName: String,
        role: String = "player",
        on database: any Database
    ) async throws -> CampaignMemberSummary {
        let player = try await ensurePlayerIdentity(named: playerName, on: database)
        try await ensureCampaignMember(
            campaignID: campaignID,
            playerID: player.id,
            role: role,
            on: database
        )
        return CampaignMemberSummary(
            id: player.id,
            displayName: player.displayName,
            isReferee: role == "referee"
        )
    }

    static func createCampaignInvite(
        campaignID: UUID,
        createdByUserID: UUID,
        invitedPlayerName: String? = nil,
        on database: any Database
    ) async throws -> String {
        let token = randomSessionToken()
        let row = CampaignInviteRow(
            campaignID: campaignID,
            createdByUserID: createdByUserID,
            tokenHash: hashInviteToken(token),
            invitedPlayerName: {
                guard let invitedPlayerName = invitedPlayerName?.trimmingCharacters(in: .whitespacesAndNewlines),
                      !invitedPlayerName.isEmpty else {
                    return nil
                }
                return invitedPlayerName
            }()
        )
        try await row.create(on: database)
        return token
    }

    static func acceptCampaignInvite(
        token: String,
        playerID: UUID,
        playerLoginName: String,
        playerDisplayName: String,
        on database: any Database
    ) async throws -> UUID? {
        let tokenHash = hashInviteToken(token)
        guard let row = try await CampaignInviteRow.query(on: database)
            .filter(\.$tokenHash == tokenHash)
            .first(),
              row.acceptedAt == nil else {
            return nil
        }

        if let invitedPlayerName = row.invitedPlayerName?.trimmingCharacters(in: .whitespacesAndNewlines),
           !invitedPlayerName.isEmpty {
            let normalizedInvited = normalizedDisplayName(invitedPlayerName)
            let normalizedLogin = normalizedDisplayName(playerLoginName)
            let normalizedDisplay = normalizedDisplayName(playerDisplayName)
            guard normalizedInvited == normalizedLogin || normalizedInvited == normalizedDisplay else {
                return nil
            }
        }

        let campaignID = row.campaignID
        try await ensureCampaignMember(
            campaignID: campaignID,
            playerID: playerID,
            role: "player",
            on: database
        )
        row.acceptedPlayerID = playerID
        row.acceptedAt = Date()
        try await row.save(on: database)
        return campaignID
    }

    static func loadPlayerSession(
        loginName: String,
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState? {
        let normalized = normalizedDisplayName(loginName)
        let sessions = try await loadPlayerSessions(on: database)
        return sessions.first(where: { session in
            normalizedDisplayName(session.loginName) == normalized
        })
    }

    static func loadPlayerSession(
        named playerName: String,
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState? {
        let normalized = normalizedDisplayName(playerName)
        guard !normalized.isEmpty else {
            return nil
        }

        let rows = try await PlayerSessionRow.query(on: database).all()
        guard let row = rows.first(where: { row in
            row.loginNameNormalized == normalized
                || row.displayNameNormalized == normalized
                || decodePreviousDisplayNames(row.previousDisplayNamesJSON).contains(where: {
                    normalizedDisplayName($0) == normalized
                })
        }),
        let id = row.id else {
            return nil
        }

        return PlayerSessionPersistenceState(
            id: id,
            loginName: row.loginName,
            displayName: row.displayName,
            previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
            token: "",
            expiresAt: row.expiresAt
        )
    }

    static func ensurePlayerIdentity(
        named playerName: String,
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState {
        let trimmedName = sanitizeDisplayName(playerName)
        if let existing = try await loadPlayerSession(named: trimmedName, on: database) {
            return existing
        }

        let expiresAt = Date().addingTimeInterval(60 * 60 * 24 * 30)
        let token = randomSessionToken()
        let row = PlayerSessionRow(
            loginName: trimmedName,
            loginNameNormalized: normalizedDisplayName(trimmedName),
            displayName: trimmedName,
            displayNameNormalized: normalizedDisplayName(trimmedName),
            previousDisplayNamesJSON: nil,
            tokenHash: hashSessionToken(token),
            expiresAt: expiresAt
        )
        try await row.create(on: database)
        guard let id = row.id else {
            throw Abort(.internalServerError, reason: "Failed to create player identity.")
        }
        return PlayerSessionPersistenceState(
            id: id,
            loginName: row.loginName,
            displayName: row.displayName,
            previousDisplayNames: [],
            token: token,
            expiresAt: row.expiresAt
        )
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
            loginName: row.loginName,
            displayName: row.displayName,
            previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
            token: token,
            expiresAt: row.expiresAt
        )
    }

    static func createOrRefreshPlayerSession(
        loginName: String,
        displayName: String? = nil,
        expiresAt: Date = Date().addingTimeInterval(60 * 60 * 24 * 30),
        on database: any Database
    ) async throws -> PlayerSessionPersistenceState {
        let trimmedLoginName = loginName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedLoginName.isEmpty else {
            throw Abort(.badRequest, reason: "Login name is required.")
        }
        let trimmedDisplayName = sanitizeDisplayName(displayName ?? trimmedLoginName)
        let loginNormalized = normalizedDisplayName(trimmedLoginName)

        if let row = try await PlayerSessionRow.query(on: database)
            .all()
            .first(where: { row in
                row.loginNameNormalized == loginNormalized
            }) {
            let token = randomSessionToken()
            row.tokenHash = hashSessionToken(token)
            row.expiresAt = expiresAt
            row.revokedAt = nil
            if row.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                row.displayName = trimmedDisplayName
                row.displayNameNormalized = normalizedDisplayName(trimmedDisplayName)
            }
            try await row.save(on: database)
            guard let id = row.id else {
                throw Abort(.internalServerError, reason: "Failed to load player session record.")
            }
            return PlayerSessionPersistenceState(
                id: id,
                loginName: row.loginName,
                displayName: row.displayName,
                previousDisplayNames: decodePreviousDisplayNames(row.previousDisplayNamesJSON),
                token: token,
                expiresAt: row.expiresAt
            )
        }

        let token = randomSessionToken()
        let tokenHash = hashSessionToken(token)

        let row = PlayerSessionRow(
            loginName: trimmedLoginName,
            loginNameNormalized: loginNormalized,
            displayName: trimmedDisplayName,
            displayNameNormalized: normalizedDisplayName(trimmedDisplayName),
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
            loginName: row.loginName,
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
            loginName: row.loginName,
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

    static func renamePlayerDisplayName(
        playerID: UUID,
        newDisplayName: String,
        on database: any Database
    ) async throws {
        let trimmedDisplayName = newDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedDisplayName.isEmpty else {
            throw Abort(.badRequest, reason: "Display name is required.")
        }

        let rows = try await CharacterRow.query(on: database)
            .filter(\.$ownerID == playerID)
            .all()
        for row in rows {
            row.ownerName = trimmedDisplayName
            if row.claimedSessionID == playerID {
                row.claimedDisplayName = trimmedDisplayName
                row.lastPlayedByName = trimmedDisplayName
            }
            try await row.save(on: database)
        }
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
        let claimTimeoutMinutes = resolvedClaimTimeoutMinutes(campaign)
        let userdataFiles = decodeUserDataFiles(campaign.userdataFilesJSON)
        let partyTreasure = decodeInventoryEntries(campaign.partyTreasureJSON)
        let roundIndex = encounter?.roundIndex ?? 1
        let turnIndex = encounter?.turnIndex ?? 0
        let currentTurnID = encounter?.currentCharacterID
        return CampaignPersistenceState(
            id: campaignID,
            name: campaign.name,
            rulesetId: campaign.rulesetId,
            encounterState: encounterState,
            claimTimeoutMinutes: claimTimeoutMinutes,
            isInviteOnly: campaign.isInviteOnly,
            userdataFiles: userdataFiles,
            partyTreasure: partyTreasure,
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
        let claimTimeoutMinutes = resolvedClaimTimeoutMinutes(campaign)
        let userdataFiles = decodeUserDataFiles(campaign.userdataFilesJSON)
        let partyTreasure = decodeInventoryEntries(campaign.partyTreasureJSON)
        let roundIndex = encounter?.roundIndex ?? 1
        let turnIndex = encounter?.turnIndex ?? 0
        let currentTurnID = encounter?.currentCharacterID
        return CampaignPersistenceState(
            id: resolvedID,
            name: campaign.name,
            rulesetId: campaign.rulesetId,
            encounterState: encounterState,
            claimTimeoutMinutes: claimTimeoutMinutes,
            isInviteOnly: campaign.isInviteOnly,
            userdataFiles: userdataFiles,
            partyTreasure: partyTreasure,
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
            let claimTimeoutMinutes = resolvedClaimTimeoutMinutes(campaign)
            let userdataFiles = decodeUserDataFiles(campaign.userdataFilesJSON)
            let partyTreasure = decodeInventoryEntries(campaign.partyTreasureJSON)
            let roundIndex = encounter?.roundIndex ?? 1
            let turnIndex = encounter?.turnIndex ?? 0
            let currentTurnID = encounter?.currentCharacterID
            return CampaignPersistenceState(
                id: campaignID,
                name: campaign.name,
                rulesetId: campaign.rulesetId,
                encounterState: encounterState,
                claimTimeoutMinutes: claimTimeoutMinutes,
                isInviteOnly: campaign.isInviteOnly,
                userdataFiles: userdataFiles,
                partyTreasure: partyTreasure,
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
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool = false,
        on database: any Database
    ) async throws -> UUID {
        if let campaign = try await CampaignRow.query(on: database)
            .filter(\.$name == name)
            .first(),
           let id = campaign.id {
            campaign.rulesetId = rulesetId
            campaign.isArchived = isArchived
            campaign.isInviteOnly = isInviteOnly
            if let claimTimeoutMinutes {
                campaign.claimTimeoutMinutes = max(-1, claimTimeoutMinutes)
            } else if campaign.claimTimeoutMinutes == nil {
                campaign.claimTimeoutMinutes = defaultClaimTimeoutMinutes
            }
            try await campaign.save(on: database)
            return id
        }

        let campaign = CampaignRow(
            name: name,
            rulesetId: rulesetId,
            isArchived: isArchived,
            claimTimeoutMinutes: max(-1, claimTimeoutMinutes ?? defaultClaimTimeoutMinutes),
            isInviteOnly: isInviteOnly,
            userdataFilesJSON: nil,
            partyTreasureJSON: nil
        )
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
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool = false,
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
        let campaign = CampaignRow(
            name: trimmedName,
            rulesetId: library.id,
            isArchived: isArchived,
            claimTimeoutMinutes: max(-1, claimTimeoutMinutes ?? defaultClaimTimeoutMinutes),
            isInviteOnly: isInviteOnly
        )
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
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool? = nil,
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
        if let isInviteOnly {
            campaign.isInviteOnly = isInviteOnly
        }
        if let claimTimeoutMinutes {
            campaign.claimTimeoutMinutes = max(-1, claimTimeoutMinutes)
        } else if campaign.claimTimeoutMinutes == nil {
            campaign.claimTimeoutMinutes = defaultClaimTimeoutMinutes
        }
        try await campaign.save(on: database)
        return campaignID
    }

    static func renameCampaign(
        existingName: String,
        newName: String,
        rulesetId: String,
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool? = nil,
        on database: any Database
    ) async throws -> UUID {
        if let campaign = try await CampaignRow.query(on: database)
            .filter(\.$name == existingName)
            .first(),
            let id = campaign.id {
            campaign.name = newName
            campaign.rulesetId = rulesetId
            if let isInviteOnly {
                campaign.isInviteOnly = isInviteOnly
            }
            if let claimTimeoutMinutes {
                campaign.claimTimeoutMinutes = max(-1, claimTimeoutMinutes)
            } else if campaign.claimTimeoutMinutes == nil {
                campaign.claimTimeoutMinutes = defaultClaimTimeoutMinutes
            }
            try await campaign.save(on: database)
            return id
        }

        return try await upsertCampaignMetadata(
            name: newName,
            rulesetId: rulesetId,
            claimTimeoutMinutes: claimTimeoutMinutes,
            isInviteOnly: isInviteOnly ?? false,
            on: database
        )
    }

    static func upsertCampaign(
        name: String,
        rulesetId: String,
        claimTimeoutMinutes: Int? = nil,
        isInviteOnly: Bool? = nil,
        encounterState: EncounterState,
        roundIndex: Int,
        turnIndex: Int,
        currentTurnID: UUID?,
        on database: any Database
    ) async throws {
        let campaignID = try await upsertCampaignMetadata(
            name: name,
            rulesetId: rulesetId,
            claimTimeoutMinutes: claimTimeoutMinutes,
            isInviteOnly: isInviteOnly ?? false,
            on: database
        )
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
            if let id = row.id {
                let characterStats = Dictionary(uniqueKeysWithValues: (statsByCharacter[id] ?? []).map {
                    ($0.statKey, StatEntry(key: $0.statKey, current: $0.currentValue, max: $0.maxValue))
                })
                let conditionSet = Set((conditionsByCharacter[id] ?? []).map(\.condition))
                return CharacterState(
                    id: id,
                    campaignName: campaignName,
                    ownerId: row.ownerID,
                    ownerName: row.ownerName,
                    referenceUrl: row.referenceUrl,
                    statBlockId: row.statBlockId,
                    lastPlayedByName: row.lastPlayedByName,
                    claimedSessionId: row.claimedSessionID,
                    claimedDisplayName: row.claimedDisplayName,
                    claimedAt: row.claimedAt,
                    isReferee: false,
                    isClaimable: row.isClaimable,
                    characterName: row.name,
                    initiative: row.initiative,
                    stats: characterStats,
                    currency: decodeCurrencyAmounts(row.currencyJSON),
                    inventory: decodeInventoryEntries(row.inventoryJSON),
                    revealStats: row.revealStats,
                    autoSkipTurn: row.autoSkipTurn,
                    useAppInitiativeRoll: row.useAppInitiativeRoll,
                    initiativeBonus: row.initiativeBonus,
                    isHidden: row.isHidden,
                    revealOnTurn: row.revealOnTurn,
                    conditions: conditionSet
                )
            } else {
                return nil
            }
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
                row.referenceUrl = state.referenceUrl
                row.isClaimable = state.isClaimable
                row.statBlockId = state.statBlockId
                row.currencyJSON = try encodeCurrencyAmounts(state.currency)
                row.inventoryJSON = try encodeInventoryEntries(state.inventory)
                row.lastPlayedByName = state.lastPlayedByName
                row.claimedSessionID = state.claimedSessionId
                row.claimedDisplayName = state.claimedDisplayName
                row.claimedAt = state.claimedAt
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
                    referenceUrl: state.referenceUrl,
                    isClaimable: state.isClaimable,
                    statBlockId: state.statBlockId,
                    currencyJSON: try encodeCurrencyAmounts(state.currency),
                    inventoryJSON: try encodeInventoryEntries(state.inventory),
                    lastPlayedByName: state.lastPlayedByName,
                    claimedSessionID: state.claimedSessionId,
                    claimedDisplayName: state.claimedDisplayName,
                    claimedAt: state.claimedAt,
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
