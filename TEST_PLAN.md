# Roll4Initiative Test Plan

This plan tracks the practical test coverage needed for the current local-network Vapor server and native/web clients.

## Current Baseline

- SwiftPM now has a `PlayerTrackerTests` test target.
- `UserStoreTests` covers core active-encounter turn behavior:
  - auto-skip characters are skipped when selecting the current turn
  - hidden referee characters marked `revealOnTurn` are revealed when their turn starts

Run the server test suite from the repository root:

```bash
swift test
```

## Near-Term Priorities

### 1. Campaign Persistence

Goal: protect campaign settings and encounter state persistence.

- Verify campaign state writes to `~/Library/Application Support/Roll4Initiative/campaign.json`.
- Verify the parent directory is created before saving.
- Verify a newly initialized `CampaignStore` restores persisted campaign name and ruleset.
- Verify restored encounter state intentionally resets to `.new`.

Implementation note: inject the persistence base directory into `CampaignStore` so tests can use a temporary directory instead of the real home folder.

### 2. Campaign Scoping

Goal: prevent state from leaking between campaigns.

- Add same-owner and same-character-name fixtures in two campaigns.
- Assert `characters(for:campaignName:)` only returns characters for the requested campaign.
- Assert `state(campaignName:)` only includes the requested campaign.
- Assert `resetForNewEncounter(campaignName:)` resets only that campaign.

### 3. Visibility Rules

Goal: keep hidden-state authority server-side.

- Assert non-referee characters cannot be hidden through `upsertCharacter`.
- Assert non-referee characters cannot keep `revealOnTurn`.
- Assert `setVisibility` ignores hidden/reveal requests for non-referee characters.
- Assert referee-owned hidden characters are excluded from player view until revealed.

### 4. Turn Edge Cases

Goal: harden round and current-turn behavior.

- All eligible characters have `autoSkipTurn`: active state should return no current turn.
- No characters have initiative: round and turn index should reset.
- Deleting or hiding the current character should preserve a valid current-turn index.
- Starting a new encounter should clear player initiatives, remove referee characters, and reset turn state.

### 5. Ruleset Loading

Goal: protect built-in and custom ruleset behavior.

- `loadDefault()` returns a valid built-in ruleset when ruleset JSON files exist.
- `loadLibrary(id: "none")` returns the empty ruleset.
- Unknown ruleset IDs throw not found.
- Duplicate ruleset IDs choose the newest modified file.
- `availableRulesets()` includes built-ins plus `none`, sorted by label.

Implementation note: this likely needs a temporary-directory injection point similar to campaign persistence.

### 6. Route-Level Server Tests

Goal: catch DTO and HTTP behavior regressions that actor tests miss.

- `POST /campaigns/:campaignId/me/characters` creates and updates player-owned characters.
- `GET /state` respects player versus referee visibility.
- `GET /campaign/events` snapshots the current active campaign and publishes active-campaign changes.
- `GET /campaigns/:campaignId/events` streams campaign-scoped updates for authorized members.
- `POST /encounter/start` rolls unset referee initiatives and activates the encounter.
- `POST /turn-complete` rejects inactive encounters.
- `POST /campaign` updates campaign name and ruleset.

Implementation note: use Vapor's testing support once route setup can be initialized without launching the browser or binding the production server port.

### 7. Connection Logging

Goal: make request logging safe, deterministic, and replaceable as packaging evolves.

- Test `X-Forwarded-For` takes precedence over peer and remote addresses.
- Test missing or blank address information resolves to `unknown`.
- Test log field escaping for spaces, quotes, backslashes, tabs, and newlines in identifiers and paths.
- Test server-event logging uses the same timestamp and field-escaping rules as request logging.
- Test route registration can use a no-op or test logger instead of writing to the real user log directory.

Implementation note: this likely needs a small connection-logging service protocol or app-scoped dependency so tests can exercise formatting and routing without file writes.

## Client Test Opportunities

### iOS

- Unit test `CharacterDraft.buildStatsPayload`.
- Unit test stat adjustment clamping, including negative-health rules and TempHP behavior.
- Unit test API URL normalization and query encoding for campaign names.

### Android

