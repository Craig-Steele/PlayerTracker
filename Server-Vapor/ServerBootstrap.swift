import Foundation
import Vapor

struct ServerBootstrapOptions {
    var hostname: String
    var port: Int
    var webClientDirectory: URL
    var campaignName: String
    var restorePersistedState: Bool
    var persistChanges: Bool
    var launchBrowser: Bool

    static var production: ServerBootstrapOptions {
        ServerBootstrapOptions(
            hostname: "0.0.0.0",
            port: 8080,
            webClientDirectory: AppPaths.webClientDirectory(),
            campaignName: "Campaign",
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

        let conditionLibrary = try library ?? RuleSetLibraryLoader.loadDefault()
        let campaignStore = CampaignStore(
            defaultLibrary: conditionLibrary,
            defaultName: options.campaignName,
            restorePersistedState: options.restorePersistedState,
            persistChanges: options.persistChanges
        )

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
