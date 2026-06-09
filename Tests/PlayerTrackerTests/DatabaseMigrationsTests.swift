import SQLite3
import FluentSQLiteDriver
import Vapor
import XCTest
@testable import PlayerTracker

final class DatabaseMigrationsTests: XCTestCase {
    func testDatabaseShapeVerificationRejectsLegacyCampaignPlayerSessionSchema() async throws {
        let app = try await makeApp(withLegacyPlayerSessionSchema: true)
        defer { shutdownApplicationSynchronously(app) }

        do {
            try await DatabaseMigrations.verifyShape(on: app.db)
            XCTFail("Expected legacy database schema verification to fail.")
        } catch {
            let abort = error as? AbortError
            XCTAssertEqual(abort?.status, .internalServerError)
        }
    }

    func testLegacyPlayerSessionSchemaMigrationCreatesPlayersTable() async throws {
        let app = try await makeApp(withLegacyPlayerSessionSchema: true)
        defer { shutdownApplicationSynchronously(app) }

        try await CreatePlayers().prepare(on: app.db)
        try await MigrateLegacyCampaignPlayerSessionsToPlayers().prepare(on: app.db)
        try await AddInviteOnlyToCampaigns().prepare(on: app.db)
        try await AddCharacterClaimColumnsToCharacters().prepare(on: app.db)
        try await AddCharacterClaimableToCharacters().prepare(on: app.db)
        try await AddLastPlayedByNameToCharacters().prepare(on: app.db)
        try await AddReferenceUrlToCharacters().prepare(on: app.db)
        try await AddStatBlockIdToCharacters().prepare(on: app.db)
        try await AddCurrencyToCharacters().prepare(on: app.db)
        try await AddInventoryToCharacters().prepare(on: app.db)
        try await AddUserDataFilesToCampaigns().prepare(on: app.db)
        try await AddPartyTreasureToCampaigns().prepare(on: app.db)
        try await CreateCampaignInvites().prepare(on: app.db)
        try await DatabaseMigrations.verifyShape(on: app.db)
    }

    func testLegacyCharacterSchemaMigrationAddsLastPlayedByNameColumn() async throws {
        let app = try await makeApp(withLegacyPlayerSessionSchema: true)
        defer { shutdownApplicationSynchronously(app) }

        try await CreatePlayers().prepare(on: app.db)
        try await MigrateLegacyCampaignPlayerSessionsToPlayers().prepare(on: app.db)
        try await AddInviteOnlyToCampaigns().prepare(on: app.db)
        try await AddCharacterClaimColumnsToCharacters().prepare(on: app.db)
        try await AddCharacterClaimableToCharacters().prepare(on: app.db)
        try await AddLastPlayedByNameToCharacters().prepare(on: app.db)
        try await AddReferenceUrlToCharacters().prepare(on: app.db)
        try await AddStatBlockIdToCharacters().prepare(on: app.db)
        try await AddCurrencyToCharacters().prepare(on: app.db)
        try await AddInventoryToCharacters().prepare(on: app.db)
        try await AddUserDataFilesToCampaigns().prepare(on: app.db)
        try await AddPartyTreasureToCampaigns().prepare(on: app.db)
        try await CreateCampaignInvites().prepare(on: app.db)
        try await DatabaseMigrations.verifyShape(on: app.db)
    }

    func testDatabaseShapeVerificationRejectsLegacyCampaignTimeoutSchema() async throws {
        let app = try await makeApp(withLegacyCampaignSchema: true)
        defer { shutdownApplicationSynchronously(app) }

        try await CreatePlayers().prepare(on: app.db)
        try await MigrateLegacyCampaignPlayerSessionsToPlayers().prepare(on: app.db)
        try await AddCharacterClaimColumnsToCharacters().prepare(on: app.db)
        try await AddCharacterClaimableToCharacters().prepare(on: app.db)

        do {
            try await DatabaseMigrations.verifyShape(on: app.db)
            XCTFail("Expected legacy campaign timeout schema verification to fail.")
        } catch {
            let abort = error as? AbortError
            XCTAssertEqual(abort?.status, .internalServerError)
        }
    }

    func testLegacyCampaignSchemaMigrationAddsInviteTable() async throws {
        let app = try await makeApp(withLegacyCampaignSchema: true)
        defer { shutdownApplicationSynchronously(app) }

        try await CreatePlayers().prepare(on: app.db)
        try await MigrateLegacyCampaignPlayerSessionsToPlayers().prepare(on: app.db)
        try await AddCharacterClaimColumnsToCharacters().prepare(on: app.db)
        try await AddCharacterClaimableToCharacters().prepare(on: app.db)
        try await AddClaimTimeoutMinutesToCampaigns().prepare(on: app.db)
        try await AddInviteOnlyToCampaigns().prepare(on: app.db)
        try await AddReferenceUrlToCharacters().prepare(on: app.db)
        try await AddStatBlockIdToCharacters().prepare(on: app.db)
        try await AddCurrencyToCharacters().prepare(on: app.db)
        try await AddInventoryToCharacters().prepare(on: app.db)
        try await AddUserDataFilesToCampaigns().prepare(on: app.db)
        try await AddPartyTreasureToCampaigns().prepare(on: app.db)
        try await CreateCampaignInvites().prepare(on: app.db)
        try await DatabaseMigrations.verifyShape(on: app.db)
    }

