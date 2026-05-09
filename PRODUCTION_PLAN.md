# Production Plan

This document captures the current product and engineering roadmap for taking Roll4Initiative from a local-network encounter tracker to a commercial product.

Commercial launch shape:

- paid server app
- distributed through Apple and Microsoft app stores
- licensed at a low annual price point, tentatively `$5/year`
- free iOS and Android companion clients
- the server remains the source of truth for encounter state

## Architecture Decision

Launch decision:

- keep Swift as the server-core language
- continue using the existing Vapor-based backend as the foundation
- optimize for platform-neutral server structure rather than a backend rewrite
- keep room for a separate desktop app shell later if Windows/Linux packaging needs it

Rationale:

- the current Swift codebase is already functional
- Swift is not currently causing delivery pain
- the near-term risk is architectural coupling, not language mismatch
- a rewrite would delay persistence, auth, ruleset versioning, and packaging work without solving the main product constraints

## Planning Constraints

These are cross-cutting constraints that affect architecture, API design, persistence, authentication, and client behavior.

### 1. Multiple Simultaneous Campaigns

The system must support multiple live campaigns at once, each with its own:

- ruleset
- characters
- encounter state
- turn order
- memberships

Impact:

- no globally current campaign model
- all gameplay state must be campaign-scoped
- all APIs must be campaign-aware

### 2. Durable Account Identity

A user must be able to reconnect from:

- Private Browsing
- a new browser
- a new phone
- a reinstall

Impact:

- authenticated server-side identity
- browser/device storage is convenience only
- ownership must come from authenticated session, not client-generated IDs
- account identity is scoped to the chosen server, not to a central Roll4Initiative cloud account

Launch authentication decision:

- use email/password accounts at launch
- plan for password reset as part of the initial auth system
- defer magic-link and social login until after the core account model is stable

### 3. Multiple Devices Per User

One account may be active on:

- phone
- tablet
- desktop browser

Impact:

- session model must support multiple devices
- server must handle concurrent edits sanely
- clients must refresh state reliably
- duplicate identity creation must be prevented

### 4. Campaign Membership and Role Model

A user may have different permissions in different campaigns, but referee behavior at launch is a session UX mode rather than a separate authorization role.

At minimum:

- player
- admin/owner

Likely later:

- spectator/read-only

Impact:

- membership permissions must be campaign-specific, not global
- any campaign player may enter referee mode for their current session
- referee mode is UX-only at launch, not a separate permission boundary
- the system needs session-presence tracking so both the referee view and display view can show which players are currently using referee mode

### 5. Invitation and Onboarding Flow

Joining a campaign must be simple enough for normal users.

Likely join paths:

- invite link
- invite code
- QR join flow

Impact:

- campaign membership lifecycle must exist early
- auth and campaign selection must work together
- invite acceptance should not feel bolted on

### 6. Real-Time Synchronization Strategy

Commercial users will expect updates faster and more reliably than simple polling often provides.

Decision:

- standardize on Server-Sent Events for server-to-client live updates
- keep ordinary HTTP writes for client-to-server mutations
- treat polling as a fallback path only where SSE is unavailable or temporarily degraded

Impact:

- turn changes
- HP/condition updates
- campaign switching
- multi-device consistency

Implementation direction:

- publish campaign-scoped event streams
- authenticate SSE connections the same way as normal app requests
- keep event payloads lightweight and versionable
- continue to support explicit reload/reconnect behavior after disconnects

### 7. Concurrency and Conflict Handling

Two clients may edit the same entity at once.

Launch decision:

- use last-write-wins for concurrent writes
- prefer small, targeted mutations over large broad replacement payloads where practical
- rely on audit/activity history to explain overwrites

This policy applies to:

- character edits
- campaign settings
- turn state
- conditions

Impact:

- persistence schema
- API contracts
- client UX when stale data is edited
- audit/event log importance increases because overwritten changes must remain explainable

### 8. Offline / Degraded-Network Behavior

Table play often happens on imperfect Wi-Fi.

Launch decision:

- online-only with graceful failure
- allow cached last-known read state during disconnects where practical
- block writes while disconnected
- require reconnect and resync before mutations resume

Impact:

- mobile client architecture
- sync semantics
- support burden

Implementation direction:

