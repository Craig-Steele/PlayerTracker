import Dispatch
import Vapor

func shutdownApplicationSynchronously(_ app: Application) {
    let semaphore = DispatchSemaphore(value: 0)
    Task {
        try? await app.asyncShutdown()
        semaphore.signal()
    }
    semaphore.wait()
}
