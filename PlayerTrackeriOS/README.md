# PlayerTrackeriOS

First-pass native iPhone player client for the existing `PlayerTracker` server.

## Current scope

- connect to an existing PlayerTracker server by URL
- persist player ID, player name, and server URL locally
- load campaign, ruleset, state, and the current player's characters
- create, edit, and delete player-owned characters
- complete turn when it is the player's turn

## Open in Xcode

Open:

- `PlayerTrackeriOS/PlayerTrackeriOS.xcodeproj`

Then set a signing team for the `PlayerTrackeriOS` target before running on device.

## Notes

- This is player-only for now
- the app talks to the existing HTTP server on port `8080`
- `Info.plist` currently allows HTTP so it can connect to local and public PlayerTracker hosts during development
