import Fluent
import Vapor
import SQLKit

struct CreateUsers: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users")
            .id()
            .field("email", .string, .required)
            .field("password_hash", .string, .required)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "email")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("users").delete()
    }
}

struct RemoveUserDisplayName: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(users)")
                .all(decoding: SQLiteTableInfoRow.self)
            guard columns.contains(where: { $0.name == "display_name" }) else {
                return
            }

            try await sqlDatabase.raw("PRAGMA foreign_keys = OFF").run()

            try await sqlDatabase.raw("DROP TABLE IF EXISTS users_without_display_name").run()
            try await sqlDatabase
                .raw("""
                     CREATE TABLE users_without_display_name (
                         id UUID PRIMARY KEY,
                         email TEXT NOT NULL,
                         password_hash TEXT NOT NULL,
                         created_at REAL,
                         updated_at REAL,
                         CONSTRAINT "uq:users.email" UNIQUE ("email")
                     )
                     """)
                .run()
            try await sqlDatabase
                .raw("""
                     INSERT INTO users_without_display_name (
                         id,
                         email,
                         password_hash,
                         created_at,
                         updated_at
                     )
                     SELECT
                         id,
                         email,
                         password_hash,
                         created_at,
                         updated_at
                     FROM users
                     """)
                .run()
            try await sqlDatabase.raw("DROP TABLE users").run()
            try await sqlDatabase.raw("ALTER TABLE users_without_display_name RENAME TO users").run()
            try await sqlDatabase.raw("PRAGMA foreign_keys = ON").run()
            connection.logger.notice("Removed users.display_name from legacy database.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct CreateSessions: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("sessions")
            .id()
            .field("user_id", .uuid, .required)
            .field("token_hash", .string, .required)
            .field("expires_at", .datetime, .required)
            .field("revoked_at", .datetime)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "token_hash")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("sessions").delete()
    }
}

struct CreatePlayers: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("players")
            .id()
            .field("login_name", .string, .required)
            .field("login_name_normalized", .string, .required)
            .field("display_name", .string, .required)
            .field("display_name_normalized", .string, .required)
            .field("previous_display_names_json", .string)
            .field("token_hash", .string, .required)
            .field("expires_at", .datetime, .required)
            .field("revoked_at", .datetime)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "login_name_normalized")
            .unique(on: "token_hash")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("players").delete()
    }
}

private struct SQLiteTableInfoRow: Decodable {
    let name: String
}