- show stale/disconnected state explicitly in clients
- keep reconnect/resync fast and reliable after suspension or transient network loss
- do not queue offline writes at launch
- treat offline mutation support as a later product decision, not an accidental side effect

### 9. Audit and Activity History

Commercial support and GM trust improve if the system can answer:

- who changed this
- when did it change
- what changed

Impact:

- audit/event log model
- support tooling
- possible player-facing history later

### 10. Data Portability, Retention, and Deletion

Paid users will eventually expect:

- export of campaign data
- encounter cloning and reusable encounter templates
- archive/restore of old campaigns
- account deletion
- backups

Impact:

- soft-delete vs hard-delete decisions
- archival model
- export format design
- encounter snapshot/template format design
- operational policy

### 11. Ruleset Extensibility

Launch decision:

- custom rulesets
- only paid admins may upload custom rulesets for their own homebrew systems
- built-in rulesets shipped with the product must be limited to content you are licensed to provide
- campaign-specific ruleset selection must support both built-in and user-uploaded rulesets
- uploaded rulesets belong to the admin account that uploaded them and can be assigned by that admin to new campaigns
- ruleset updates create new versions rather than mutating old ones in place
- new ruleset versions must remain structurally compatible with prior versions for the same ruleset family
  - dice and stats remain stable
  - condition lists may change

Possible later extensions:

- house-rule variants
- campaign-specific overrides
- versioned rulesets

Impact:

- schema design
- campaign/ruleset association
- ruleset ownership and reuse model
- admin tooling
- import and validation tooling
- moderation/support boundary for user-supplied content

### 12. Billing and Entitlements

Launch billing decision:

- sell the server on a low-cost annual license, tentatively `$5/year`
- distribute the paid server through Apple and Microsoft storefronts
- keep iOS and Android clients free
- tie entitlement to the server installation or store purchaser, not to each player account
- do not introduce launch caps on campaign count, archive count, or player count
- if the license expires, preserve read/export access and block starting new hosted sessions until renewal
- if store validation is temporarily unavailable, preserve a grace period rather than interrupting active play

Impact:

- entitlements model
- store receipt / purchase validation
- server install identity
- renewal and grace-period UX
- app-store policy compliance

### 13. Support and Admin Operations

Commercial software needs internal controls:

- inspect accounts/campaigns
- revoke sessions
- recover accounts
- restore data
- handle abuse

Impact:

- admin APIs/tools
- audit logging
- data model visibility boundaries

## App Data Layout

The packaged server app needs a predictable local data layout on macOS, Windows, and Linux so upgrades, backups, exports, and support operations are straightforward.

### Layout Goals

- keep the main transactional state in one SQLite database
- keep large user-supplied artifacts such as ruleset uploads and exports as files on disk
- separate shipped built-in assets from mutable application data
- make backup and restore possible without reverse-engineering the install layout
- avoid storing critical mutable state inside the app bundle

### OS-Specific Base Directory

Use a per-user application-data root by default.

macOS:

- `~/Library/Application Support/Roll4Initiative`

Windows:

- `%LOCALAPPDATA%\\Roll4Initiative`

Linux:

- `${XDG_DATA_HOME:-~/.local/share}/roll4initiative`

If a future edition supports multi-user hosting or a system service install, add an explicit configurable data root. The app should still default to the per-user path above.

### Top-Level Directory Shape

Suggested layout:

```text
Roll4Initiative/
  data/
    app.sqlite3
    app.sqlite3-wal
    app.sqlite3-shm
  rulesets/
    builtins/
    custom/
  uploads/
    ruleset-imports/
  exports/
    campaigns/
    rulesets/
  backups/
  logs/
  cache/
  receipts/
  config/
```

### Directory Responsibilities

`data/`

- primary SQLite database
- authoritative source for accounts, campaigns, memberships, sessions, characters, turn state, conditions, and audit history

`rulesets/builtins/`

- immutable built-in ruleset manifests and assets shipped with the app
- copied or materialized from app resources on first launch or upgrade if needed
- never edited in place by users

`rulesets/custom/`

- validated custom ruleset packages owned by local server admins
- each ruleset gets its own stable directory and version subdirectories
- stored separately from the database so image assets and future larger attachments stay manageable

Suggested shape:

```text
rulesets/custom/
  <ruleset-slug>/
    metadata.json
    versions/
      v1/
        manifest.json
        assets/
      v2/
        manifest.json
        assets/
```

`uploads/ruleset-imports/`

- temporary staging area for newly imported ruleset ZIPs or folders
- safe place for validation before promoting a ruleset into `rulesets/custom/`
- old staging artifacts should be cleaned automatically

`exports/`

- user-triggered exports only
- campaign export bundles
- ruleset export bundles
- not authoritative storage

`backups/`

- scheduled or manual SQLite backups
- optional compact snapshots for fast restore
- retention policy should be configurable later

`logs/`

- app logs
- request/access logs if enabled
- import/validation logs for ruleset failures
- logging should use injectable services or app-scoped dependencies so tests and packaged builds can select no-op, file, or deployment log sinks
- file-backed logging must use a deliberate write strategy, either deployment-managed SwiftLog sinks or an actor-owned file writer with bounded resource use
- structured log fields must be escaped or encoded so player names, character names, request paths, and user-supplied metadata cannot break line-oriented parsing

`cache/`

- non-authoritative derived data only
- rendered previews, normalized JSON caches, temporary packaging output

`receipts/`

- cached store receipts or validation state where platform policy allows it
- this directory must not become the sole proof of entitlement; it is a convenience cache only

`config/`

- small local configuration files that are installation-specific rather than campaign-specific
- examples: chosen port, LAN exposure preference, optional external hostname, backup preferences

### What Goes in SQLite

SQLite should hold the relational and transactional model:

- `users`
- `sessions`
- `campaigns`
- `campaign_memberships`
- `rulesets`
- `ruleset_versions`
- `campaign_ruleset_bindings`
- `characters`
- `character_stats`
- `character_conditions`
- `encounters`
- `turn_state`
- `presence_sessions`
- `audit_events`
- `invite_tokens`

SQLite should also hold pointers to file-backed assets:

- custom ruleset manifest path
- custom ruleset asset root
- exported bundle metadata
- backup metadata

Temporary hit points are not a separate top-level field in the server model for launch. They are represented as a normal `character_stats` row with `stat_key = "TempHP"` and `max_value = 0`, and clients treat them as a special-case stat when rendering health.

The database should not store large binary assets directly at launch unless a later requirement clearly justifies it.

### Ruleset Data Model

Built-in and custom rulesets should share one logical model:

- `ruleset`
  - stable internal ID
  - slug
  - display name
  - source type: `builtin` or `custom`
  - owner user ID for custom rulesets
  - created/updated timestamps
- `ruleset_version`
  - version ID
  - parent ruleset ID
  - semantic or monotonic version label
  - manifest path
  - compatibility family
  - import checksum
  - published/archived status

Design rules:

- campaigns bind to a specific ruleset version, not just to a ruleset slug
- built-in rulesets are read-only entries
- custom ruleset updates create a new version row and a new version directory
- old versions remain available for campaigns already using them
- validation happens before a version becomes selectable by campaigns

### Campaign Data Model

Campaign state should live primarily in SQLite and be exportable as a bundle.

Minimum persisted entities:

- campaign metadata
  - campaign ID
  - name
  - selected ruleset version
  - archive state
  - created/updated timestamps
- memberships
  - user ID
  - campaign ID
  - role
- encounter state
  - active/suspended/new
  - round index
  - turn index
  - active character ID
- encounter templates and snapshots
  - campaign-scoped snapshots
  - ruleset-scoped templates
- audit/activity history

Suggested export shape:

```text
campaign-export/
  manifest.json
  campaign.json
  memberships.json
  characters.json
  encounters.json
  snapshots.json
  audit.json
  referenced-ruleset/
```

### Player State Model

Player state splits into three categories.

Authoritative shared player state in SQLite:

- player account
- campaign membership
- owned characters
- character stats
- conditions
- initiative values
- reveal flags
- referee-mode presence for active sessions

Per-install local server state on disk:

- login/session configuration for the web admin shell if needed
- receipt cache
- local backup preferences
- port/bind settings

Per-client state stays on the clients, not in the server app data root:

- remembered server URLs
- mobile auth tokens
- client UI drafts
- client-side caches

### Import, Export, and Backup Flow

Ruleset import:

1. place uploaded bundle in `uploads/ruleset-imports/`
2. validate manifest and assets
3. assign ruleset/version IDs in SQLite
4. move validated files into `rulesets/custom/...`
5. record immutable version metadata

Campaign export:

1. read campaign and dependent entities from SQLite
2. copy referenced custom ruleset version if needed
3. write export bundle into `exports/campaigns/`

Backup:

1. checkpoint SQLite WAL if appropriate
2. create a consistent DB backup
3. optionally include custom ruleset directories and config files
4. record backup metadata in SQLite or a backup manifest

### Packaging Notes

Built-in rulesets should ship as app resources, but mutable state must always live under the data root above.

For the desktop/server app:

- app upgrades must not overwrite `data/`, `rulesets/custom/`, `exports/`, or `backups/`
- the app should detect missing built-in ruleset resources and rehydrate them safely
- the app should expose the active data-root path in a diagnostics or settings screen for support

## Reframed Roadmap

### Phase A: Foundation

- `M1` Server decomposition complete
- `M2` Persistence foundation
- `M3` Multi-campaign architecture

Constrained by:

- multiple simultaneous campaigns
- future ruleset extensibility
- export/retention

### Phase B: Identity and Access

- `M4` Accounts and sessions
- `M5` Authorization and ownership rewrite
- `M6` Campaign invites and memberships

Constrained by:

- durable account identity
- multiple devices per user
- campaign role model
- onboarding/invite flow
- support/admin needs
- per-server account model rather than a global SaaS account system

### Phase C: Client Migration

- `M7` Web migration
- `M8` iOS migration
- `M9` Android migration

Constrained by:

- Private Browsing compatibility
- multi-device session behavior
- campaign switching UX
- degraded-network behavior
- SSE client support and reconnect behavior
- Apple TV/tvOS may be a future display-only client, but not a stable server target because the server needs long-lived uptime and tvOS background behavior is too constrained for that role

### Phase D: Transition and Hardening

- `M10` Legacy anonymous migration
- `M11` Commercial security and operations
- `M12` Testing and release readiness

Constrained by:

- audit/history
- data retention/export
- billing/entitlements
- concurrency/conflict policy
- support/admin tooling
- app-store packaging and license validation

## Milestones

### M1: Server Decomposition

Status: complete

Goal: make the backend changeable without piling more logic into `Server-Vapor/PlayerTracker.swift`.

Work:

- extract route registration from `PlayerTracker.swift`
- extract DTOs/models into separate files
- extract `UserStore`
- extract `CampaignStore`
- isolate static file serving/bootstrap from domain logic
- extract platform services for browser launch, app-data path resolution, and future packaging hooks
- ensure core server startup can run without macOS-only assumptions

Acceptance:

- app still runs with `swift run`
- no product behavior change
- `PlayerTracker.swift` becomes thin startup/config code
- core server runtime is platform-neutral even if packaging remains platform-specific

### M2: Persistence Foundation

Status: complete

Goal: move from in-memory/local-file authority to durable app-friendly persistence.

Work:

- add Fluent + SQLite in `Package.swift` for the default packaged-server path
- keep the storage layer abstract enough that PostgreSQL can remain a future advanced/self-hosted option if needed
- add DB configuration in server bootstrap
- create migrations for:
  - `users`
  - `sessions`
  - `campaigns`
  - `campaign_memberships`
  - `characters`
  - `character_stats`
  - `character_conditions`
  - `campaign_encounters` or equivalent turn/encounter state table

Acceptance:

- fresh DB migration works
- campaign and character data can be persisted
- packaged server builds can persist data without requiring users to provision PostgreSQL

Schema hardening note:

- the M2 schema is intentionally pragmatic so the persistence foundation can land cleanly
- relational hardening, stricter campaign scoping, and auth/session ownership constraints are split into M3 and M4

### M3: Multi-Campaign Architecture

Goal: support multiple live campaigns at once without overwriting one another.

Work:

- remove the notion of one globally current campaign as the server's authoritative model
- make encounter state campaign-scoped
- make turn state campaign-scoped
- make character queries campaign-scoped
- make ruleset selection campaign-scoped
- make memberships campaign-scoped

Required model direction:

