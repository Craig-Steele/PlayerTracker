import XCTest
@testable import PlayerTracker

final class ServerDiagnosticsTests: XCTestCase {
    func testStartupMessagesFormatBootstrapOutput() {
        XCTAssertEqual(
            ServerDiagnostics.servingStaticFilesMessage("/tmp/site/"),
            "Serving static files from: /tmp/site/"
        )
        XCTAssertEqual(
            ServerDiagnostics.loadedDefaultRulesetMessage("Pathfinder"),
            "Loaded default ruleset: Pathfinder"
        )
        XCTAssertEqual(
            ServerDiagnostics.connectionLogsMessage("/tmp/logs/connections.log"),
            "Connection logs: /tmp/logs/connections.log"
        )
    }

    func testBrowserLauncherUnavailableMessageIsStable() {
        XCTAssertEqual(
            ServerDiagnostics.browserLauncherUnavailableMessage(),
            "No supported browser launcher is available for this platform."
        )
    }

    func testBrowserLaunchFailedMessageIncludesErrorDescription() {
        struct SampleError: Error, CustomStringConvertible {
            var description: String { "boom" }
        }

        XCTAssertEqual(
            ServerDiagnostics.browserLaunchFailedMessage(SampleError()),
            "Failed to launch display page: boom"
        )
    }
}
