import Vapor

private let playerSessionCookieName = "roll4_player_session"

struct JoinPageRedirectMiddleware: AsyncMiddleware {
    let campaignStore: CampaignStore

    func respond(to request: Request, chainingTo next: AsyncResponder) async throws -> Response {
        guard request.method == .GET else {
            return try await next.respond(to: request)
        }
        guard request.url.path == "/index.html" else {
            return try await next.respond(to: request)
        }
        guard request.query[String.self, at: "view"] == "player" else {
            return try await next.respond(to: request)
        }
        guard let token = request.cookies[playerSessionCookieName]?.string,
              let session = try await DatabasePersistence.loadPlayerSession(token: token, on: request.db),
              let activeCampaign = await campaignStore.activeCampaign() else {
            return try await next.respond(to: request)
        }

        let refereeSessionIDs = try await DatabasePersistence.loadCampaignRefereeSessionIDs(
            campaignID: activeCampaign.id,
            on: request.db
        )
        let destination = refereeSessionIDs.contains(session.id)
            ? "/referee.html"
            : "/player.html?view=player"
        return request.redirect(to: destination)
    }
}
