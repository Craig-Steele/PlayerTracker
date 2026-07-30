# Tactical Table Top: Implementation Roadmap

## Milestone 0: First Playable Loop Spec

Status: Complete. This milestone defines the contract; implementation begins at Milestone 1.

Define the smallest end-to-end tactical loop that proves the product direction without turning this into a full VTT.

### Scenario

```text
1 referee
1 player
1 referee-controlled monster
1 player-controlled character
1 grid-based arena
```

### Arena setup

```text
- Referee sets a 2D battle arena using an image plus square dimensions
- Arena dimensions are in squares
- 1 square = 5 ft
- Tokens snap to squares
- LOS blockers exist in the arena
```

### Character setup

```text
- Referee places one monster
- Referee places one player character
- Player claims the placed character through the existing Swift server claim flow
```

### Turn flow

```text
- Initiative order comes from the existing Swift server
- The server generates turn order from initiative
- The server provides rounds and turn signaling
- The first playable loop uses that existing round/turn flow
```

### Player and referee actions

```text
- Movement is unrestricted for the first loop
- On their turn, each side can move their character
- On their turn, each side can target the opponent
- Targeting means token selection plus LOS and cover reporting
- Combat resolution is not automated
- HP can be adjusted manually
```

### LOS and cover

```text
- LOS blockers are the only objects that matter for LOS blocking
- LOS is reported per target selection
- Cover is the number of blocked LOS rays divided by the total LOS rays
- Cover is displayed as a whole percent
- If total LOS rays = 0, the result is no LOS and 100% cover
- 100% cover means no LOS
- LOS ray implementation is TBD
```

### HP rules

```text
- A player can adjust their own HP
- A referee can adjust anyone's HP
- HP changes are manual/UI-only for now
```

### Persistence

```text
- Save/load is required in the first loop
- Persist arena dimensions
- Persist arena image location
- Persist character locations
- Persist existing Swift server data
```

### Out of scope for Milestone 0

```text
- Automated combat resolution
- Damage calculation
- Full character sheets
- Inventory
- Spell databases
- Rulebook automation
- Campaign journals
- Marketplace assets
- Complex map authoring
- Cloud accounts
- Hosted remote sessions
- Full desktop-native property UI inside Unity
```

### Milestone 0 deliverable

A referee and player can:

```text
Create a 2D grid arena from an image and dimensions
Place one monster and one player character
Claim the player character
Run initiative-based turns
Move on turn
Target on turn and see LOS/cover feedback
Manually adjust HP
Save and reload the encounter
```

## Milestone 1: Unity Tactical Referee Prototype

Implementation begins here.

### Goal

Prove the spatial/tactical interaction in Unity before building the full hybrid system.

### Required systems

```text
- Battle map scene
- Grid-based arena layout
- Token rendering
- Token selection
- Token movement
- Camera pan/zoom
- Line-of-sight preview
- Cover visualization placeholder
- Active token highlight
- Square snapping
- LOS blocker representation
```

### Deliverable

Referee can manipulate a sample encounter in Unity with no web UI yet.

### Acceptance criteria

```text
- A sample map loads in Unity
- Tokens snap to grid squares
- A token can be selected
- A token can be moved
- Camera pan and zoom work
- LOS blockers are visible and affect preview logic
- LOS and cover previews are shown for a selected target
- The prototype runs without the browser UI or Local Host dependency
```

## Milestone 2: Serializable EncounterState

### Goal

Refactor Unity so the tactical scene is driven by serializable state instead of scene-only objects.

### Required work

```text
- Define EncounterState
- Define TokenState
- Define MapState
- Define TurnState
- Define VisibilityState
- Persist token positions in square coordinates
- Save/load sample EncounterState.json
- Render Unity scene from EncounterState
```

### Deliverable

Unity can load `EncounterState.json`, render the encounter, and apply basic state changes through a clean state API.

### Acceptance criteria

```text
- Encounter state can be serialized to JSON
- Arena dimensions and image reference are stored in state
- Token positions are stored in square coordinates
- Unity can load the serialized state and render the same encounter
- A basic state change updates the rendered scene
- The same encounter can be saved, loaded, and re-rendered deterministically
```

## Milestone 3: Local Referee Host

### Goal

Create the authoritative local server.

### Required features

```text
- Load EncounterState
- Accept WebSocket connections
- Send EncounterStateSnapshot
- Accept basic commands
- Validate commands
- Broadcast events
- Maintain event log
- Integrate with existing Swift server initiative/turn signaling
```

### Initial commands

```text
SelectTokenCommand
UpdateTokenCommand
MoveTokenCommand
AdvanceTurnCommand
ClaimTokenCommand
```

### Deliverable

A test client can connect, update a token property, and receive a broadcast event.

### Acceptance criteria

```text
- The host starts locally
- A client can connect over WebSocket
- The host sends an initial EncounterStateSnapshot
- A command can update a token property
- The host validates the command before applying it
- The host broadcasts the resulting event
- The host participates in the existing Swift initiative/turn signaling flow
```