- `campaigns`
- `campaign_memberships`
- `characters.campaign_id`
- `encounter_state.campaign_id`

Route direction:

- move away from implicit global routes like `/campaign` and `/state`
- toward campaign-aware routes like:
  - `/campaigns/:campaignId`
  - `/campaigns/:campaignId/state`
  - `/campaigns/:campaignId/characters`

Acceptance:

- two campaigns can exist concurrently
- each campaign has independent round/turn/encounter/ruleset
- one user can belong to multiple campaigns
- switching campaigns does not mutate another campaign's state
- campaign relational constraints are tightened here, after the M2 persistence foundation is in place

### M4: Accounts and Sessions

Goal: introduce durable authenticated identity within each licensed server.

Work:

- add `User` model
- add `Session` model
- add password hashing
- implement email/password signup and login as the launch auth method
- add auth endpoints:
  - `POST /auth/signup`
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/session`
  - password reset endpoints once `M11` hardening begins

Web auth:

- cookie-based sessions
- `HttpOnly`, `Secure`, `SameSite=Lax`

Mobile auth:

- token or session bootstrap model, but still backed by the same server-side session concept
- login is against the chosen server, not a global Roll4Initiative identity service

Acceptance:

- user can sign up, log in, restore session, and log out
- identity no longer depends on local `ownerId`
- the initial auth system is explicitly email/password on a per-server basis, not passwordless or social login
- auth/session ownership constraints are tightened here, after the M2 persistence foundation is in place

### M5: Authorization and Ownership Rewrite

Goal: stop trusting the client to say who owns what.

This is the biggest behavioral change.

Work:

- derive current user from session on the server
- remove client authority over `ownerId`
- convert player routes to authenticated account routes:
  - `GET /me`
  - `PATCH /me`
  - `GET /campaigns/:campaignId/me/characters`
  - `POST /campaigns/:campaignId/me/characters`
  - `PATCH /campaigns/:campaignId/me/characters/:id`
  - `DELETE /campaigns/:campaignId/me/characters/:id`
- add membership enforcement for:
  - player
  - admin
- define which campaign operations are available to any authenticated campaign member versus campaign admins
- add session-mode tracking so a logged-in campaign member can enter or leave referee mode without changing stored membership
- define referee-facing encounter cloning/template operations so any campaign member currently in referee mode can use them
- define referee-mode concurrency as fully equal control among campaign members currently using referee mode
- define encounter snapshot creation and restore operations as referee manual actions

Acceptance:

- players can edit only their own characters
- campaign members can switch into referee mode for their current session without changing account roles
- the server can surface which campaign members are currently in referee mode
- display-oriented clients can render the current referee(s) from that presence data
- referee-facing encounter cloning/template operations are defined separately from full campaign export and are available to campaign members currently in referee mode
- campaign members concurrently in referee mode have fully equal control
- encounter snapshots are created manually by referee-mode users rather than automatically at launch
- all ownership comes from server session + campaign membership
- no gameplay write route trusts raw client identity

### M6: Campaign Creation, Invites, and Membership Management

Goal: make campaigns usable as a product, not just local state.

Work:

- add campaign creation
- add campaign membership permissions per campaign
- add campaign archive and unarchive support
- add encounter cloning and template support for referee-facing workflows
- make encounter templates ruleset-scoped so they can be reused by any campaign using the same ruleset
- retain the last 20 manually created encounter snapshots per campaign for restore/testing purposes
- add invite flow:
  - `POST /campaigns/:campaignId/invites`
  - `POST /invites/:token/accept`
- add campaign list route:
  - `GET /me/campaigns`

Acceptance:

- users can create and join multiple campaigns
- permissions are enforced per campaign
- campaign members can enter referee mode without changing membership records
- the referee UI can show the set of players currently acting in referee mode
- the display UI can show the current referee(s) for the active campaign/session
- campaign members currently in referee mode can clone encounters and create or apply reusable encounter templates inside a campaign
- encounter templates are reusable across campaigns that use the same ruleset
- the last 20 manually created encounter snapshots are retained per campaign
- no launch behavior depends on subscription plan caps or active-campaign counting

### M6A: Server-Sent Events Real-Time Layer

Goal: replace the current polling-first model with campaign-scoped server push.

Work:

- add authenticated SSE endpoints for campaign-scoped event streams
- define event types for:
  - encounter state changes
  - turn changes
  - character updates
  - condition changes
  - campaign metadata changes
  - referee-mode presence changes
- add reconnect semantics using event IDs or equivalent resume logic where useful
- keep polling as a fallback path during migration and failure handling
- make emitted payloads stable enough for all three clients to consume

Acceptance:

- web can subscribe to live campaign updates without polling as the primary mechanism
- iOS and Android can consume the same event model
- disconnect/reconnect behavior is understood and implemented
- ordinary writes still use normal HTTP endpoints
- display clients can receive current-referee presence updates in real time

### M7: Web Client Migration

Goal: move the browser client from local identity to authenticated, multi-campaign identity.

Current problem areas live in `Client-Web/app.js`:

- `localStorage.playerId`
- `localStorage.ownerName`
- owner-based character fetch/save
- implicit single-campaign assumptions

Work:

- add auth bootstrap flow
- add session restore flow
- replace local `ownerId` identity with server `/auth/session` + `/me`
- add campaign chooser
- add SSE subscription lifecycle for the selected campaign
- update the display web experience to show the current referee(s)
- switch all character operations to campaign-scoped authenticated routes
- keep local storage only for UI drafts and optional convenience state

Acceptance:

- Private Browsing reconnect works via login
- campaign switching is explicit
- web no longer depends on persistent browser identity for ownership
- live state updates arrive via SSE in normal operation
- display mode surfaces the current referee(s)

### M8: iOS Migration

Goal: convert iOS from device identity to account identity.

Touchpoints:

- `Client-iOS/PlayerTrackeriOS/PlayerAppModel.swift`
- `Client-iOS/PlayerTrackeriOS/APIClient.swift`
- `Client-iOS/PlayerTrackeriOS/SettingsViews.swift`

Work:

- add auth API calls
- add login/signup/logout/session restore flow
- replace `ownerId` persistence as primary identity
- add campaign selection
- add SSE client handling for selected campaign updates
- store session securely in Keychain-backed storage

Acceptance:

- user can sign in and recover all campaigns/characters
- same user can switch between campaigns on iPhone
- account identity survives app reinstall if credentials/session are re-entered
- live state updates arrive via SSE in normal operation

### M9: Android Migration

Goal: same as iOS, with parity.

Touchpoints:

- `Client-Android/app/src/main/java/com/roll4initiative/android/ui/PlayerAppViewModel.kt`
- `Client-Android/app/src/main/java/com/roll4initiative/android/api/ApiService.kt`
- Compose auth/campaign UI

Work:

- add auth API calls
- add login/signup/logout/session restore
- remove `ownerId` as primary identity
- add campaign chooser
- add SSE client handling for selected campaign updates
- move auth state into secure storage

Acceptance:

- Android becomes a real account-based client
- users can move between campaigns without losing ownership continuity
- live state updates arrive via SSE in normal operation

### M10: Legacy Anonymous Migration

Goal: transition current users cleanly.

Work:

- use a hard cutover from anonymous identity to account-based identity
- remove anonymous write access when authenticated identity ships
- communicate that pre-release anonymous identities are not migrated forward

Acceptance:

- migration policy is explicit
- legacy mode does not remain a hidden source of ownership bugs

### M11: Commercial Security and Operations

Goal: make the paid server app safe to distribute and practical to operate.

Work:

- implement annual server-license entitlement checks through store receipts or the store account model available on each platform
- add a grace-period model so temporary receipt-validation failures do not interrupt active sessions
- define expiry behavior:
  - preserve read/export access
  - block starting new hosted sessions until renewed
- password reset
- optional email verification
- rate limiting on auth routes
- CSRF protection for cookie-based web auth
- audit logging
- request/access logging with field sanitization and configurable sinks
- session management
- packaged backup/export and restore flows for local server data
- local-LAN HTTP support remains acceptable for same-network play
- HTTPS is required only for intentional internet exposure or remote-access scenarios
- account deletion/export support

Acceptance:

- license status is enforced without adding player-account subscriptions
- expiry behavior is predictable and does not trap user data
- core auth operations are hardened
- operations and recovery are realistic for a commercially distributed server app

### M12: Testing and Release Readiness

Goal: make it shippable.

Work:

- server tests for auth, authorization, campaign scoping, and ownership
- route tests for per-campaign access
- client tests for auth bootstrap and campaign switching
- end-to-end tests for:
  - sign up
  - create/join two campaigns
  - create characters in both
  - clone an encounter and apply a reusable encounter template in a campaign
  - logout
  - log back in
  - recover both campaign states

Acceptance:

- multi-campaign + auth behavior is covered
- reconnect no longer depends on browser/device-local identity

## Recommended Order

1. `M1`
2. `M2`
3. `M3`
4. `M4`
5. `M5`
6. `M6`
7. `M6A`
8. `M7`
9. `M8`
10. `M9`
11. `M10`
12. `M11`
13. `M12`

## Why This Order

The real product foundation is:

- persistent storage
- campaign-scoped state
- authenticated users
- server-side authorization

If that order is inverted, the same APIs and models will need to be rebuilt twice.

## First Real Build Slice

If the goal is the smallest serious commercial slice, start with:

1. `M1`
2. `M2`
3. `M3`
4. minimal `M4`
5. minimal `M5`
6. minimal `M6A`
7. minimal `M7`

That yields:

- a DB-backed server
- simultaneous campaigns
- account login
- SSE-based live updates
- authenticated web client
- no dependence on browser-local identity

That is the first version that starts looking like a product instead of a LAN tool.

## Early Product Decisions

All high-impact launch product decisions listed here have now been made.

The real-time sync decision is already made:

- use Server-Sent Events as the primary live update mechanism

The launch authentication decision is already made:

- use email/password accounts
- include password reset in the commercial auth plan
- defer magic-link and social login for later evaluation
- accounts are scoped to a chosen server, not a central SaaS identity system

The launch campaign mode decision is already made:

- membership permissions at launch are `player` and `admin`
- referee is a UX mode, not a separate authorization role
- any campaign member may enter referee mode for their current session
- the referee view should show which campaign members are currently using referee mode
- display mode should also show the current referee(s)

The launch billing decision is already made:

- sell the server app on an annual license, tentatively `$5/year`
- distribute the paid server through Apple and Microsoft storefronts
- keep iOS and Android player clients free
- do not introduce launch caps for campaign count or player count
- on expiry, preserve read/export access and block new hosted sessions until renewal
- use a grace period so receipt-validation problems do not interrupt play

The launch offline behavior decision is already made:

- launch as online-only
- allow cached last-known read state during disconnects where practical
- block writes while disconnected until reconnect and resync complete
- do not support offline write queuing at launch

The launch ruleset decision is already made:

- support custom rulesets as a product feature
- only paid admins may upload custom rulesets for their own homebrew systems
- ship built-in rulesets only where you have the necessary license to provide that content
- uploaded rulesets belong to the admin account that uploaded them and can be assigned by that admin to new campaigns
- ruleset updates create new versions rather than mutating old ones in place
- new versions must preserve structural compatibility, with stable dice/stats and changeable condition lists

The launch encounter-template decision is already made:

- encounter templates are ruleset-scoped
- any campaign using the same ruleset can use those templates

The launch snapshot/restore decision is already made:

- snapshots are a referee manual action at launch
- retain the last 20 snapshots per campaign
- keep retention policy under evaluation during testing

The launch referee-mode concurrency decision is already made:

- campaign members currently in referee mode have fully equal control

The launch conflict policy decision is already made:

- use last-write-wins for concurrent writes
- keep mutations targeted where practical
- depend on audit/activity history to make overwrites explainable

The launch migration decision is already made:

- use a hard cutover from anonymous identity to account-based identity
- do not provide a legacy claim/migration flow for pre-release anonymous users

The next feature-planning priorities are:

- launch-critical: ruleset upload validation and immutable versioning for user-supplied rulesets
- high-value near-term: encounter templates/cloning
- high-value near-term: undo/restore from encounter snapshots
- later portability feature: character import/export
- later portability feature: campaign export bundle

## Highest-Leverage Constraints

The most important constraints to design for now are:

- multiple simultaneous campaigns
- multiple devices per user
- campaign-scoped authorization
- invite/join flow
- concurrency/conflict policy
- audit history

These are the most likely to force expensive rework if ignored.

Audit visibility decision:

- audit/history is visible to campaign admins
