# Codex Startup Notes

- Start from the repository root at `Roll4Initiative/`.
- Prefer repo-root commands such as `swift test` when validating changes.
- Keep scratch files inside `Roll4Initiative/.tmp/` when a repo-local temp path is sufficient.
- Keep startup and packaging behavior aligned with `Server-Vapor/ServerPlatform.swift` and `Server-Vapor/ServerBootstrap.swift`.
- Treat `README.md`, `PRODUCTION_PLAN.md`, and `TEST_PLAN.md` as the main human-facing project docs.
- Treat `Client-Web/rulesets/*.json` manifests as the source of truth for ruleset assets.
- Do not infer ruleset identity from filenames.
- Reference creature libraries explicitly from the ruleset manifest with `creatureLibrary.file`.
- Use `Server-Vapor/ServerPlatform.swift` as the source of truth for OS-specific app-data and log paths.
- Keep startup behavior centralized in `Server-Vapor/ServerBootstrap.swift`.
- When cleaning Pathfinder bestiary data, only normalize `cr` values that are clearly safe from the source text:
  - strip obvious scrape noise like `MR`, `XP`, and literal fraction glyphs when the record is still unambiguous
  - keep real fractional CRs as fractions, not decimals
  - split true variant creatures into separate records with `baseCreatureName` instead of collapsing them into the base creature
  - move third-party variants into `Tests/PlayerTrackerTests/Fixtures/pathfinder/third-party-products.json` rather than leaving them in the main bestiary
- Verify Pathfinder creature-data sweeps with both the route tests and a full `swift test` run before landing the changes.
