import Fluent
import Vapor

struct CreateUsers: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users")
            .id()
            .field("email", .string, .required)
            .field("password_hash", .string, .required)
            .field("display_name", .string)
            .field("created_at", .datetime)
            .field("updated_at", .datetime)
            .unique(on: "email")
            .create()
    }

    func revert(on database: any Database) async throws {
        try await database.schema("users").delete()
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

struct CreateCampaigns: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("campaigns")
            .id()
            .field("name", .string, .required)
            .field("ruleset_id", .string, .required)
            .field("is_archived", .bool, .required)
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

struct CreateCharacters: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("characters")
            .id()
            .field("campaign_id", .uuid, .required)
            .field("owner_id", .uuid, .required)
            .field("owner_name", .string, .required)
            .field("name", .string, .required)
            .field("initiative", .double)
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
        app.migrations.add(CreateSessions())
        app.migrations.add(CreateCampaigns())
        app.migrations.add(CreateCampaignMemberships())
        app.migrations.add(CreateCharacters())
        app.migrations.add(CreateCharacterStats())
        app.migrations.add(CreateCharacterConditions())
        app.migrations.add(CreateCampaignEncounters())
    }
}
