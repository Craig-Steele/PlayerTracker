import Testing
@testable import PlayerTracker

@Suite("Client Identity Middleware")
struct ClientIdentityMiddlewareTests {
    @Test("accepts and canonicalizes a valid client cookie")
    func acceptsValidClientCookie() {
        #expect(
            ClientIdentity.validClientID(from: "550e8400-e29b-41d4-a716-446655440000")
                == "550E8400-E29B-41D4-A716-446655440000"
        )
    }

    @Test("rejects malformed client cookies")
    func rejectsMalformedClientCookie() {
        #expect(ClientIdentity.validClientID(from: "not-a-uuid") == nil)
    }

    @Test("prefers a valid tab header over the browser cookie")
    func prefersValidHeader() {
        #expect(
            ClientIdentity.validClientID(
                headerValue: "550e8400-e29b-41d4-a716-446655440000",
                cookieValue: "6ba7b810-9dad-11d1-80b4-00c04fd430c8"
            ) == "550E8400-E29B-41D4-A716-446655440000"
        )
    }
}
