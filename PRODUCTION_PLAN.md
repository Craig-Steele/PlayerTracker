# Production Plan

This document captures the current product and engineering roadmap for taking PlayerTracker from a local-network encounter tracker to a commercial product.

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

### 1. Multiple Stored Campaigns, One Active Campaign

The system must support multiple stored campaigns, with exactly one active campaign at a time, each with its own:

- ruleset
- characters
- encounter state
- turn order
- memberships

Impact:

- no globally shared gameplay state across campaigns
- all gameplay state must be campaign-scoped
- all gameplay APIs must resolve against the active campaign
- the admin must be able to switch which campaign is active

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
- account identity is scoped to the chosen server, not to a central PlayerTracker cloud account

Launch authentication decision:

- use a local server-owner/admin account at launch
- keep the server-owner/admin account separate from player membership; admin login does not create a player identity
- the server-owner/admin account does not need a display name
- use campaign-local display names for players on the local server
- let players reclaim unclaimed characters previously tied to the same display name when they reconnect
- use name-based campaign entry on the local server, with admin/referee-managed membership for invite-only campaigns
- defer email/password, magic-link, and social login until the core local identity model is proven

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

A user may have different permissions in different campaigns, and referee is a campaign-scoped role granted to one or more designated players in that campaign.

At minimum:

- player
- admin/owner
- referee

Likely later:

- spectator/read-only

Impact:

- membership permissions must be campaign-specific, not global
- the server-owner/admin account is not itself a campaign player account
- referee is a superset of player, not a separate global account type
- only campaign members designated as referees can open the referee view for that campaign
- the system needs session-presence tracking so both the referee view and display view can show which designated referee(s) are currently connected

### 5. Invitation and Onboarding Flow

Joining a campaign must be simple enough for normal users.

Likely join paths:

- direct name-based join after an admin or referee adds the player to the campaign
- optional invite-link/QR helpers if we still want them later
- display-name join/reclaim flow

Impact:

- campaign membership lifecycle must exist early
- auth and campaign selection must work together
- campaign admission and character reclaim should not feel bolted on

### 6. Real-Time Synchronization Strategy

Commercial users will expect updates faster and more reliably than simple polling often provides.

Decision:

- standardize on Server-Sent Events for server-to-client live updates
- keep ordinary HTTP writes for client-to-server mutations
- treat polling as a fallback path only where SSE is unavailable or temporarily degraded

Impact:

- turn changes
- HP/condition updates
- active-campaign changes
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

Commercial support and referee trust improve if the system can answer:

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

- `~/Library/Application Support/TacticalTableTop/Initiative`

Windows:

- `%LOCALAPPDATA%\\TacticalTableTop\\Initiative`

Linux:

- `${XDG_DATA_HOME:-~/.local/share}/TacticalTableTop/Initiative`

If a future edition supports multi-user hosting or a system service install, add an explicit configurable data root. The app should still default to the per-user path above.

Current implementation note:

- the server already supports an application-scoped app-data override for tests and alternate packaging paths
- the default app-data root is still platform-specific and currently feeds `data/`, `userdata/`, and SQLite paths from one base directory
- logs currently live under the per-user logs directory for each platform, not inside the app bundle

### Top-Level Directory Shape

Suggested layout:

```text
TacticalTableTop/
  Initiative/
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
- referee-role presence for active sessions

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

- multiple stored campaigns with one active campaign at a time
- future ruleset extensibility
- export/retention

### Phase B: Identity and Access

- `M4` Accounts and sessions
- `M5` Authorization and ownership rewrite
- `M6` Campaign membership and onboarding

Constrained by:

- durable account identity
- multiple devices per user
- campaign role model
- onboarding and campaign membership flow
- support/admin needs
- per-server account model rather than a global SaaS account system

### Phase C: Client Migration

- `M7` Web migration
- `M8` iOS migration
- `M9` Android migration

Constrained by:

- Private Browsing compatibility
- multi-device session behavior
- active-campaign UX
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

Status: complete

Goal: support multiple stored campaigns, with one active campaign at a time, without overwriting one another.

Work:

- remove the notion of an implicit globally current campaign as the server's authoritative runtime state
- make active-campaign selection explicit and admin-controlled
- extract campaign admin controls from the referee page into a separate admin surface
- support server-global active-campaign selection with explicit `Select Campaign` confirmation
- mirror the admin surface across browsers so they show the same active campaign and switching controls
- do not persist the active-campaign selection across restart
- on startup, preselect the last active campaign if it still exists, otherwise show the campaign list with no selection
- if there are no campaigns, start in the create-campaign flow
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

Client transition scope:

- update the web client in M3 so it can select and bind to a campaign explicitly through that admin surface
- keep the admin browser as a status/control surface after selection, with a `Change Campaign` action
- keep the legacy `/campaign` and `/state` flows as compatibility shims during the transition
- defer iOS and Android client updates until a later milestone

Acceptance:

- multiple campaigns can exist concurrently in storage
- exactly one campaign is active at a time for play
- the admin can switch which campaign is active by selecting a campaign and confirming with `Select Campaign`
- the admin browser mirrors the same active-campaign state across browsers
- the admin browser shows the active campaign and a `Change Campaign` action after selection
- if the server has no campaigns, the chooser starts in the create-campaign flow
- if the server has campaigns but no active selection, the chooser starts with no selection
- if the previously active campaign still exists on startup, it is preselected in the chooser
- active-campaign selection does not persist across restart
- the referee page remains focused on active-campaign gameplay
- the admin surface handles campaign activation; players only join the active campaign
- each campaign has independent round/turn/encounter/ruleset
- one user can belong to multiple campaigns
- switching the active campaign does not mutate another campaign's state
- players cannot join until an active campaign exists
- legacy routes return `No campaign selected` when there is no active campaign
- campaign relational constraints are tightened here, after the M2 persistence foundation is in place
- web client admin controls can select and bind the active campaign end to end against the new campaign model
- iOS and Android remain on the legacy flow until a later milestone

### M4: Accounts and Sessions

Status: complete

Goal: introduce durable local server-owner identity and session handling within each licensed server.

Work:

- add `User` model for the server owner/admin
- add `Session` model
- add password hashing
- implement server-owner signup and login as the launch auth method
- add lightweight local player join/session bootstrap for campaign membership keyed by a stable campaign-local player session with a mutable display name
- add rename support that changes only the display name, not the underlying player identity
- add auth endpoints:
  - `POST /auth/signup`
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/session`
  - password reset endpoints once `M11` hardening begins, if the final product model needs them

Web auth:

- cookie-based sessions
- `HttpOnly`, `Secure`, `SameSite=Lax`

Mobile auth:

- token or session bootstrap model, but still backed by the same server-side session concept
- login is against the chosen server, not a global PlayerTracker identity service

Acceptance:

- the server owner can sign up, log in, restore session, and log out
- local players can join the chosen server without requiring email addresses
- renaming a player changes only the visible display name, not the player identity
- player session identity is stable even when the visible display name changes
- identity no longer depends on local `ownerId`
- the initial auth system is explicitly local-server based, not tied to a central PlayerTracker cloud account
- auth/session ownership constraints are tightened here, after the M2 persistence foundation is in place

### M5: Authorization and Ownership Rewrite

Goal: stop trusting the client to say who owns what.

This is the biggest behavioral change.

Work:

- derive current owner/admin from session on the server
- remove client authority over `ownerId`
- enforce campaign-scoped referee authorization so referee-only routes and views require the designated referee role
- convert player routes to session-backed campaign-local claim routes:
  - `GET /me`
  - `PATCH /me`
  - `GET /campaigns/:campaignId/me/characters`
  - `POST /campaigns/:campaignId/me/characters`
  - `PATCH /campaigns/:campaignId/me/characters/:id`
  - `DELETE /campaigns/:campaignId/me/characters/:id`