struct MigrateLegacyCampaignPlayerSessionsToPlayers: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let legacyColumns = try await sqlDatabase
                .raw("PRAGMA table_info(campaign_player_sessions)")
                .all(decoding: SQLiteTableInfoRow.self)
            guard !legacyColumns.isEmpty else {
                return
            }

            let legacyColumnNames = Set(legacyColumns.map(\.name))
            let hasPreviousDisplayNames = legacyColumnNames.contains("previous_display_names_json")

            let playerColumns = try await sqlDatabase
                .raw("PRAGMA table_info(players)")
                .all(decoding: SQLiteTableInfoRow.self)
            guard !playerColumns.isEmpty else {
                return
            }

            try await sqlDatabase
                .raw("""
                     INSERT OR IGNORE INTO players (
                         id,
                         login_name,
                         login_name_normalized,
                         display_name,
                         display_name_normalized,
                         previous_display_names_json,
                         token_hash,
                         expires_at,
                         revoked_at,
                         created_at,
                         updated_at
                     )
                     SELECT
                         id,
                         display_name,
                         display_name_normalized,
                         display_name,
                         display_name_normalized,
                         \(unsafeRaw: hasPreviousDisplayNames ? "previous_display_names_json" : "NULL"),
                         token_hash,
                         expires_at,
                         revoked_at,
                         created_at,
                         updated_at
                     FROM campaign_player_sessions
                     """)
                .run()
            connection.logger.notice("Patched players from legacy campaign_player_sessions.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddCharacterClaimColumnsToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            if columns.contains(where: { $0.name == "claimed_session_id" }) == false {
                try await sqlDatabase
                    .raw("ALTER TABLE characters ADD COLUMN claimed_session_id UUID")
                    .run()
            }
            if columns.contains(where: { $0.name == "claimed_display_name" }) == false {
                try await sqlDatabase
                    .raw("ALTER TABLE characters ADD COLUMN claimed_display_name TEXT")
                    .run()
            }
            if columns.contains(where: { $0.name == "claimed_at" }) == false {
                try await sqlDatabase
                    .raw("ALTER TABLE characters ADD COLUMN claimed_at REAL")
                    .run()
            }
            if columns.contains(where: { $0.name == "last_played_by_name" }) == false {
                try await sqlDatabase
                    .raw("ALTER TABLE characters ADD COLUMN last_played_by_name TEXT")
                    .run()
            }

            try await sqlDatabase
                .raw("""
                     UPDATE characters
                     SET claimed_session_id = owner_id,
                         claimed_display_name = owner_name,
                         claimed_at = COALESCE(claimed_at, created_at)
                     WHERE claimed_session_id IS NULL
                       AND owner_name != 'Referee'
                     """)
                .run()
            connection.logger.notice("Patched characters with claim columns.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddLastPlayedByNameToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "last_played_by_name" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE characters ADD COLUMN last_played_by_name TEXT")
                .run()
            connection.logger.notice("Patched characters with last_played_by_name.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddReferenceUrlToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "reference_url" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE characters ADD COLUMN reference_url TEXT")
                .run()
            connection.logger.notice("Patched characters with reference_url.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddCharacterClaimableToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "is_claimable" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE characters ADD COLUMN is_claimable INTEGER NOT NULL DEFAULT 0")
                .run()
            connection.logger.notice("Patched characters with is_claimable.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddStatBlockIdToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "stat_block_id" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE characters ADD COLUMN stat_block_id TEXT")
                .run()
            connection.logger.notice("Patched characters with stat_block_id.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddCurrencyToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "currency_json" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE characters ADD COLUMN currency_json TEXT")
                .run()
            connection.logger.notice("Patched characters with currency_json.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddInventoryToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "inventory_json" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE characters ADD COLUMN inventory_json TEXT")
                .run()
            connection.logger.notice("Patched characters with inventory_json.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddInitiativeGroupColumnsToCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)

            if columns.contains(where: { $0.name == "initiative_group_id" }) == false {
                try await sqlDatabase
                    .raw("ALTER TABLE characters ADD COLUMN initiative_group_id UUID")
                    .run()
            }
            if columns.contains(where: { $0.name == "initiative_group_index" }) == false {
                try await sqlDatabase
                    .raw("ALTER TABLE characters ADD COLUMN initiative_group_index INTEGER")
                    .run()
            }
            connection.logger.notice("Patched characters with initiative group columns.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddClaimTimeoutMinutesToCampaigns: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(campaigns)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "claim_timeout_minutes" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE campaigns ADD COLUMN claim_timeout_minutes INTEGER")
                .run()
            try await sqlDatabase
                .raw("UPDATE campaigns SET claim_timeout_minutes = 5 WHERE claim_timeout_minutes IS NULL")
                .run()
            connection.logger.notice("Patched campaigns with claim_timeout_minutes.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddInviteOnlyToCampaigns: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(campaigns)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "is_invite_only" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE campaigns ADD COLUMN is_invite_only INTEGER NOT NULL DEFAULT 0")
                .run()
            connection.logger.notice("Patched campaigns with is_invite_only.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddUserDataFilesToCampaigns: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(campaigns)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "userdata_files_json" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE campaigns ADD COLUMN userdata_files_json TEXT")
                .run()
            connection.logger.notice("Patched campaigns with userdata_files_json.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddPartyTreasureToCampaigns: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(campaigns)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "party_treasure_json" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE campaigns ADD COLUMN party_treasure_json TEXT")
                .run()
            connection.logger.notice("Patched campaigns with party_treasure_json.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct AddCurrencyToCampaigns: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(campaigns)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "currency_json" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE campaigns ADD COLUMN currency_json TEXT")
                .run()
            connection.logger.notice("Patched campaigns with currency_json.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct DatabaseShapeVerification {
    static func verify(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(players)")
                .all(decoding: SQLiteTableInfoRow.self)

            let requiredPlayerColumns = [
                "login_name",
                "login_name_normalized",
                "display_name",
                "display_name_normalized",
                "previous_display_names_json",
                "token_hash",
                "expires_at"
            ]
            let missingPlayerColumns = requiredPlayerColumns.filter { required in
                columns.contains(where: { $0.name == required }) == false
            }
            guard missingPlayerColumns.isEmpty else {
                throw Abort(
                    .internalServerError,
                    reason: "Database schema is missing players columns: \(missingPlayerColumns.joined(separator: ", "))."
                )
            }

            let userColumns = try await sqlDatabase
                .raw("PRAGMA table_info(users)")
                .all(decoding: SQLiteTableInfoRow.self)
            let removedUserColumns = ["display_name"].filter { removed in
                userColumns.contains(where: { $0.name == removed })
            }
            guard removedUserColumns.isEmpty else {
                throw Abort(
                    .internalServerError,
                    reason: "Database schema still contains removed users columns: \(removedUserColumns.joined(separator: ", "))."
                )
            }

            let characterColumns = try await sqlDatabase
                .raw("PRAGMA table_info(characters)")
                .all(decoding: SQLiteTableInfoRow.self)
            let requiredCharacterColumns = [
                "claimed_session_id",
                "claimed_display_name",
                "claimed_at",
                "last_played_by_name",
                "reference_url",
                "is_claimable",
                "stat_block_id",
                "currency_json",
                "inventory_json"
            ]
            let missingCharacterColumns = requiredCharacterColumns.filter { required in
                characterColumns.contains(where: { $0.name == required }) == false
            }
            guard missingCharacterColumns.isEmpty else {
                throw Abort(
                    .internalServerError,
                    reason: "Database schema is missing characters claim columns: \(missingCharacterColumns.joined(separator: ", "))."
                )
            }

            let campaignColumns = try await sqlDatabase
                .raw("PRAGMA table_info(campaigns)")
                .all(decoding: SQLiteTableInfoRow.self)
            let requiredCampaignColumns = [
                "claim_timeout_minutes",
                "is_invite_only",
                "userdata_files_json",
                "party_treasure_json",
                "currency_json"
            ]
            let missingCampaignColumns = requiredCampaignColumns.filter { required in
                campaignColumns.contains(where: { $0.name == required }) == false
            }
            guard missingCampaignColumns.isEmpty else {
                throw Abort(
                    .internalServerError,
                    reason: "Database schema is missing campaigns columns: \(missingCampaignColumns.joined(separator: ", "))."
                )
            }

            let inviteColumns = try await sqlDatabase
                .raw("PRAGMA table_info(campaign_invites)")
                .all(decoding: SQLiteTableInfoRow.self)
            let requiredInviteColumns = [
                "campaign_id",
                "created_by_user_id",
                "token_hash",
                "invited_player_name",
                "accepted_player_id",
                "accepted_at"
            ]
            let missingInviteColumns = requiredInviteColumns.filter { required in
                inviteColumns.contains(where: { $0.name == required }) == false
            }
            guard missingInviteColumns.isEmpty else {
                throw Abort(
                    .internalServerError,
                    reason: "Database schema is missing campaign_invites columns: \(missingInviteColumns.joined(separator: ", "))."
                )
            }
        }
    }
}

