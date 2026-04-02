# InitiativeTrackerP2P

This scaffold splits the current `PlayerTracker` prototype into:

- `InitiativeCore`: rules, encounter state, player state, and deterministic turn progression.
- `InitiativeHostTransport`: host-side session contracts for a local iOS authority that browser clients can join.

Recommended product shape:

- iOS host app: owns the authoritative game state, advertises itself on the local network, and serves a browser client over HTTP/WebSocket.
- Browser client: joins from Android, iPhone, tablet, or desktop through a local URL or QR code.
- No hosted backend: all game traffic stays on the local network unless you later add relay support.

## Why this shape

True symmetric peer-to-peer across iOS and arbitrary browsers is the wrong constraint for this product:

- iOS-to-iOS native peer discovery is easy with `MultipeerConnectivity`, but browsers cannot join that mesh.
- Browser-friendly peer-to-peer implies WebRTC, which still needs signaling and is materially more complex on iOS if the device is also acting as the authority.
- A local host-authority model removes the hosted server while keeping join from Android and web browsers straightforward.

## Suggested repo layout

- `App/iOSHost`: SwiftUI app embedding the host runtime.
- `Packages/InitiativeCore`: shared game engine.
- `Packages/InitiativeHostTransport`: LAN transport, Bonjour advertisement, join code generation.
- `Web/player-client`: browser UI for players and spectators.

## First build milestones

1. Keep all current encounter and initiative logic inside `InitiativeCore`.
2. Add an iOS host runtime that serves `GET /session`, `GET /state`, and a WebSocket event stream on the local network.
3. Add Bonjour plus a QR code join URL like `http://192.168.1.25:8080/join/ABCD`.
4. Rebuild the current player/referee UI against the new local host APIs.
5. Add persistence so a host can recover a suspended encounter after app restart.

See [ARCHITECTURE.md](/Users/craig/Library/Mobile Documents/com~apple~CloudDocs/Programming/PlayerTracker/InitiativeTrackerP2P/ARCHITECTURE.md) for the concrete design.
