# Client-iOS

Native iOS player client for the existing `PlayerTracker` Vapor server.

## Current scope

- connect to an existing PlayerTracker server by URL
- persist server URL, player name, and player ID locally
- load campaign, ruleset, encounter state, initiative order, and the current player's characters
- show campaign metadata including icon, round, current turn, and next turn
- create, edit, and delete player-owned characters
- edit conditions, including opening linked rule text when available
- adjust character stats and complete turn when it is the player's turn

## Open in Xcode

Open:

- `Client-iOS/PlayerTrackeriOS.xcodeproj`

Then set a signing team for the `PlayerTrackeriOS` target before running on device or simulator.

## Notes

- this is still player-only; referee and display-only views remain in the web client
- connection settings and player identity are managed from the app's `Settings` screen
- the app talks to the existing HTTP server on port `8080`
- `Info.plist` currently allows HTTP so it can connect to local-network PlayerTracker hosts during development
