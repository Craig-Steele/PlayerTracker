import Foundation
import Fluent
import FluentSQLiteDriver
import Vapor

struct ServerBootstrapOptions {
    var hostname: String
    var port: Int
    var webClientDirectory: URL
    var campaignName: String
    var databaseFileURL: URL
    var restorePersistedState: Bool
    var persistChanges: Bool
    var launchBrowser: Bool

    static var production: ServerBootstrapOptions {
        ServerBootstrapOptions(
            hostname: "0.0.0.0",
            port: 8080,
            webClientDirectory: AppPaths.webClientDirectory(),
            campaignName: "Campaign",
            databaseFileURL: AppPaths.appDataDirectory()
                .appendingPathComponent("data", isDirectory: true)
                .appendingPathComponent("app.sqlite3"),
            restorePersistedState: true,
            persistChanges: true,
            launchBrowser: BrowserLauncher.shouldLaunchByDefault
        )
    }
}

enum ServerBootstrap {
    static func configure(
        _ app: Application,
        options: ServerBootstrapOptions = .production,
        library: RuleSetLibrary? = nil
    ) async throws {
        let sitesDir = options.webClientDirectory.path + "/"

        print("Serving static files from:", sitesDir)

        app.middleware.use(FileMiddleware(publicDirectory: sitesDir))
        app.http.server.configuration.hostname = options.hostname
        app.http.server.configuration.port = options.port

        try FileManager.default.createDirectory(
            at: options.databaseFileURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        app.databases.use(.sqlite(.file(options.databaseFileURL.path)), as: .sqlite)
        DatabaseMigrations.register(on: app)
        try await app.autoMigrate()

        let conditionLibrary = try library ?? RuleSetLibraryLoader.loadDefault()
        let campaignStore = CampaignStore(
            defaultLibrary: conditionLibrary,
            defaultName: options.campaignName,
            restorePersistedState: options.restorePersistedState,
            persistChanges: options.persistChanges
        )
        try await campaignStore.configure(database: app.db)
        print("Loaded default ruleset:", conditionLibrary.label)
        print("Connection logs:", await connectionLogPath())
        await logServerEvent("startup host=\(options.hostname) port=\(options.port)")

        try routes(app, campaignStore: campaignStore)

        if options.launchBrowser {
            Task {
                // Give the HTTP listener a moment to bind before opening the browser.
                try? await Task.sleep(for: .milliseconds(400))
                BrowserLauncher.launchDisplayPage()
            }
        }
    }
}
