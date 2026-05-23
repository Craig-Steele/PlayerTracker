# Codex Startup Notes

- Start from the repository root at `Roll4Initiative/`.
- Prefer repo-root commands such as `swift test` when validating changes.
- Keep scratch files inside `Roll4Initiative/.tmp/` when a repo-local temp path is sufficient.
- Keep startup and packaging behavior aligned with `Server-Vapor/ServerPlatform.swift` and `Server-Vapor/ServerBootstrap.swift`.
- Treat `README.md`, `PRODUCTION_PLAN.md`, and `TEST_PLAN.md` as the main human-facing project docs.
- Treat `Client-Web/rulesets/*.json` manifests as the source of truth for ruleset assets.
- Do not infer ruleset identity from filenames.
- Reference creature libraries explicitly from the ruleset manifest with `creatureLibrary.file`.
- Keep the creature-library feature split into a read-only lookup slice first, with local saving as a later slice.
- Use `Server-Vapor/ServerPlatform.swift` as the source of truth for OS-specific app-data and log paths.
- Keep startup behavior centralized in `Server-Vapor/ServerBootstrap.swift`.
