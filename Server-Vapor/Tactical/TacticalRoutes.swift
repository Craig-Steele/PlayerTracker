import Vapor

extension RoutesBuilder {
    func registerTacticalRoutes() {
        let tactical = grouped("tactical")

        tactical.get("health") { req async throws -> String in
            "ok"
        }
    }
}