- add membership enforcement for:
  - player
  - admin
- define which campaign operations are available to any authenticated campaign participant versus campaign admins
- add campaign-local claim tracking so a player session and its display-name aliases can reclaim previously assigned characters on reconnect
- define the character claim lifecycle explicitly:
  - unclaimed
  - claimed by the current player session
  - temporarily retained for reconnect
  - explicitly released or handed off
- add referee-role tracking so campaign membership can mark one or more designated referees without changing the underlying player identity
- define referee-role concurrency as fully equal control among campaign members currently designated as referees

Acceptance:

- players can reclaim and edit only the characters currently tied to their own campaign-local player session
- display-name changes do not change character claim ownership or player identity
- reconnect restores the same player session and claim state when the character is still eligible
- referee is a campaign-scoped role and the referee view is only available to designated referees
- the server can surface which campaign members are currently designated as referees and whether they are connected
- display-oriented clients can render the current referee(s) from that presence data
- campaign members concurrently designated as referees have fully equal control
- all ownership comes from server session + campaign membership + current character claim
- no gameplay write route trusts raw client identity

Status: complete

### M6: Campaign Creation, Invites, and Membership Management

Goal: make campaigns usable as a product, not just local state.

Work:

- add campaign creation
- add campaign membership permissions per campaign
- add referee-role assignment and revocation per campaign
- add direct membership-by-name flow for admins/referees:
  - `POST /campaigns/:campaignId/members`
- make the join screen show unclaimed characters plus characters previously claimed by the same campaign-local player session when a reconnect is possible
- add campaign list route:
  - `GET /me/campaigns`

Acceptance:

- users can create and join multiple campaigns
- permissions are enforced per campaign
- referee assignment and revocation are campaign membership operations
- campaign referees and admins can add players to their campaign by name
- the referee UI can show the set of campaign members designated as referees and currently connected
- the display UI can show the current referee(s) for the active campaign/session
- the join flow can show previously claimed characters that are eligible for reclaim by the same campaign-local player session
- no launch behavior depends on subscription plan caps or active-campaign counting

Status: complete

### M6A: Server-Sent Events Real-Time Layer

Goal: replace the current polling-first model with campaign-scoped server push.

Work:

- add authenticated SSE endpoints for campaign-scoped event streams
- add a lightweight authenticated keepalive route for active clients and claims
- define event types for:
  - encounter state changes
  - turn changes
  - character updates
  - condition changes
  - active campaign selection changes
  - campaign metadata changes
  - referee-role presence changes
- on reconnect, load the current snapshot instead of replaying missed history
- keep polling as a fallback path during migration and failure handling
- use the keepalive route to refresh player/session claim liveness while SSE is the primary live-update channel
- make emitted payloads stable enough for all three clients to consume

Acceptance:

- web can subscribe to live campaign updates without polling as the primary mechanism
- iOS and Android can consume the same event model
- active campaign selection changes propagate to all clients in real time
- referee-role presence changes propagate to referee and display clients in real time
- disconnect/reconnect behavior reloads the current snapshot cleanly
- client liveness is maintained by keepalive requests rather than polling loops
- ordinary writes still use normal HTTP endpoints
- display clients can receive current-referee presence updates in real time

Status: complete

### M7: Web Client Migration

Goal: move the browser client from local identity to authenticated, multi-campaign identity.

Work completed:

- removed the remaining browser-local identity assumptions from `Client-Web/app.js`
- kept `localStorage` only for UI convenience and drafts, not authority or ownership
- moved player session handling to the authenticated server session
- aligned the player, referee, display, and join pages around server-driven campaign state
- made the display experience event-driven after the initial load

Acceptance:

- Private Browsing reconnect works via login
- active-campaign activation is explicit and admin-controlled
- web no longer depends on persistent browser identity for ownership
- live state updates arrive via SSE in normal operation
- display mode surfaces the current referee(s)

