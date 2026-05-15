import Vapor
import XCTVapor
import XCTest
@testable import PlayerTracker

final class AuthRoutesTests: XCTestCase {
    func testSignupLoginSessionAndLogoutRoundTrip() async throws {
        let app = try await makeApp()
        let tester = try app.testable()

        let signupPayload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password",
            displayName: "Parent"
        )
        let signupResponse = try await tester.sendRequest(
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(signupPayload))
        )
        XCTAssertEqual(signupResponse.status, .ok)
        let signupSession = try signupResponse.content.decode(AuthSessionResponse.self)
        XCTAssertEqual(signupSession.user.email, "owner@example.com")
        XCTAssertEqual(signupSession.user.displayName, "Parent")
        let signupCookie = try XCTUnwrap(signupResponse.headers.first(name: .setCookie))
        let signupToken = try XCTUnwrap(signupCookie.split(separator: ";").first?.split(separator: "=").last)

        let sessionResponse = try await tester.sendRequest(
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        XCTAssertEqual(sessionResponse.status, .ok)
        let sessionPayload = try sessionResponse.content.decode(AuthSessionResponse.self)
        XCTAssertEqual(sessionPayload.user.email, "owner@example.com")

        let logoutResponse = try await tester.sendRequest(
            .POST,
            "/auth/logout",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        XCTAssertEqual(logoutResponse.status, .ok)

        let revokedSessionResponse = try await tester.sendRequest(
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        XCTAssertEqual(revokedSessionResponse.status, .unauthorized)

        let loginPayload = AuthLoginInput(email: "owner@example.com", password: "s3cr3t-password")
        let loginResponse = try await tester.sendRequest(
            .POST,
            "/auth/login",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(loginPayload))
        )
        XCTAssertEqual(loginResponse.status, .ok)
        let loginSession = try loginResponse.content.decode(AuthSessionResponse.self)
        XCTAssertEqual(loginSession.user.email, "owner@example.com")

        try await app.asyncShutdown()
    }

    func testDuplicateSignupIsRejected() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let payload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password",
            displayName: "Parent"
        )

        let firstResponse = try await tester.sendRequest(
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(firstResponse.status, .ok)

        let duplicateResponse = try await tester.sendRequest(
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        XCTAssertEqual(duplicateResponse.status, .conflict)
    }

    func testBadLoginIsRejected() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let signupPayload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password",
            displayName: "Parent"
        )
        let signupResponse = try await tester.sendRequest(
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(signupPayload))
        )
        XCTAssertEqual(signupResponse.status, .ok)

        let wrongPassword = AuthLoginInput(email: "owner@example.com", password: "wrong-password")
        let wrongPasswordResponse = try await tester.sendRequest(
            .POST,
            "/auth/login",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(wrongPassword))
        )
        XCTAssertEqual(wrongPasswordResponse.status, .unauthorized)

        let unknownUser = AuthLoginInput(email: "missing@example.com", password: "anything")
        let unknownUserResponse = try await tester.sendRequest(
            .POST,
            "/auth/login",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(unknownUser))
        )
        XCTAssertEqual(unknownUserResponse.status, .unauthorized)
    }

    func testExpiredSessionIsRejected() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }

        let userID = try await DatabasePersistence.createUser(
            email: "owner@example.com",
            passwordHash: "hash-value",
            displayName: "Parent",
            on: app.db
        )
        let token = try await DatabasePersistence.createSession(
            userID: userID,
            expiresAt: Date(timeIntervalSinceNow: -60),
            on: app.db
        )
        let tester = try app.testable()

        let sessionResponse = try await tester.sendRequest(
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(token)"]
        )
        XCTAssertEqual(sessionResponse.status, .unauthorized)
    }

    func testAuthSessionRequiresCookie() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let sessionResponse = try await tester.sendRequest(.GET, "/auth/session")
        XCTAssertEqual(sessionResponse.status, .unauthorized)
    }

    func testLogoutInvalidatesSession() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let signupPayload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password",
            displayName: "Parent"
        )
        let signupResponse = try await tester.sendRequest(
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(signupPayload))
        )
        let signupCookie = try XCTUnwrap(signupResponse.headers.first(name: .setCookie))
        let signupToken = try XCTUnwrap(signupCookie.split(separator: ";").first?.split(separator: "=").last)

        let logoutResponse = try await tester.sendRequest(
            .POST,
            "/auth/logout",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        XCTAssertEqual(logoutResponse.status, .ok)

        let sessionResponse = try await tester.sendRequest(
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        XCTAssertEqual(sessionResponse.status, .unauthorized)
    }

    func testShutdownRequiresAuthentication() async throws {
        let app = try await makeApp()
        defer { Task { try? await app.asyncShutdown() } }
        let tester = try app.testable()

        let response = try await tester.sendRequest(.POST, "/admin/shutdown")
        XCTAssertEqual(response.status, .unauthorized)
    }

    private func makeApp() async throws -> Application {
        let app = try await Application.make(.testing)
        let library = try RuleSetLibraryLoader.loadLibrary(id: "dnd5e")
        var options = ServerBootstrapOptions.production
        options.hostname = "127.0.0.1"
        options.port = 0
        options.campaignName = "Auth Smoke"
        options.databaseFileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("roll4initiative-auth-\(UUID().uuidString).sqlite3")
        options.restorePersistedState = false
        options.persistChanges = true
        options.launchBrowser = false
        try await ServerBootstrap.configure(app, options: options, library: library)
        return app
    }
}
