# PlayerTracker

PlayerTracker is a full-stack client-server tabletop RPG tracker started in March 2026. It combines a Vapor console app, browser-based clients, and native companion apps in a single repository. The server and web client are the active surfaces; the mobile clients remain in the tree while mobile feature work is on hold.

The current working architecture is a Vapor service running on a Mac and serving browser clients over the local network. There are also native iOS and Android player clients that talk to the same HTTP API, but mobile feature work is currently on hold while server and web client feature work continues.

## Current status

- `Server-Vapor`
  The main Vapor service. This is the primary runtime.
- `Client-Web`
  Browser clients for player, referee, admin, display, and campaign selection. The referee-page parity work from the M7C plan is complete.
- `Client-iOS`
  Native iOS and iPadOS player client for the existing server. Feature work is currently on hold.
- `Client-Android`
  Native Android player client. Feature work is currently on hold.

## What the server does

- hosts the web UI from the checked-in `Client-Web/` directory
- serves player, referee, display-only, and campaign-selector pages
- manages campaign membership, referee roles, and name-based join/reclaim flow
- publishes live campaign updates over SSE to browser clients
- tracks campaigns, encounter state, initiative, character stats, conditions, visibility, and reveal-on-turn behavior
- supports optional initiative assignment, in-app initiative rolling, decimal initiative values, and auto-skip turn behavior
- loads rulesets from `Client-Web/rulesets`
- loads creature and equipment library assets from the ruleset manifest files in `Client-Web/rulesets/*.json`
- starts on port `8080`

## Requirements

- macOS
- Swift 6.2
- Xcode if you want to run the iOS app

## Run the server

From the repository root:

```bash
swift run
```

The service listens on:

```text
http://localhost:8080
```

On startup, the service opens `admin.html` in a browser when the platform has a supported launcher. Set `ROLL4INITIATIVE_LAUNCH_BROWSER=0` to run the server without opening a browser.

## Import creature fixtures

The referee creature library has an `Import JSON` button in the library panel. Select the checked-in fixture JSON files for the current ruleset and the app will copy them into the local `userdata/<ruleset>` directory that the server already reads from. Creature and equipment library sources are selected from the ruleset manifest, so `creatureLibrary.file` and `equipmentLibrary.file` determine which checked-in assets are available for that ruleset.

If you prefer the command line, the repository still includes the same import path as a script:

```bash
swift Scripts/import-creature-fixtures.swift --ruleset pathfinder
```

Add `--overwrite` if you want to replace existing local creature files.

## Project layout

- `Package.swift`
  Swift package manifest for the Vapor server
- `Server-Vapor/PlayerTracker.swift`
  main server entry point
- `Server-Vapor/ServerBootstrap.swift`
  server startup configuration, route registration, and static file setup
- `Server-Vapor/RuleSetLibrary.swift`
  ruleset model and loader
- `Client-Web/`
  checked-in browser client and rulesets
- `Client-iOS/`
  native iOS player app
- `FEATURE_TRACKING.md`
  lightweight notes file for feature ideas, decisions, and follow-up items

## Notes

- The server serves the checked-in `Client-Web/` directory from this repository.
- This repository is currently optimized for local-network table play rather than internet-hosted multiplayer.
- The iOS app is named `Tactical Table Top: Initiative`.
- The Android client is not tied to any specific local development environment in this README because mobile work is currently paused.
