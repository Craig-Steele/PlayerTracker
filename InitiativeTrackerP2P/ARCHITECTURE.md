# Architecture

## Goal

Remove the hosted server while preserving one authoritative game state that any iOS device can host and any modern browser can join on the same local network.

## Recommended networking model

Use a local-authority host, not a fully symmetric mesh.

- Host: iPhone or iPad runs the game authority.
- Discovery: Bonjour on the local network, with QR/manual URL fallback.
- Transport: HTTP for snapshots and commands, WebSocket for live state updates.
- Clients: browser-based players on Android, desktop, iOS, or any other device with a modern browser.

This is peer-hosted, but not peer-authoritative. That distinction matters because it keeps conflict resolution, turn progression, and hidden-information rules simple.

## Host lifecycle constraint

If the host is an iPhone or iPad, the app should be treated as a foreground session host.

- The host device generally needs to stay awake, unlocked, and running the app in the foreground.
- If the device locks, iOS will usually suspend the app after a short grace period.
- Once suspended, the local HTTP/WebSocket server stops servicing clients.
- Browser clients will disconnect and should fall back to a reconnect flow.

This is the biggest operational limitation of an iOS-hosted local server design. It is workable for table play, but it is not equivalent to an always-on dedicated host.

## What happens if the host locks

Expected behavior:

- open browser clients lose their WebSocket connection
- commands like initiative updates or turn completion fail until reconnect
- the session becomes unavailable on the network while the app is suspended

Recovery depends on persistence:

- if session state is only in memory, an app termination can lose the encounter
- if session state is persisted locally, the host can restore the encounter when reopened and clients can reconnect to a fresh snapshot

You should design reconnect as a normal path, not an edge case.

## Why not pure WebRTC mesh

- Browsers need signaling anyway.
- Hidden referee state is harder to protect when state sync is distributed.
- Initiative ordering and turn advancement are simpler with one authority.
- Recovery after disconnect is easier with snapshot + event replay from one host.

## Core modules

### InitiativeCore

Owns:

- campaign metadata
- encounter state
- player/character records
- sorting and turn advancement
- visibility and reveal-on-turn rules
- persistence DTOs

Does not know about:

- Vapor
- WebSocket frameworks
- SwiftUI
- browser APIs

### InitiativeHostTransport

Owns:

- join tokens and session metadata
- command validation before mutating core state
- outbound event broadcasting
- host presence advertisement
- client connection bookkeeping

## API shape

Keep the browser contract narrow and versioned.

- `GET /api/v1/session`
  Returns host, campaign, ruleset, and join metadata.
- `GET /api/v1/state?view=player|referee`
  Returns a full snapshot.
- `POST /api/v1/commands`
  Accepts typed commands such as `upsertCharacter`, `renameOwner`, `completeTurn`.
- `GET /api/v1/ws`
  WebSocket upgrade for `snapshot`, `patch`, `event`, and `error` messages.

## Discovery

Primary:

- Bonjour service such as `_initiative._tcp`

Fallback:

- QR code with `http://<local-ip>:<port>/join/<code>`
- manual entry of host code or local IP

## Security expectations

Local-network only is not the same as trusted.

- Generate short join codes.
- Separate player and referee capabilities.
- Require a referee secret for hidden-state operations.
- Never expose hidden combatants or hidden stats in player snapshots.

## Persistence

Persist on the host:

- campaign config
- encounter state
- characters
- current turn cursor
- session secrets

Use append-safe local persistence so the host can recover after app suspension or termination.

Also persist enough join metadata to support reconnect:

- session ID
- join code
- last known campaign snapshot version

## Storage strategy

The default persistence choice should be local device storage, not cloud sync.

Reason:

- suspended encounters need fast and reliable restore
- active session recovery should not depend on third-party network reachability
- local storage is available on both iOS and Android

Cloud-backed storage is best treated as an optional convenience layer for restore across devices, not the primary authority for active multiplayer sessions.

## Storage matrix

### iOS local storage

Best for:

- suspended encounters
- campaign saves
- character libraries
- host preferences
- reconnect metadata

Implementation options:

- `Application Support` files
- SQLite
- `Core Data`
- `SwiftData`

Pros:

- simplest and most reliable host persistence
- no account dependency
- works offline
- best fit for fast save after every command

Cons:

- data does not automatically move to another device
- uninstall or device loss can remove saved data unless separately backed up

Recommendation:

- use this as the baseline persistence model for iOS hosting

### iCloud / CloudKit

Best for:

- host-owned saves that should follow the Apple user across devices
- archived or suspended campaigns
- preferences and lightweight player metadata

Pros:

- good Apple-platform restore story
- useful if a user hosts from multiple Apple devices
- reduces risk of device-loss-only persistence

Cons:

- Apple ecosystem specific
- not suitable as the primary shared backend for Android and web players
- adds sync/conflict/versioning complexity

Recommendation:

- make this optional and layered on top of local storage
- treat it as backup/sync for host-owned saves, not as the live session authority

### Android local storage

Best for:

- suspended encounters on Android-hosted games
- local campaign saves
- offline restore

Implementation options:

- `Room`
- SQLite
- internal app files

Pros:

- direct equivalent to the iOS local-storage model
- reliable and offline-friendly
- best default if Android hosting is added later

Cons:

- same limitation as iOS local storage: no automatic cross-device sync

Recommendation:

- if Android hosting is added, mirror the iOS local persistence model first

### Android backup / Google account restore

Best for:

- restoring lightweight app state after reinstall or device migration
- preferences
- small save metadata

Pros:

- native Android recovery path
- useful as a secondary restore layer

Cons:

- not a multiplayer backend
- not a fit for active authoritative game state
- practical limits make it less suitable than true app-managed sync for richer campaign data

Recommendation:

- treat this as optional backup/restore support, not core persistence architecture

## Recommended persistence boundary

Use three layers:

1. Active session authority
   Use in-memory host state plus frequent local durable saves.

2. Suspended session persistence
   Store full session snapshots locally on the host device.

3. Optional cross-device restore
   Add iCloud for Apple hosts and later add an Android-friendly restore layer if needed.

This keeps the product cross-platform while avoiding a design where core recovery depends on vendor-specific cloud storage.

## Mitigations for host lock/suspension

### 1. Foreground-only iOS host with anti-sleep UX

This is the simplest version and the one most likely to ship quickly.

- Disable idle sleep while hosting with `UIApplication.shared.isIdleTimerDisabled = true`.
- Show a clear host screen that makes it obvious the app must remain open.
- Auto-save after every mutating command.
- Make browser clients reconnect automatically and request a fresh snapshot.

Pros:

- least engineering complexity
- preserves the "any iOS device can host" goal
- fits a typical at-table session where one device remains in front of the referee

Cons:

- host availability still depends on the device staying unlocked
- accidental lock or app switching interrupts the session

Use this when:

- your priority is replacing the hosted server quickly
- you can accept brief interruptions if the host device is mishandled

### 2. Fast resume with durable local recovery

This does not prevent disconnects, but it makes them survivable.

Add:

- durable persistence after each command
- monotonic snapshot versioning
- client reconnect tokens
- automatic browser reconnect with exponential backoff

Recommended behavior:

- on reconnect, client requests `/api/v1/session`
- if the session ID matches, client fetches latest snapshot and resumes
- if the session ID changed, client returns to join flow

Pros:

- greatly reduces the cost of accidental lock/suspend events
- keeps the product simple and local-first
- no dedicated hardware required

Cons:

- still not seamless during suspension
- clients will observe a temporary outage

Use this when:

- the table can tolerate a short pause
- you want a robust v1 before investing in more infrastructure

### 3. Promote a different device to host

Instead of forcing iPhone-only hosting, define host-capable classes of devices.

Good candidates:

- Mac app host
- iPad in guided or kiosk-style use
- local desktop companion app

Pros:

- far more reliable session uptime
- larger screen is better for referee workflows
- still preserves browser join for players

Cons:

- weakens the strict "any iOS device can host equally well" promise
- adds another app target to build and support

Use this when:

- host stability matters more than universal hosting symmetry
- your users often already have a laptop or dedicated tablet at the table

### 4. Dedicated local host device

Move the authority to a small always-on device on the same LAN.

Examples:

- Mac mini
- Raspberry Pi class device
- travel router plus embedded service

The iOS app becomes a referee controller rather than the host process.

Pros:

- best local-network reliability
- iOS lock behavior stops mattering
- easiest path to long-lived sessions and game recovery

Cons:

- extra hardware and setup burden
- no longer "host from any iPhone" in the strict sense

Use this when:

- you want appliance-like reliability
- your audience is willing to trade simplicity of setup for robustness

### 5. Hybrid fallback to a relay or cloud save

Keep the normal mode local-first, but add optional remote support for recovery or continuity.

Variants:

- cloud snapshot backup only
- lightweight relay for reconnect/signaling
- full hosted authority fallback

Pros:

- provides continuity beyond local host failure
- can support remote players later

Cons:

- reintroduces backend complexity
- weakens the original "no hosted server" goal

Use this when:

- you want a migration path rather than a pure local-only product

## Recommended practical path

For a first serious version:

1. Ship a foreground-only iOS host.
2. Disable auto-lock while hosting.
3. Persist after every command.
4. Build reconnect and restore as a first-class flow.

That gets you most of the value with manageable complexity.

If host interruption proves too disruptive in real use, the next step should not be a WebRTC mesh. The next step should be a more reliable host class, usually a Mac or dedicated local host.

## Migration from the current prototype

Move first:

- `UserStore` logic into a transport-agnostic engine.
- `CampaignStore` into core state/persistence.
- `RuleSetLibrary` into a reusable ruleset loader with bundle/file adapters.

Replace:

- Vapor routing with host runtime adapters.
- server-IP discovery endpoint with Bonjour + QR flow.
- global singleton stores with injected session instances.

## Implementation order

1. Finish `InitiativeCore` and test turn/visibility semantics.
2. Build a local host runtime on iOS.
3. Add persistence, reconnect tokens, and snapshot versioning before polishing the UI.
4. Add browser join flow and WebSocket sync.
5. Port the current UI.
6. Validate whether iOS hosting is operationally good enough or whether a more stable host target is needed.
