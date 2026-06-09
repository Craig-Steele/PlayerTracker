import Vapor
import VaporTesting
import Testing
@testable import PlayerTracker

@Suite("Auth Routes")
struct AuthRoutesTests {
    @Test("signup login session and logout round trip")
    func signupLoginSessionAndLogoutRoundTrip() async throws {
        let app = try await makeApp()
        defer { shutdownApplicationSynchronously(app) }
        let tester = try app.testing()

        let signupPayload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password"
        )
        let signupResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(signupPayload))
        )
        #expect(signupResponse.status == .ok)
        let signupSession = try signupResponse.content.decode(AuthSessionResponse.self)
        #expect(signupSession.user.email == "owner@example.com")
        let signupCookie = try #require(signupResponse.headers.first(name: .setCookie))
        let signupToken = try #require(signupCookie.split(separator: ";").first?.split(separator: "=").last)

        let sessionResponse = try await sendRequest(
            tester,
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        #expect(sessionResponse.status == .ok)
        let sessionPayload = try sessionResponse.content.decode(AuthSessionResponse.self)
        #expect(sessionPayload.user.email == "owner@example.com")

        let logoutResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/logout",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        #expect(logoutResponse.status == .ok)

        let revokedSessionResponse = try await sendRequest(
            tester,
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        #expect(revokedSessionResponse.status == .unauthorized)

        let loginPayload = AuthLoginInput(email: "owner@example.com", password: "s3cr3t-password")
        let loginResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/login",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(loginPayload))
        )
        #expect(loginResponse.status == .ok)
        let loginSession = try loginResponse.content.decode(AuthSessionResponse.self)
        #expect(loginSession.user.email == "owner@example.com")
    }

    @Test("duplicate signup is rejected")
    func duplicateSignupIsRejected() async throws {
        let app = try await makeApp()
        defer { shutdownApplicationSynchronously(app) }
        let tester = try app.testing()

        let payload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password"
        )

        let firstResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        #expect(firstResponse.status == .ok)

        let duplicateResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(payload))
        )
        #expect(duplicateResponse.status == .conflict)
    }

    @Test("bad login is rejected")
    func badLoginIsRejected() async throws {
        let app = try await makeApp()
        defer { shutdownApplicationSynchronously(app) }
        let tester = try app.testing()

        let signupPayload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password"
        )
        let signupResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(signupPayload))
        )
        #expect(signupResponse.status == .ok)

        let wrongPassword = AuthLoginInput(email: "owner@example.com", password: "wrong-password")
        let wrongPasswordResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/login",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(wrongPassword))
        )
        #expect(wrongPasswordResponse.status == .unauthorized)

        let unknownUser = AuthLoginInput(email: "missing@example.com", password: "anything")
        let unknownUserResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/login",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(unknownUser))
        )
        #expect(unknownUserResponse.status == .unauthorized)
    }

    @Test("expired session is rejected")
    func expiredSessionIsRejected() async throws {
        let app = try await makeApp()
        defer { shutdownApplicationSynchronously(app) }

        let userID = try await DatabasePersistence.createUser(
            email: "owner@example.com",
            passwordHash: "hash-value",
            on: app.db
        )
        let token = try await DatabasePersistence.createSession(
            userID: userID,
            expiresAt: Date(timeIntervalSinceNow: -60),
            on: app.db
        )
        let tester = try app.testing()

        let sessionResponse = try await sendRequest(
            tester,
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(token)"]
        )
        #expect(sessionResponse.status == .unauthorized)
    }

    @Test("auth session requires cookie")
    func authSessionRequiresCookie() async throws {
        let app = try await makeApp()
        defer { shutdownApplicationSynchronously(app) }
        let tester = try app.testing()

        let sessionResponse = try await sendRequest(tester, .GET, "/auth/session")
        #expect(sessionResponse.status == .unauthorized)
    }

    @Test("logout invalidates session")
    func logoutInvalidatesSession() async throws {
        let app = try await makeApp()
        defer { shutdownApplicationSynchronously(app) }
        let tester = try app.testing()

        let signupPayload = AuthSignupInput(
            email: "owner@example.com",
            password: "s3cr3t-password"
        )
        let signupResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/signup",
            headers: ["Content-Type": "application/json"],
            body: ByteBuffer(data: try JSONEncoder().encode(signupPayload))
        )
        let signupCookie = try #require(signupResponse.headers.first(name: .setCookie))
        let signupToken = try #require(signupCookie.split(separator: ";").first?.split(separator: "=").last)

        let logoutResponse = try await sendRequest(
            tester,
            .POST,
            "/auth/logout",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        #expect(logoutResponse.status == .ok)

        let sessionResponse = try await sendRequest(
            tester,
            .GET,
            "/auth/session",
            headers: ["Cookie": "roll4_session=\(signupToken)"]
        )
        #expect(sessionResponse.status == .unauthorized)
    }

    @Test("shutdown requires authentication")
    func shutdownRequiresAuthentication() async throws {
        let app = try await makeApp()
        defer { shutdownApplicationSynchronously(app) }
        let tester = try app.testing()

        let response = try await sendRequest(tester, .POST, "/admin/shutdown")
        #expect(response.status == .unauthorized)
    }

    private func makeApp() async throws -> Application {
        let app = try await Application.make(.testing)
        quietTestLogging(for: app)
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
        options.verboseOutput = false
        try await ServerBootstrap.configure(app, options: options, library: library)
        return app
    }

    private func sendRequest(
        _ tester: TestingApplicationTester,
        _ method: HTTPMethod,
        _ path: String,
        headers: HTTPHeaders = [:],
        body: ByteBuffer? = nil
    ) async throws -> TestingHTTPResponse {
        try await tester.performTest(
            request: TestingHTTPRequest(
                method: method,
                url: URI(path: path),
                headers: headers,
                body: body ?? ByteBufferAllocator().buffer(capacity: 0)
            )
        )
    }
}