Status: complete

### M7A: Referee Tools

Goal: add referee workflow tools once the core web migration is in place.

Work completed:

- slice 1 is complete: read-only creature library lookup is wired into the referee add flow
- the library is ruleset-driven through the ruleset manifest, with Pathfinder seeded from the `Client-Web/rulesets/pathfinder-bestiary/` source set
- referee-specific stat-block variants are now wired through the ruleset manifest and referee add flow
- the creature reference action now lives on the added creature card overflow menu
- Pathfinder creature import is already covered
- Traveller has no SRD creature list to import
- D&D5 creature import from the creature database is now wired through the ruleset manifest

Acceptance:

- designated referees can browse and use creature libraries in campaign workflows
- D&D5 creature data can be imported into campaign workflows
- referee-created enemy characters can use the stat structure required by the active ruleset
- additional referee-only workflows can be added here later without reopening M5/M6

Status: complete

### M7B: User Feedback

Goal: address user-test feedback after the core web migration and referee tooling work, before moving on to M8.

Work:

- fold in post-M7A usability feedback
- keep the fixes scoped to the web experience and other pre-M8 polish
- move the player character cards above the order tracker in `Client-Web/player.html`
- define currency tables in the rulesets
- add per-character currency storage
- add per-character inventory tracking with quantity, value, weight, and optional web links
- capture SRD equipment catalogs in the ruleset folders so inventory can suggest ruleset items
- add campaign-scoped party treasure tracking

Acceptance:

- the most important user-test issues from the M7/M7A flow are resolved
- the plan has a clear slot for feedback-driven fixes before iOS migration work resumes

Status: complete

### M7C: Referee Page Functionality

Goal: bring the referee page up to feature parity with the player page where it makes sense for referee workflows.

Work:

- mirror the player-page character and campaign management affordances on the referee page
- keep referee-specific controls in the referee workflow, not the player workflow
- ensure referee actions can reach the same underlying character, inventory, currency, and party-treasure features
- preserve referee-only capabilities while aligning the page structure with the streamlined player page
- let referees roll initiative for groups of creatures of the same type as a single action

Acceptance:

- referee-page workflows expose the same core character-management capabilities as the player page where applicable
- referee-specific controls remain available and clearly separated from player-only behavior
- the referee page no longer feels like a legacy path compared with the player page

Status: complete

### M7D: Confirmation Dialogs/Code cleanup

Goals: 
- replace native browser confirmation dialogs with custom in-app confirmation modals for clearer, more consistent web UX.
- remove dead code and consolidate code where it makes sense.

Work:

- define a reusable confirmation modal component for the web client
- support custom titles, body text, and button labels for each confirmation flow
- migrate high-friction confirmations like debt claims, destructive deletes, and discard-changes prompts to the custom modal
- keep the behavior consistent across player and referee pages

Acceptance:

- confirmation flows use a custom modal rather than native browser dialogs
- the UI can clearly distinguish destructive, discard, and debt-related confirmations
- the modal styling matches the existing web app instead of browser chrome

Status: complete

### M8: iOS Migration

Goal: convert iOS from device identity to authenticated player-session identity.

Scope notes:

- support iPhone and iPad as first-class iOS form factors
- do not add an AppleTV target in M8, but avoid UI and architecture choices that would obviously block a future tvOS port
- assume a clean launch slate, so no legacy-install migration path is required for existing `ownerId` data
- target feature parity with the web client for player and referee workflows
- the iOS client follows the server's active campaign and does not need a multi-campaign picker
- display-only remains web-only for now

Touchpoints:

- `Client-iOS/PlayerTrackeriOS/PlayerAppModel.swift`
- `Client-iOS/PlayerTrackeriOS/APIClient.swift`
- `Client-iOS/PlayerTrackeriOS/SettingsViews.swift`

Work:

- keep the iOS client on campaign-scoped player sessions rather than a separate admin login
- replace `ownerId` persistence as primary identity
- consume the server's active campaign and refresh when it changes
- add SSE client handling for the active campaign updates
- store session securely in Keychain-backed storage
- add referee-mode UI and the referee-only actions required for iOS
- match the web client feature set for player and referee interactions where practical

Checklist:

- add a startup path that restores the player session from secure storage
- replace `ownerId` as the source of ownership and character lookup
- keep `ownerId` only if needed as a transient client-side compatibility field during the refactor
- refresh player data, campaign state, and current characters after the server's active campaign changes
- subscribe to active-campaign SSE updates and reconnect cleanly after disconnects
- add iOS referee-mode navigation and any referee-only controls needed for campaign play
- ensure referee access is gated by campaign-scoped role checks, not by local device state
- keep player and referee views consistent with the same authenticated player-session model
- make the iPhone and iPad layouts work without hidden form-factor assumptions
- ensure settings and connection flows remain usable on both phone and tablet
- store tokens, sessions, or equivalent auth secrets in Keychain-backed storage
- keep the client compatible with the existing HTTP server during the migration
- avoid introducing tvOS-specific code, while keeping the codebase from assuming touch-only layout behavior where practical

Acceptance:

- user can join, rejoin, sign out, and restore a prior player session on a fresh app launch
- user can recover the active campaign and owned characters after authentication
- same user can use the active campaign on iPhone and iPad without a separate campaign-switching UI
- designated referees can open the iOS referee workflow for campaigns where they have that role
- iOS referee actions respect campaign-scoped authorization
- the iOS client covers the same player and referee workflows as the web client, excluding display-only mode
- player identity is server-authenticated rather than derived from a device-local `ownerId`
- secure session material is stored in Keychain-backed storage
- live state updates for the selected campaign arrive via SSE in normal operation
- reconnecting after a transient disconnect refreshes the selected campaign cleanly
- the iOS client works in both compact and regular size classes without requiring a separate code path for iPad
- the M8 implementation does not introduce assumptions that would obviously block a future AppleTV port

### M9: Android Migration

Goal: convert Android from device identity to authenticated player-session identity, with parity to iOS.

Scope notes:

- support phone and tablet form factors as first-class Android targets
- do not add a TV target in M9, but avoid UI and architecture choices that would obviously block a future TV port
- assume a clean launch slate, so no legacy-install migration path is required for existing `ownerId` data
- target feature parity with the iOS client for player and referee workflows
- the Android client follows the server's active campaign and does not need a multi-campaign picker
- display-only remains web-only for now

Touchpoints:

- `Client-Android/app/src/main/java/com/roll4initiative/android/ui/PlayerAppViewModel.kt`
- `Client-Android/app/src/main/java/com/roll4initiative/android/api/ApiService.kt`
- `Client-Android/app/src/main/java/com/roll4initiative/android/ui/SettingsScreen.kt`

Work:

- keep the Android client on campaign-scoped player sessions rather than a separate admin login
- replace `ownerId` persistence as primary identity
- consume the server's active campaign and refresh when it changes
- add SSE client handling for the active campaign updates
- store session securely in encrypted Android storage
- add referee-mode UI and the referee-only actions required for Android
- match the iOS client feature set for player and referee interactions where practical

Acceptance:

- user can join, rejoin, sign out, and restore a prior player session on a fresh app launch
- user can recover the active campaign and owned characters after authentication
- same user can use the active campaign on phone and tablet without a separate campaign-switching UI
- designated referees can open the Android referee workflow for campaigns where they have that role
- Android referee actions respect campaign-scoped authorization
- the Android client covers the same player and referee workflows as the iOS client, excluding display-only mode
- player identity is server-authenticated rather than derived from a device-local `ownerId`
- secure session material is stored in encrypted Android storage
- live state updates for the selected campaign arrive via SSE in normal operation
- reconnecting after a transient disconnect refreshes the selected campaign cleanly

