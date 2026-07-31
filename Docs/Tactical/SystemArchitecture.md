# Tactical Table Top: System Architecture

## Architectural Model

Use a host-authoritative command/event model.

```text
- clients project state
- the host validates and commits
- snapshots resync clients
- shared protocol types define the wire contract
```

The critical rule:

```text
Unity does not mutate final state directly.
The browser does not mutate final state directly.
Both send commands to the Local Host.
The Local Host validates, commits, and broadcasts events.
```

## First Playable Contract

The first playable loop is intentionally small:

```text
- 1 referee
- 1 player
- 1 referee-controlled monster
- 1 player-controlled character
- 1 grid-based arena
- 1 square = 5 ft
```

### Arena and placement

```text
- The referee sets an arena from an image plus square dimensions
- Tokens snap to squares
- LOS blockers are the only blockers that matter for LOS
- The referee places the monster
- The referee places the player character
- The player claims the placed character through the existing Swift server claim flow
```

### Map elevation

```text
- Map source data is stored as JSON alongside the image for now
- The source JSON stores a default height, sparse per-square height overrides, and ramp regions
- Ramp regions are authored as rectangular square ranges with a low edge height and a high edge height
- Ramp regions are axis-aligned rectangles
- Ramp height is inferred linearly across the ramp from the low edge to the high edge
- The loader expands the source JSON into a per-square float elevation grid in feet
- Squares outside ramp regions keep their authored grid height
- LOS and view sampling use the square center height
```

### Map JSON format

```text
MapData
- version
- imagePath
- gridWidth
- gridHeight
- squareSizeFt
- defaultHeightFt
- heightOverrides
- rampRegions
```

`heightOverrides` is a sparse list of square coordinates with explicit float heights. `rampRegions` is a sparse list of rectangular ramps that the loader expands into square heights. The runtime `BattleMap` carries the full expanded `elevationGrid`, while the source JSON remains the hand-authored map file stored beside the PNG.

### Turn and initiative

```text
- Initiative order comes from the existing Swift server
- The server generates turn order from initiative
- The server provides rounds and turn signaling
- The first playable loop uses that existing round/turn flow
```

### Movement, targeting, and HP

```text
- Movement is unrestricted for the first loop
- On their turn, each side can move their character
- On their turn, each side can target the opponent
- Targeting means token selection plus LOS and cover reporting
- Combat resolution is manual/UI-only
- A player can adjust their own HP
- A referee can adjust anyone's HP
```

### LOS and cover

```text
- LOS is reported per target selection
- Cover is the number of blocked LOS rays divided by the total LOS rays
- Cover is displayed as a whole percent
- If total LOS rays = 0, the result is no LOS and 100% cover
- 100% cover means no LOS
- LOS ray implementation is TBD
```

### Persistence

```text
- Save/load is required in the first loop
- Persist arena dimensions
- Persist arena image location
- Persist character locations
- Persist existing Swift server data
```

## Authority and Ownership

### Local Host owns

```text
- EncounterState
- Initiative order
- Token positions
- Token properties
- Visibility state
- Player ownership
- Connected devices
- Command validation
- Save/load
- Event log
- Session identity and pairing codes
```

### Unity Referee View owns

```text
- Camera position
- Local hover state
- Spatial selection affordances
- Map viewport presentation
- Visual previews
- Tactical overlays
- Local editing gestures before confirmation
```

### Browser Referee Console owns

```text
- Open panels
- Form state
- Inspector layout
- Filters
- Selected tabs
- UI-only preferences
```

### Shared Referee context

The Referee workspace should share one authoritative selection/tool context:

```text
SharedRefereeSelection
- selectedObjectId
- selectedObjectType
- selectedTool
```

## Communication Model

### Commands

Commands are sent from clients to the Local Host.

```text
SelectTokenCommand
UpdateTokenCommand
MoveTokenCommand
PreviewMoveCommand
RevealTokenCommand
HideTokenCommand
AdvanceTurnCommand
ApplyDamageCommand
AddConditionCommand
RemoveConditionCommand
SetDisplayCameraModeCommand
SetTokenOwnerCommand
SetInitiativeOrderCommand
```

### Events

Events are broadcast by the Local Host.

```text
TokenSelectedEvent
TokenUpdatedEvent
TokenMovedEvent
VisibilityChangedEvent
TurnAdvancedEvent
ConditionChangedEvent
DisplayModeChangedEvent
EncounterSavedEvent
ClientConnectedEvent
ClientDisconnectedEvent
```

### State snapshots

State snapshots are sent when clients connect or resync.

```text
EncounterStateSnapshot
ClientPermissions
VisibilityFilteredState
DisplayState
```

## Core Data Model

### Encounter state

```text
Encounter
- id
- name
- map
- tokens
- initiativeOrder
- activeTokenId
- roundNumber
- turnIndex
- visibilityState
- displayState
- eventLog
```

### Token state

```text
Token
- id
- displayName
- ownerId
- team
- position
- facing
- size
- movementSpeed
- currentHealth
- maxHealth
- conditions
- isHidden
- isSelectable
```

### Map state

```text
BattleMap
- id
- image or terrain data
- width
- height
- gridType
- scale
- elevationGrid
- rampRegions
- obstacles
- walls
- terrainZones
```

### Turn state

```text
TurnState
- roundNumber
- activeTokenId
- previousTokenId
- nextTokenId
- pendingAction
- turnCompletedByPlayer
```

### Display state

```text
DisplayState
- cameraMode
- focusedTokenId
- highlightedTokens
- activeOverlay
- showMovementPaths
- showLineOfSight
- showInitiative
- publicCallout
```

## Technology Direction

### Unity

Use Unity for:

```text
- Referee tactical map
- Player mobile app
- Apple TV display app
- Shared tactical rendering code
- Token rendering
- Camera control
- Touch input
- tvOS display rendering
```

Recommended Unity packages/systems:

```text
- Unity Input System
- TextMeshPro
- 2D Renderer or URP
- Unity Test Framework
- Addressables, later, for maps/assets
```

### Local Host

The Local Host should be cross-platform and authoritative.

Best candidates:

```text
Go Host + TypeScript Web UI + Unity C# Clients
```

or:

```text
C#/.NET Host + TypeScript Web UI + Unity C# Clients
```

### Browser Referee UI

Recommended stack:

```text
Vite
TypeScript
React or Svelte
WebSocket client
Plain CSS, CSS modules, or lightweight component library
```

Suggested initial browser panels:

```text
Encounter Dashboard
Initiative Panel
Token Inspector
Visibility Panel
Condition Editor
Connected Devices
Display Controls
Event Log
```

## Networking and Pairing

Recommended networking model:

```text
Host-authoritative
Command/event based
Local network first
Session code pairing
```

Pairing flow:

```text
Referee Host starts session.
Browser console displays session code and QR code.
Player scans QR code or enters code.
Apple TV displays pairing code.
Referee approves display connection.
```

## Serialization and Testing

Use JSON first for:

```text
- Encounters
- Tokens
- Maps
- Initiative state
- Visibility state
- Saved sessions
- Network messages
- Event logs
```

Test with:

```text
- Movement legality
- LOS blocked/unblocked
- Cover calculation
- Turn advancement
- Visibility filtering
- Client state projection
- Command validation
- Event broadcasting
- State snapshots
- Save/load
- Permission enforcement
```
