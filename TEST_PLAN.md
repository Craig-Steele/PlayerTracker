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

- `POST /characters` creates and updates characters.
- `GET /state` respects player versus referee visibility.
- `POST /encounter/start` rolls unset referee initiatives and activates the encounter.
- `POST /turn-complete` rejects inactive encounters.
- `POST /campaign` updates campaign name and ruleset.

Implementation note: use Vapor's testing support once route setup can be initialized without launching the browser or binding the production server port.

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
- Test encounter health-status labels and stat ordering helpers.
- Test ruleset link/icon URL handling.

## Testability Refactors

These changes should stay small and be driven by tests:

- Inject `CampaignStore` persistence directory.
- Inject ruleset-library directory.
- Split `PlayerTracker.swift` into startup, routes, models, and store files.
- Keep browser launch out of test initialization.
- Add API-client injection points for iOS and Android ViewModels.
