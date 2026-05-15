import Vapor
import XCTVapor
import XCTest
@testable import PlayerTracker

final class UserPersistenceTests: XCTestCase {
    func testUserCreateAndLoadRoundTripsThroughSQLite() async throws {
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

        try await ServerBootstrap.configure(app, options: options, library: library)

        let userID = try await DatabasePersistence.createUser(
            email: "owner@example.com",
            passwordHash: "hash-value",
            displayName: "Parent",
            on: app.db
        )

        let loaded = try await DatabasePersistence.loadUser(
            email: "owner@example.com",
            on: app.db
        )

        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.id, userID)
        XCTAssertEqual(loaded?.email, "owner@example.com")
        XCTAssertEqual(loaded?.passwordHash, "hash-value")
        XCTAssertEqual(loaded?.displayName, "Parent")

        try await app.asyncShutdown()
    }
}
