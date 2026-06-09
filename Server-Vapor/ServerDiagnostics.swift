import Foundation

enum ServerDiagnostics {
    static func servingStaticFilesMessage(_ sitesDirectory: String) -> String {
        "Serving static files from: \(sitesDirectory)"
    }

    static func loadedDefaultRulesetMessage(_ rulesetLabel: String) -> String {
        "Loaded default ruleset: \(rulesetLabel)"
    }

    static func connectionLogsMessage(_ connectionLogPath: String) -> String {
        "Connection logs: \(connectionLogPath)"
    }

    static func browserLauncherUnavailableMessage() -> String {
        "No supported browser launcher is available for this platform."
    }

    static func browserLaunchFailedMessage(_ error: Error) -> String {
        "Failed to launch display page: \(error)"
    }

    static func writeServingStaticFiles(_ sitesDirectory: String) {
        print(servingStaticFilesMessage(sitesDirectory))
    }

    static func writeLoadedDefaultRuleset(_ rulesetLabel: String) {
        print(loadedDefaultRulesetMessage(rulesetLabel))
    }

    static func writeConnectionLogs(_ connectionLogPath: String) {
        print(connectionLogsMessage(connectionLogPath))
    }

    static func writeBrowserLauncherUnavailable() {
        fputs(browserLauncherUnavailableMessage() + "\n", stderr)
    }

    static func writeBrowserLaunchFailed(_ error: Error) {
        fputs(browserLaunchFailedMessage(error) + "\n", stderr)
    }
}
