# Commercialization Plan

This document captures the current product and engineering roadmap for taking Roll4Initiative from a local-network encounter tracker to a commercial product.

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

A user may have different roles in different campaigns.

At minimum:

- player
- referee
- admin/owner

Likely later:

- assistant referee
- spectator/read-only

Impact:

- role enforcement must be server-side
- permissions must be campaign-specific, not global

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

Decision needed:

- keep polling intentionally
- move to Server-Sent Events
- move to WebSockets

Impact:

- turn changes
- HP/condition updates
- campaign switching
- multi-device consistency

If deferred, design APIs so realtime can be layered in later.

### 7. Concurrency and Conflict Handling

Two clients may edit the same entity at once.

You need a policy for:

- character edits
- campaign settings
- turn state
- conditions

Options:

- last-write-wins
- optimistic locking/version numbers
- hybrid by entity type

Impact:

- persistence schema
- API contracts
- client UX when stale data is edited

### 8. Offline / Degraded-Network Behavior

Table play often happens on imperfect Wi-Fi.

You need an explicit product stance:

- online-only with graceful failure
- read-only offline cache
- queued writes with conflict resolution

Impact:

- mobile client architecture
- sync semantics
- support burden

Even if you choose online-only, define degraded behavior early.

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
- archive/restore of old campaigns
- account deletion
- backups

Impact:

- soft-delete vs hard-delete decisions
- archival model
- export format design
- operational policy

### 11. Ruleset Extensibility

Checked-in JSON rulesets may not be enough long term.

Possible future needs:

- custom rulesets
- house-rule variants
- campaign-specific overrides
- versioned rulesets

Impact:

- schema design
- campaign/ruleset association
- admin tooling

### 12. Billing and Entitlements

Even if monetization comes later, decide what the product will likely charge for:

- per user
- per GM
- per campaign
- premium referee features
- storage/history/export

Impact:

- entitlements model
- account data model
- admin tooling
- UX boundaries

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

## Reframed Roadmap

### Phase A: Foundation

- `M1` Server decomposition
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

### Phase C: Client Migration

- `M7` Web migration
- `M8` iOS migration
- `M9` Android migration

Constrained by:

- Private Browsing compatibility
- multi-device session behavior
- campaign switching UX
- degraded-network behavior

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

## Milestones

### M1: Server Decomposition

Goal: make the backend changeable without piling more logic into `Server-Vapor/PlayerTracker.swift`.

Work:

- extract route registration from `PlayerTracker.swift`
- extract DTOs/models into separate files
- extract `UserStore`
- extract `CampaignStore`
- isolate static file serving/bootstrap from domain logic

Acceptance:

- app still runs with `swift run`
- no product behavior change
- `PlayerTracker.swift` becomes thin startup/config code

### M2: Persistence Foundation

Goal: move from in-memory/local-file authority to database-backed authority.

Work:

- add Fluent + PostgreSQL in `Package.swift`
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
- `~/Sites/PlayerTracker/campaign.json` is no longer the future state model

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

### M4: Accounts and Sessions

Goal: introduce durable authenticated identity.

Work:

- add `User` model
- add `Session` model
- add password hashing
- add auth endpoints:
  - `POST /auth/signup`
  - `POST /auth/login`
  - `POST /auth/logout`
  - `GET /auth/session`

Web auth:

- cookie-based sessions
- `HttpOnly`, `Secure`, `SameSite=Lax`

Mobile auth:

- token or session bootstrap model, but still backed by the same server-side session concept

Acceptance:

- user can sign up, log in, restore session, and log out
- identity no longer depends on local `ownerId`

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
- add role enforcement for:
  - player
  - referee
  - admin

Acceptance:

- players can edit only their own characters
- referees can manage encounter/NPC/referee controls
- all ownership comes from server session + campaign membership
- no gameplay write route trusts raw client identity

### M6: Campaign Creation, Invites, and Membership Management

Goal: make campaigns usable as a product, not just local state.

Work:

- add campaign creation
- add membership roles per campaign
- add invite flow:
  - `POST /campaigns/:campaignId/invites`
  - `POST /invites/:token/accept`
- add campaign list route:
  - `GET /me/campaigns`

Acceptance:

- users can create and join multiple campaigns
- roles are enforced per campaign
- the same user can be a player in one campaign and referee in another

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
- switch all character operations to campaign-scoped authenticated routes
- keep local storage only for UI drafts and optional convenience state

Acceptance:

- Private Browsing reconnect works via login
- campaign switching is explicit
- web no longer depends on persistent browser identity for ownership

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
- store session securely in Keychain-backed storage

Acceptance:

- user can sign in and recover all campaigns/characters
- same user can switch between campaigns on iPhone
- account identity survives app reinstall if credentials/session are re-entered

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
- move auth state into secure storage

Acceptance:

- Android becomes a real account-based client
- users can move between campaigns without losing ownership continuity

### M10: Legacy Anonymous Migration

Goal: transition current users cleanly.

Work:

- decide whether to support claim/migration from existing anonymous player identity
- if yes, add one-time claim flow that attaches legacy characters to authenticated accounts
- if no, define a hard cutover and communicate it

Acceptance:

- migration policy is explicit
- legacy mode does not remain a hidden source of ownership bugs

### M11: Commercial Security and Operations

Goal: be safe to expose publicly.

Work:

- password reset
- optional email verification
- rate limiting on auth routes
- CSRF protection for cookie-based web auth
- audit logging
- session management
- backup/restore for PostgreSQL
- HTTPS-only deployment assumptions
- account deletion/export support

Acceptance:

- core auth operations are hardened
- operations and recovery are realistic for a commercial service

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
7. `M7`
8. `M8`
9. `M9`
10. `M10`
11. `M11`
12. `M12`

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
6. minimal `M7`

That yields:

- a DB-backed server
- simultaneous campaigns
- account login
- authenticated web client
- no dependence on browser-local identity

That is the first version that starts looking like a product instead of a LAN tool.

## Early Product Decisions

These should be decided before deep implementation:

1. Is the product online-only, or should it support meaningful offline behavior?
2. Is the long-term sync model polling, SSE, or WebSockets?
3. What is the initial role model: `player/referee/admin`, or more?
4. What is the billing boundary: user, campaign, GM, or feature tier?
5. Will custom rulesets be allowed?
6. What is the conflict policy for concurrent edits?
7. Will existing anonymous users get a claim/migration path?

## Highest-Leverage Constraints

The most important constraints to design for now are:

- multiple simultaneous campaigns
- multiple devices per user
- campaign-scoped authorization
- invite/join flow
- concurrency/conflict policy
- audit history

These are the most likely to force expensive rework if ignored.
