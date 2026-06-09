import Testing
@testable import PlayerTracker

@Suite("Server Diagnostics")
struct ServerDiagnosticsTests {
    @Test("startup messages format bootstrap output")
    func startupMessagesFormatBootstrapOutput() {
        #expect(
            ServerDiagnostics.servingStaticFilesMessage("/tmp/site/")
                == "Serving static files from: /tmp/site/"
        )
        #expect(
            ServerDiagnostics.loadedDefaultRulesetMessage("Pathfinder")
                == "Loaded default ruleset: Pathfinder"
        )
        #expect(
            ServerDiagnostics.connectionLogsMessage("/tmp/logs/connections.log")
                == "Connection logs: /tmp/logs/connections.log"
        )
    }

    @Test("browser launcher unavailable message is stable")
    func browserLauncherUnavailableMessageIsStable() {
        #expect(
            ServerDiagnostics.browserLauncherUnavailableMessage()
                == "No supported browser launcher is available for this platform."
        )
    }

    @Test("browser launch failed message includes the error description")
    func browserLaunchFailedMessageIncludesErrorDescription() {
        struct SampleError: Error, CustomStringConvertible {
            var description: String { "boom" }
        }

        #expect(
            ServerDiagnostics.browserLaunchFailedMessage(SampleError())
                == "Failed to launch display page: boom"
        )
    }
}