- Unit test `DiceLogic`.
- Unit test `CharacterDraft.buildStatsPayload`.
- Unit test health status label thresholds.
- Add ViewModel tests after API construction is injectable.

### Web

- Add small JavaScript tests for `shared.js` dice parsing/rolling helpers.
- Test `live-stream.js` refresh coalescing and stream subscription behavior.
- Test join-page forward/deny decision helpers.
- Test encounter health-status labels and stat ordering helpers.
- Test ruleset link/icon URL handling.

### Web Referee UI

The referee page is the highest-risk web surface because it combines startup state, live campaign synchronization, campaign administration, and several modal workflows in one client. The test plan below treats `Client-Web/referee.html` and `Client-Web/referee.js` as the core scope, with supporting coverage in `party-treasure.js`, `live-stream.js`, `encounter.js`, `ruleset.js`, and `shared.js`.

#### Test strategy

- Keep the existing `node:test` style for pure helper logic and state reducers.
- Add browser-level integration tests only for flows that require DOM wiring, fetch sequencing, focus behavior, or `EventSource`.
- Prefer a small, deterministic test harness with mocked `fetch`, `confirm`, `alert`, `prompt`, `EventSource`, and `localStorage` over full end-to-end browser automation until the page logic is split into smaller modules.
- Treat blank-page regressions as P0 because the referee page can fail while player and display pages still work.

#### P0 startup and boot

Goal: the referee page must render a usable shell even when campaign state, SSE, or secondary fetches are degraded.

- Loads `referee.html` without runtime exceptions.
- Initializes the header with the current campaign name, ruleset label/icon, and encounter state.
- Handles `GET /campaign` returning `409 No campaign selected` by recovering the active campaign when possible.
- Retries startup after active-campaign recovery and reaches `loadState()`.
- Keeps the page usable if the equipment library fails to load.
- Keeps the page usable if the live stream cannot connect immediately.
- Does not throw on early startup ordering issues such as temporal-dead-zone reads.

#### P0 referee-only permissions

Goal: ensure the referee page exposes actions only when the active session should be allowed to use them.

- Shows referee actions only for a referee-capable session.
- Hides or disables invite-only actions when the campaign or session does not allow them.
- Allows party treasure save/load paths for referee sessions.
- Rejects or disables campaign-only actions when no active campaign exists.
- Keeps the campaign settings modal and party treasure modal from opening in invalid states.

#### P0 roster and encounter state

Goal: the roster table and encounter controls must reflect server state correctly.

- Renders an empty roster state when there are no encounter participants.
- Renders one row per encounter participant with the correct order, character name, stats, and conditions.
- Applies the correct health/turn styling for the current turn.
- Updates the encounter-state label when state changes from new to active to suspended.
- Updates the roster when the active turn changes.
- Keeps the current-turn marker stable when rows are reordered or hidden.

#### P1 add-character flow

Goal: creating referee-owned encounter entries should work in both manual and library-driven modes.

- Opens and closes the add-character modal cleanly.
- Validates character name and quantity before save.
- Supports manual stat entry and stat-block selection.
- Supports the visibility toggle for starting revealed versus hidden.
- Switches between the manual and creature-library tabs without losing entered state unexpectedly.
- Loads the creature library, filters results, and shows selected creature details.
- Prefills manual fields from a library selection where supported.
- Saves a new character and refreshes the roster after success.
- Preserves unsaved edits until cancel or save.

#### P1 character edit flow

Goal: editing an existing row should update the correct fields without corrupting related encounter state.

- Opens the details editor for the selected character.
- Edits the character name and initiative bonus.
- Edits stat payloads and preserves current/max invariants.
- Shows the current stat summary while editing.
- Cancels without mutating the live roster.
- Saves changes and refreshes the row after success.
- Rejects invalid stat combinations with a visible error state.

#### P1 conditions flow

Goal: conditions must be searchable, selectable, and saved correctly.

- Opens the conditions panel for the selected character.
- Filters the condition list as the user types.
- Shows selected conditions separately from the full list.
- Adds and removes conditions without duplicating entries.
- Persists condition changes to the server.
- Restores the previous condition set if save fails.
- Keeps the condition chooser keyboard-accessible.

