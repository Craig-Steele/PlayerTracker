import Vapor

enum ClientIdentity {
    static let cookieName = "roll4_client_id"
    static let requestHeaderName = "X-Roll4-Client-ID"
    static let loggerMetadataKey = "client-id"

    static func validClientID(from cookieValue: String?) -> String? {
        guard let cookieValue,
              let uuid = UUID(uuidString: cookieValue) else {
            return nil
        }
        return uuid.uuidString
    }

    static func validClientID(headerValue: String?, cookieValue: String?) -> String? {
        validClientID(from: headerValue) ?? validClientID(from: cookieValue)
    }
}

/// Adds a stable, non-authenticated identifier to each request log.
///
/// The identifier is stored in a server-issued cookie rather than derived from
/// an auth/session token, so logs can correlate a browser without exposing a
/// credential. A new client receives the cookie on its first response.
final class ClientIdentityMiddleware: Middleware {
    private static let cookieLifetime = 60 * 60 * 24 * 365

    func respond(to request: Request, chainingTo next: Responder) -> EventLoopFuture<Response> {
        let existingCookieID = ClientIdentity.validClientID(from: request.cookies[ClientIdentity.cookieName]?.string)
        let clientID = ClientIdentity.validClientID(
            headerValue: request.headers.first(name: ClientIdentity.requestHeaderName),
            cookieValue: existingCookieID
        ) ?? UUID().uuidString
        request.logger[metadataKey: ClientIdentity.loggerMetadataKey] = .string(clientID)

        return next.respond(to: request).map { response in
            guard existingCookieID == nil else {
                return response
            }

            response.cookies[ClientIdentity.cookieName] = .init(
                string: clientID,
                maxAge: Self.cookieLifetime,
                isHTTPOnly: true,
                sameSite: .lax
            )
            return response
        }
    }
}