## Milestone 4: Persistence

### Goal

Allow the referee to save and reload the first playable loop.

### Required work

```text
- Save and reload encounters
- Persist arena dimensions
- Persist arena image location
- Persist character locations
- Persist existing Swift server data
- Restore the encounter after reload
```

### Deliverable

The first playable loop survives closing and reopening without losing the arena or turn state.

### Acceptance criteria

```text
- The arena can be saved and reloaded
- Arena dimensions persist across reload
- Arena image location persists across reload
- Character locations persist across reload
- Existing Swift server data persists across reload
- Reloading restores the same active encounter state
```

## Milestone 5: Unity Referee View Becomes a Client

### Goal

Unity no longer owns authoritative state directly.

### Required work

```text
- Unity connects to Local Host
- Unity receives EncounterStateSnapshot
- Unity renders the host state
- Unity sends SelectTokenCommand
- Unity sends MoveTokenCommand
- Unity updates from host events
```

### Deliverable

Unity tactical map is driven by Local Host state.

## Milestone 6: Browser Referee Console

### Goal

Build the first real Referee control surface using web UI.

### Browser UI modules

```text
- Encounter dashboard
- Initiative panel
- Token list
- Selected token inspector
- HP editor
- Condition editor placeholder
- Visibility toggle
- Event log
- Connected device list placeholder
```

### Deliverable

Selecting a token in Unity updates the browser inspector. Editing a property in the browser updates Unity.

## Milestone 7: Shared Referee Tools and Selection

### Goal

Make Unity and browser feel like one Referee workspace.

### Shared context

```text
- selected token
- selected map object
- active tool
- active combatant
- selected display mode
```

### Deliverable

Unity and browser stay synchronized as one workspace.

## Milestone 8: Mobile Battlefield Interaction Prototype

### Goal

Prove that phone interaction works for players.

### Deliverable

Phone-playable prototype supporting pan, zoom, token selection, bottom sheet, movement preview, target preview, and LOS result.

## Milestone 9: Initiative and Turn Flow

### Goal

Make combat progression understandable and usable across Referee, player, and TV surfaces.

### Deliverable

Playable encounter loop:

```text
Start encounter
→ active token highlighted
→ player acts
→ end turn
→ next token highlighted
→ round advances
```

## Milestone 10: Apple TV Display Client

### Goal

Create the shared battle map display.

The Apple TV app should be a spectator/display client, not a full VTT control surface.

### Deliverable

Apple TV joins the hosted encounter and displays map, tokens, current turn, movement previews, targeting previews, and result callouts.

## Milestone 11: Director Camera

### Goal

Make the TV display useful without requiring remote control.

### Deliverable

The Apple TV display feels like a managed table camera, not a passive screen mirror.

## Milestone 12: Visibility and Information Control

### Goal

Prevent the shared display from revealing Referee-only information.

### Deliverable

Token visibility can differ by client role.

## Milestone 13: Referee Encounter Control

### Goal

Add enough Referee control to run a basic tactical encounter.

### Deliverable

A Referee can create and run a small encounter end-to-end using Unity for map work and browser UI for detailed controls.

## Milestone 14: Tactical Polish

### Goal

Make the app feel specifically designed for tactical play.

### Deliverable

A full small encounter feels readable and responsive on mobile, Referee desktop, and TV.

## Milestone 15: Launcher and Packaging

### Goal

Make the hybrid Referee system feel like one app.

### Deliverable

No manual terminal startup is required for normal Referee use.

## Suggested Development Order

```text
1. Unity tactical Referee prototype
2. Serializable EncounterState
3. Local Host process
4. Persistence
5. Unity Referee View as host client
6. Browser Referee Console
7. Shared Referee selection/tool state
8. Mobile player client
9. Initiative and turn loop
10. Apple TV display client
11. Director camera
12. Visibility filtering
13. Referee encounter authoring/control
14. Tactical polish
15. Launcher and packaging
```

## First Playable Prototype Target

The first meaningful prototype should support this complete scenario:

```text
Referee launches Tactical Table Top Referee.
Local Host starts.
Referee opens the arena setup UI.
Referee loads a battle map image.
Referee sets arena dimensions to 24 x 30 squares.
Referee places one LOS blocker.
Referee places one monster.
Referee starts the encounter.

Player joins the session.
Player claims the placed character.

Round 1 begins from the existing Swift server initiative flow.
Referee or player takes the active turn when signaled.

On a turn:
token moves snap to squares
token selection can target the opponent
the UI reports LOS validity
the UI reports cover as a whole percent
HP can be adjusted manually

Referee can adjust any character HP.
Player can adjust only their own character HP.

Referee saves the encounter.
Referee reloads the encounter.
Arena dimensions, image location, character locations, and server state restore.
```

The important point:

```text
Do not start by building complex Unity UI.
Do not start by duplicating the full tactical renderer in web.
Build Unity as the spatial viewport and browser as the control console.
```