#### P1 initiative and turn flow

Goal: initiative editing must match the encounter state and not break turn control.

- Opens the initiative editor for the selected character.
- Saves or clears initiative values correctly.
- Displays the active-turn character consistently in the modal.
- Completes the current turn only when the encounter is active.
- Rejects turn-complete actions when the encounter is inactive or suspended.
- Updates the roster and header after an initiative or turn change.

#### P1 party treasure flow

Goal: shared treasure should be editable without destabilizing the page.

- Opens the party treasure editor only when an active campaign exists.
- Loads the current treasure list into the table.
- Adds a new item row and supports preset lookup from the equipment library.
- Edits quantity, value, weight, URL, and container metadata.
- Selects and removes the correct row.
- Saves the inventory and refreshes the roster or modal state after success.
- Handles empty equipment-library responses without breaking the editor.
- Closes the editor via the close button and the backdrop.

#### P1 campaign settings flow

Goal: campaign metadata, access mode, and library selection should be safe and predictable.

- Opens and closes the campaign settings modal.
- Shows a summary that matches the current campaign metadata.
- Edits campaign name and access mode.
- Switches between explicit-release and timed claim modes.
- Keeps the ruleset field locked after campaign creation.
- Loads creature-library selection state in the libraries tab.
- Imports library JSON and reports success or failure clearly.
- Saves user-data library selections and refreshes the list after success.
- Prevents saving when required fields are invalid.

#### P2 live updates and refresh behavior

Goal: SSE and refresh logic should update the view without duplicate churn.

- Starts a campaign event stream for the current active campaign.
- Reconnects when the active campaign changes.
- Coalesces refreshes while one refresh is already in flight.
- Applies snapshot, update, encounter-start, turn-changed, and campaign-updated events correctly.
- Honors the skip-refresh path when a local mutation already updated the view.
- Stops the stream cleanly when the page is unloaded or the user navigates away.

#### P2 error handling and resilience

Goal: common failures should surface as status messages, not blank screens.

- Shows a status message when a save request fails.
- Shows a readable error when campaign recovery fails.
- Logs or surfaces fetch failures for library, campaign, and roster loads.
- Leaves the page in a recoverable state after a modal save fails.
- Avoids throwing when optional DOM nodes are absent.

#### P2 accessibility and layout

Goal: the referee page should stay usable on laptop and tablet layouts.

- Keeps dialog titles and aria relationships intact.
- Maintains keyboard focus when opening and closing modals.
- Supports tab navigation through the major referee workflows.
- Keeps primary controls visible at common tablet and laptop widths.
- Ensures buttons and form inputs remain reachable on narrow layouts.

#### Regression cases to keep permanently

- Blank referee page while display and player pages still work.
- `GET /campaign` returns `409 No campaign selected`.
- Temporal-dead-zone startup bugs in `referee.js`.
- Party treasure open/save path with `activeCampaignId` missing.
- Equipment library load failure.
- Campaign settings save failure.
- Encounter suspended or inactive while turn-complete is clicked.

#### Suggested test file breakdown

- `Client-Web/referee-startup.test.js`
- `Client-Web/referee-campaign-settings.test.js`
- `Client-Web/referee-party-treasure.test.js`
- `Client-Web/referee-conditions.test.js`
- `Client-Web/referee-initiative.test.js`
- `Client-Web/referee-live-stream.test.js`
- `Client-Web/referee-add-character.test.js`

#### Minimum acceptance bar

- Every P0 case passes in automated tests.
- Every P1 case passes in automated tests or is covered by a deterministic browser integration test.
- Manual verification is only reserved for layout, focus, and visual polish cases that cannot be expressed reliably with the current harness.
- No referee-page change is considered complete until it has been exercised against an active campaign and a no-active-campaign startup case.

## Testability Refactors

These changes should stay small and be driven by tests:

- Inject `CampaignStore` persistence directory.
- Inject ruleset-library directory.
- Inject or app-scope connection logging so tests and packaged builds can select file, no-op, or deployment log sinks.
- Split `PlayerTracker.swift` into startup, routes, models, and store files.
- Keep browser launch out of test initialization.
- Add API-client injection points for iOS and Android ViewModels.
