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
    var verboseOutput: Bool = true

    static var production: ServerBootstrapOptions {
        production(environment: ProcessInfo.processInfo.environment)
    }

    static func production(environment: [String: String]) -> ServerBootstrapOptions {
        ServerBootstrapOptions(
            hostname: "0.0.0.0",
            port: serverPort(environment: environment),
            webClientDirectory: AppPaths.webClientDirectory(environment: environment),
            campaignName: "Campaign",
            databaseFileURL: AppPaths.appDataDirectory(environment: environment)
                .appendingPathComponent("data", isDirectory: true)
                .appendingPathComponent("app.sqlite3"),
            restorePersistedState: true,
            persistChanges: true,
            launchBrowser: BrowserLauncher.shouldLaunchByDefault(environment: environment)
        )
    }

    private static func serverPort(environment: [String: String]) -> Int {
        guard let rawValue = environment["PORT"],
              let port = Int(rawValue.trimmingCharacters(in: .whitespacesAndNewlines)),
              port > 0,
              port <= 65_535 else {
            return 8080
        }
        return port
    }
}

enum ServerBootstrap {
    static func migrateLegacyAppDirectoriesIfNeeded(
        fileManager: FileManager = .default,
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) throws {
        let appSupportRoot = appSupportBaseDirectory(environment: environment)

        try migrateDirectoryIfNeeded(
            newDirectory: AppPaths.appDataDirectory(baseDirectory: appSupportRoot),
            legacyDirectories: [
                appSupportRoot.appendingPathComponent("PlayerTracker", isDirectory: true),
                appSupportRoot.appendingPathComponent("Roll4Initiative", isDirectory: true)
            ],
            fileManager: fileManager
        )
    }

    static func migrateDirectoryIfNeeded(
        newDirectory: URL,
        legacyDirectories: [URL],
        fileManager: FileManager = .default
    ) throws {
        guard !fileManager.fileExists(atPath: newDirectory.path) else {
            return
        }

        for legacyDirectory in legacyDirectories {
            guard fileManager.fileExists(atPath: legacyDirectory.path) else {
                continue
            }
            try fileManager.createDirectory(at: newDirectory.deletingLastPathComponent(), withIntermediateDirectories: true)
            try fileManager.moveItem(at: legacyDirectory, to: newDirectory)
            return
        }
    }

    private static func appSupportBaseDirectory(environment: [String: String]) -> URL {
        #if os(macOS)
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support", isDirectory: true)
        #elseif os(Windows)
        return environmentDirectory("LOCALAPPDATA", environment: environment)
        #else
        return xdgDirectory(environmentKey: "XDG_DATA_HOME", fallbackPath: ".local/share", environment: environment)
        #endif
    }

    private static func environmentDirectory(_ key: String, environment: [String: String]) -> URL {
        if let rawValue = environment[key],
           !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return URL(fileURLWithPath: rawValue, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
    }

    private static func xdgDirectory(environmentKey: String, fallbackPath: String, environment: [String: String]) -> URL {
        if let rawValue = environment[environmentKey],
           !rawValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return URL(fileURLWithPath: rawValue, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(fallbackPath, isDirectory: true)
    }

    static func configure(
        _ app: Application,
        options: ServerBootstrapOptions = .production,
        library: RuleSetLibrary? = nil
    ) async throws {
        if options.verboseOutput == false {
            app.logger.logLevel = .warning
        }

        try migrateLegacyAppDirectoriesIfNeeded()

        let sitesDir = options.webClientDirectory.path + "/"
        let conditionLibrary = try library ?? RuleSetLibraryLoader.loadDefault()
        let campaignStore = CampaignStore(
            defaultLibrary: conditionLibrary,
            defaultName: options.campaignName,
            restorePersistedState: options.restorePersistedState,
            persistChanges: options.persistChanges
        )

        if options.verboseOutput {
            ServerDiagnostics.writeServingStaticFiles(sitesDir)
        }

        app.middleware.use(JoinPageRedirectMiddleware(campaignStore: campaignStore))
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
        try await DatabaseMigrations.verifyShape(on: app.db)
        let eventHub = CampaignEventHub()
        let activeCampaignEventHub = ActiveCampaignEventHub()
        try await campaignStore.configure(database: app.db)
        try await restoreActiveCampaignState(
            campaignStore: campaignStore,
            userStore: app.userStore,
            eventHub: eventHub,
            activeCampaignEventHub: activeCampaignEventHub,
            database: app.db
        )
        if options.verboseOutput {
            ServerDiagnostics.writeLoadedDefaultRuleset(conditionLibrary.label)
            ServerDiagnostics.writeConnectionLogs(await connectionLogPath())
        }
        await logServerEvent("startup host=\(options.hostname) port=\(options.port)")

        try routes(
            app,
            campaignStore: campaignStore,
            eventHub: eventHub,
            activeCampaignEventHub: activeCampaignEventHub
        )

        if options.launchBrowser {
            Task {
                // Give the HTTP listener a moment to bind before opening the browser.
                try? await Task.sleep(for: .milliseconds(400))
                BrowserLauncher.launchDisplayPage(
                    url: "http://localhost:\(options.port)/admin.html"
                )
            }
        }
    }
}
