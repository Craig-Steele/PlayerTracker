import Dispatch
import Vapor
import VaporTesting

typealias XCTApplicationTester = TestingApplicationTester

func quietTestLogging(for app: Application) {
    app.logger.logLevel = .warning
}

func shutdownApplicationSynchronously(_ app: Application) {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        try? await app.asyncShutdown()
        semaphore.signal()
    }
    semaphore.wait()
}

extension Application {
    func testable() throws -> TestingApplicationTester {
        try testing()
    }
}

extension TestingApplicationTester {
    func sendRequest(
        _ method: HTTPMethod,
        _ path: String,
        headers: HTTPHeaders = [:],
        body: ByteBuffer? = nil
    ) async throws -> TestingHTTPResponse {
        try await performTest(
            request: TestingHTTPRequest(
                method: method,
                url: URI(path: path),
                headers: headers,
                body: body ?? ByteBufferAllocator().buffer(capacity: 0)
            )
        )
    }
}
