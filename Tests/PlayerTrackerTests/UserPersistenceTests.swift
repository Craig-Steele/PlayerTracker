import Vapor
import XCTVapor
import Testing
@testable import PlayerTracker

@Suite("User Persistence")
struct UserPersistenceTests {
    @Test("user create and load round trips through SQLite")
    func userCreateAndLoadRoundTripsThroughSQLite() async throws {
        let app = try await Application.make(.testing)

        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "User Smoke"
        options.databaseFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-user-\(UUID().uuidString).sqlite3")
        options.restorePersistedState = false
        options.persistChanges = true
        options.launchBrowser = false
        options.verboseOutput = false

        try await ServerBootstrap.configure(app, options: options, library: library)

        let userID = try await DatabasePersistence.createUser(
            email: "owner@example.com",
            passwordHash: "hash-value",
            on: app.db
        )

        let loaded = try await DatabasePersistence.loadUser(
            email: "owner@example.com",
            on: app.db
        )

        #expect(loaded != nil)
        #expect(loaded?.id == userID)
        #expect(loaded?.email == "owner@example.com")
        #expect(loaded?.passwordHash == "hash-value")

        try await app.asyncShutdown()
    }
}
