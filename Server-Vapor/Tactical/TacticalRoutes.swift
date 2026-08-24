import Vapor

extension RoutesBuilder {
    func registerTacticalRoutes(
        campaignStore: CampaignStore,
        tacticalMapStore: TacticalMapStore
    ) {
        let tactical = grouped("tactical")

        tactical.get("health") { req async throws -> String in
            "ok"
        }

        tactical.get("map") { req async throws -> TacticalMapState in
            _ = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            return try tacticalMapStore.load()
        }

        tactical.get("map", "image") { req async throws -> Response in
            _ = try await requireActiveCampaignParticipantSession(
                req,
                campaignStore: campaignStore
            )
            let map = try tacticalMapStore.load()
            let imageURL = try tacticalMapStore.imageURL(for: map)
            let response = Response(status: .ok)
            response.headers.replaceOrAdd(name: .contentType, value: "image/png")
            response.body = .init(data: try Data(contentsOf: imageURL))
            return response
        }
    }
}
