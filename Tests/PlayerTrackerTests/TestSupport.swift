import Dispatch
import Vapor

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
