# PlayerTracker

Initiative and condition tracking for tabletop RPG encounters.

The current working architecture is a Vapor service running on a Mac and serving browser clients over the local network. There is also a first-pass native iOS player client that talks to the same HTTP API.

## Current status

- `Sources/PlayerTracker`
  The main Vapor service. This is the primary runtime.
- `PlayerTrackeriOS`
  Native iPhone player client for the existing server.
- `InitiativeTrackerP2P`
  Exploratory work toward a peer-hosted architecture. Useful for design reference, but not the current product direction.

## What the server does

- hosts the web UI from the checked-in `WebClient/` directory
- serves player, referee, display-only, and campaign-selector pages
- tracks campaigns, encounter state, initiative, character stats, conditions, visibility, and reveal-on-turn behavior
- loads rulesets from `WebClient/rulesets`
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
- `Sources/PlayerTracker/PlayerTracker.swift`
  main server entry point, routes, and in-memory game state
- `Sources/PlayerTracker/RuleSetLibrary.swift`
  ruleset model and loader
- `WebClient/`
  checked-in browser client and rulesets
- `PlayerTrackeriOS/`
  native iOS player app
- `InitiativeTrackerP2P/`
  P2P experiments and architecture notes

## Notes

- The server prefers the checked-in `WebClient/` directory and falls back to `~/Sites/PlayerTracker` only if needed.
- This repository is currently optimized for local-network table play rather than internet-hosted multiplayer.