struct CreateCampaigns: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("campaigns")
            .id()
            .field("name", .string, .required)
            .field("ruleset_id", .string, .required)
            .field("is_archived", .bool, .required)
            .field("claim_timeout_minutes", .int)
            .field("is_invite_only", .bool, .required, .sql(.default(false)))
            .field("userdata_files_json", .string)
            .field("party_treasure_json", .string)
            .field("currency_json", .string)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("campaigns").delete()
    }
}

struct CreateCampaignMemberships: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("campaign_memberships")
            .id()
            .field("campaign_id", .uuid, .required)
            .field("user_id", .uuid, .required)
            .field("role", .string, .required)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "campaign_id", "user_id")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("campaign_memberships").delete()
    }
}

struct CreateCampaignInvites: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("campaign_invites")
            .id()
            .field("campaign_id", .uuid, .required)
            .field("created_by_user_id", .uuid, .required)
            .field("token_hash", .string, .required)
            .field("invited_player_name", .string)
            .field("accepted_player_id", .uuid)
            .field("accepted_at", .datetime)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "token_hash")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("campaign_invites").delete()
    }
}

struct AddInviteTargetNameToCampaignInvites: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.withConnection { connection in
            guard let sqlDatabase = connection as? any SQLDatabase else {
                return
            }