### M10: Legacy Anonymous Migration

Goal: transition current users cleanly.

Work:

- use a hard cutover from anonymous browser-local identity to campaign-local display-name claims
- remove anonymous write access when the claim/session model ships
- communicate that pre-release anonymous browser state is not migrated forward

Acceptance:

- migration policy is explicit
- legacy mode does not remain a hidden source of ownership bugs

### M11: Commercial Security and Operations

Goal: make the paid server app safe to distribute and practical to operate.

Work:

- implement annual server-license entitlement checks through store receipts or store-account entitlement where available on each platform
- exchange store entitlement for a signed, time-limited local server license lease
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
- the local server can validate store entitlement and cache a signed lease for offline/temporary-disconnected use
- expiry behavior is predictable and does not trap user data
- core auth operations are hardened
- operations and recovery are realistic for a commercially distributed server app

### M12: Testing and Release Readiness

Goal: make it shippable.

Work:

- server tests for auth, authorization, campaign scoping, and ownership
- route tests for per-campaign access
- client tests for auth bootstrap and active-campaign activation
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
9. `M7A`
10. `M8`
11. `M9`
12. `M10`
13. `M11`
14. `M12`

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
- multiple stored campaigns with a single active campaign
- account login
- SSE-based live updates
- authenticated web client
- no dependence on browser-local identity

That is the first version that starts looking like a product instead of a LAN tool.

If the goal includes referee workflow polish, add `M7A` after `M7`.

## Early Product Decisions

All high-impact launch product decisions listed here have now been made.

The real-time sync decision is already made:

- use Server-Sent Events as the primary live update mechanism

The launch authentication decision is already made:

- use a local server-owner/admin account
- keep the server-owner/admin account separate from player membership; admin login does not count as a player session
- the server-owner/admin account does not need a display name
- use name-based local player identities with campaign membership on top
- include password reset only if the later product model needs it
- defer email/password, magic-link, and social login for later evaluation
- identities are scoped to a chosen server, not a central SaaS identity system

The launch campaign mode decision is already made:

- membership permissions at launch are `player`, `referee`, and `admin`
- referee is a campaign-scoped role granted to one or more designated players
- the referee view should only open for campaign members designated as referees
- the referee and display views should show which designated referee(s) are currently connected

The launch billing decision is already made:

- sell the server app on an annual license, tentatively `$5/year`
- distribute the paid server through Apple and Microsoft storefronts where they fit
- keep iOS and Android player clients free
- validate store entitlement and exchange it for a signed local server license lease
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

The later encounter-template decision is already made:

- encounter templates are ruleset-scoped
- any campaign using the same ruleset can use those templates

The launch snapshot/restore decision is already made:

- snapshots are a referee manual action at launch
- retain the last 20 snapshots per campaign
- keep retention policy under evaluation during testing

The launch referee-role concurrency decision is already made:

- campaign members concurrently designated as referees have fully equal control

The launch conflict policy decision is already made:

- use last-write-wins for concurrent writes
- keep mutations targeted where practical
- depend on audit/activity history to make overwrites explainable

The launch migration decision is already made:

- use a hard cutover from anonymous browser-local identity to campaign-local display-name claims
- do not provide a legacy claim/migration flow for pre-release anonymous browser state

The next feature-planning priorities are:

- launch-critical: ruleset upload validation and immutable versioning for user-supplied rulesets
- high-value near-term: referee workflow tools in `M7A`
- future possibilities: encounter cloning
- future possibilities: undo/restore from encounter snapshots
- later portability feature: character import/export
- later portability feature: campaign export bundle

## Highest-Leverage Constraints

The most important constraints to design for now are:

- multiple stored campaigns with one active campaign at a time
- multiple devices per user
- campaign-scoped authorization
- invite/join flow
- concurrency/conflict policy
- audit history

These are the most likely to force expensive rework if ignored.

Audit visibility decision:

- audit/history is visible to campaign admins
