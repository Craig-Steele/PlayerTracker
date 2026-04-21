# PlayerTracker

Initiative and condition tracking for tabletop RPG encounters.

The current working architecture is a Vapor service running on a Mac and serving browser clients over the local network. There are also native iOS and Android player clients that talk to the same HTTP API.

## Current status

- `Server-Vapor`
  The main Vapor service. This is the primary runtime.
- `Client-Web`
  Browser clients for player, referee, display, and campaign selection.
- `Client-iOS`
  Native iPhone player client for the existing server.
- `Client-Android`
  Native Android player client built with Jetpack Compose.

## What the server does

- hosts the web UI from the checked-in `Client-Web/` directory
- serves player, referee, display-only, and campaign-selector pages
- tracks campaigns, encounter state, initiative, character stats, conditions, visibility, and reveal-on-turn behavior
- supports optional initiative assignment, in-app initiative rolling, decimal initiative values, and auto-skip turn behavior
- loads rulesets from `Client-Web/rulesets`
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

On startup, the service currently opens the local display view in a browser on the host machine.

## Project layout

- `Package.swift`
  Swift package manifest for the Vapor server
- `Server-Vapor/PlayerTracker.swift`
  main server entry point, routes, and in-memory game state
- `Server-Vapor/RuleSetLibrary.swift`
  ruleset model and loader
- `Client-Web/`
  checked-in browser client and rulesets
- `Client-iOS/`
  native iOS player app

## Notes

- The server serves the checked-in `Client-Web/` directory from this repository.
- This repository is currently optimized for local-network table play rather than internet-hosted multiplayer.
- The iOS app is named `Roll For Initiative!`.
