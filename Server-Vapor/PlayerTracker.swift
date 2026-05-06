import Foundation
import Vapor

@main
struct Run {
    static func main() async throws {
        let app = try await Application.make(.detect())
        do {
            try await ServerBootstrap.configure(app)
            try await app.execute()
            try await app.asyncShutdown()
        } catch {
            try? await app.asyncShutdown()
            throw error
        }
    }
}