            let columns = try await sqlDatabase
                .raw("PRAGMA table_info(campaign_invites)")
                .all(decoding: SQLiteTableInfoRow.self)

            guard columns.contains(where: { $0.name == "invited_player_name" }) == false else {
                return
            }

            try await sqlDatabase
                .raw("ALTER TABLE campaign_invites ADD COLUMN invited_player_name TEXT")
                .run()
            connection.logger.notice("Patched campaign_invites with invited_player_name.")
        }
    }

    func revert(on database: any Database) async throws {
    }
}

struct CreateCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("characters")
            .id()
            .field("campaign_id", .uuid, .required)
            .field("owner_id", .uuid, .required)
            .field("owner_name", .string, .required)
            .field("name", .string, .required)
            .field("initiative", .double)
            .field("initiative_group_id", .uuid)
            .field("initiative_group_index", .int)
            .field("stat_block_id", .string)
            .field("currency_json", .string)
            .field("inventory_json", .string)
            .field("reveal_stats", .bool, .required)
            .field("auto_skip_turn", .bool, .required)
            .field("use_app_initiative_roll", .bool, .required)
            .field("initiative_bonus", .int, .required)
            .field("is_hidden", .bool, .required)
            .field("reveal_on_turn", .bool, .required)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("characters").delete()
    }
}

struct CreateCharacterStats: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("character_stats")
            .id()
            .field("character_id", .uuid, .required)
            .field("stat_key", .string, .required)
            .field("current_value", .int, .required)
            .field("max_value", .int, .required)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "character_id", "stat_key")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("character_stats").delete()
    }
}

struct CreateCharacterConditions: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("character_conditions")
            .id()
            .field("character_id", .uuid, .required)
            .field("condition", .string, .required)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "character_id", "condition")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("character_conditions").delete()
    }
}

struct CreateCampaignEncounters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("campaign_encounters")
            .id()
            .field("campaign_id", .uuid, .required)
            .field("encounter_state", .string, .required)
            .field("round_index", .int, .required)
            .field("turn_index", .int, .required)
            .field("current_character_id", .uuid)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "campaign_id")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("campaign_encounters").delete()
    }
}

enum DatabaseMigrations {
    static func register(on app: Application) {
        app.migrations.add(CreateUsers())
        app.migrations.add(RemoveUserDisplayName())
        app.migrations.add(CreateSessions())
        app.migrations.add(CreatePlayers())
        app.migrations.add(MigrateLegacyCampaignPlayerSessionsToPlayers())
        app.migrations.add(CreateCampaigns())
        app.migrations.add(AddClaimTimeoutMinutesToCampaigns())
        app.migrations.add(AddInviteOnlyToCampaigns())
        app.migrations.add(AddUserDataFilesToCampaigns())
        app.migrations.add(AddPartyTreasureToCampaigns())
        app.migrations.add(AddCurrencyToCampaigns())
        app.migrations.add(CreateCampaignMemberships())
        app.migrations.add(CreateCampaignInvites())
        app.migrations.add(AddInviteTargetNameToCampaignInvites())
        app.migrations.add(CreateCharacters())
        app.migrations.add(AddCharacterClaimColumnsToCharacters())
        app.migrations.add(AddCharacterClaimableToCharacters())
        app.migrations.add(AddLastPlayedByNameToCharacters())
        app.migrations.add(AddReferenceUrlToCharacters())
        app.migrations.add(AddStatBlockIdToCharacters())
        app.migrations.add(AddCurrencyToCharacters())
        app.migrations.add(AddInventoryToCharacters())
        app.migrations.add(AddInitiativeGroupColumnsToCharacters())
        app.migrations.add(CreateCharacterStats())
        app.migrations.add(CreateCharacterConditions())
        app.migrations.add(CreateCampaignEncounters())
    }

    static func verifyShape(on database: any Database) async throws {
        try await DatabaseShapeVerification.verify(on: database)
    }
}