    private func makeApp(
        withLegacyPlayerSessionSchema: Bool = false,
        withLegacyCampaignSchema: Bool = false
    ) async throws -> Application {
        let app = try await Application.make(.testing)
        let databaseFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-migration-\(UUID().uuidString).sqlite3")

        try createLegacyDatabase(
            at: databaseFileURL,
            legacyPlayerSessionSchema: withLegacyPlayerSessionSchema,
            legacyCampaignSchema: withLegacyCampaignSchema
        )

        app.databases.use(.sqlite(.file(databaseFileURL.path)), as: .sqlite)
        return app
    }

    private func createLegacyDatabase(
        at url: URL,
        legacyPlayerSessionSchema: Bool,
        legacyCampaignSchema: Bool
    ) throws {
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )

        var db: OpaquePointer?
        guard sqlite3_open(url.path, &db) == SQLITE_OK, let db else {
            throw LegacySQLiteError.openFailed
        }
        defer { sqlite3_close(db) }

        let playerSessionColumns = legacyPlayerSessionSchema
            ? """
              CREATE TABLE IF NOT EXISTS campaign_player_sessions (
                  id UUID PRIMARY KEY,
                  campaign_id UUID NOT NULL,
                  display_name TEXT NOT NULL,
                  display_name_normalized TEXT NOT NULL,
                  token_hash TEXT NOT NULL,
                  expires_at REAL NOT NULL,
                  revoked_at REAL,
                  created_at REAL,
                  updated_at REAL,
                  CONSTRAINT "uq:campaign_player_sessions.campaign_id+campaign_player_sessions.display_name_normalized" UNIQUE ("campaign_id", "display_name_normalized"),
                  CONSTRAINT "uq:campaign_player_sessions.token_hash" UNIQUE ("token_hash")
              );
              """
            : """
              CREATE TABLE IF NOT EXISTS campaign_player_sessions (
                  id UUID PRIMARY KEY,
                  campaign_id UUID NOT NULL,
                  display_name TEXT NOT NULL,
                  display_name_normalized TEXT NOT NULL,
                  previous_display_names_json TEXT,
                  token_hash TEXT NOT NULL,
                  expires_at REAL NOT NULL,
                  revoked_at REAL,
                  created_at REAL,
                  updated_at REAL,
                  CONSTRAINT "uq:campaign_player_sessions.campaign_id+campaign_player_sessions.display_name_normalized" UNIQUE ("campaign_id", "display_name_normalized"),
                  CONSTRAINT "uq:campaign_player_sessions.token_hash" UNIQUE ("token_hash")
              );
              """

        let campaignColumns = legacyCampaignSchema
            ? """
              CREATE TABLE IF NOT EXISTS campaigns (
                  id UUID PRIMARY KEY,
                  name TEXT NOT NULL,
                  ruleset_id TEXT NOT NULL,
                  is_archived BOOL NOT NULL,
                  created_at REAL,
                  updated_at REAL
              );
              """
            : """
              CREATE TABLE IF NOT EXISTS campaigns (
                  id UUID PRIMARY KEY,
                  name TEXT NOT NULL,
                  ruleset_id TEXT NOT NULL,
                  is_archived BOOL NOT NULL,
                  claim_timeout_minutes INT,
                  created_at REAL,
                  updated_at REAL
              );
              """

        let createSQL = """
        \(campaignColumns)
        \(playerSessionColumns)
        CREATE TABLE IF NOT EXISTS characters (
            id UUID PRIMARY KEY,
            campaign_id UUID NOT NULL,
            owner_id UUID NOT NULL,
            owner_name TEXT NOT NULL,
            name TEXT NOT NULL,
            initiative REAL,
            reveal_stats BOOL NOT NULL,
            auto_skip_turn BOOL NOT NULL,
            use_app_initiative_roll BOOL NOT NULL,
            initiative_bonus INT NOT NULL,
            is_hidden BOOL NOT NULL,
            reveal_on_turn BOOL NOT NULL,
            created_at REAL,
            updated_at REAL
        );
        """

        var errorMessage: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(db, createSQL, nil, nil, &errorMessage) == SQLITE_OK else {
            let message = errorMessage.map { String(cString: $0) } ?? "unknown SQLite error"
            sqlite3_free(errorMessage)
            throw LegacySQLiteError.createFailed(message)
        }
    }
}

private enum LegacySQLiteError: Error, CustomStringConvertible {
    case openFailed
    case createFailed(String)

    var description: String {
        switch self {
        case .openFailed:
            return "Unable to open temporary SQLite database."
        case .createFailed(let message):
            return "Unable to create legacy SQLite schema: \(message)"
        }
    }
}
