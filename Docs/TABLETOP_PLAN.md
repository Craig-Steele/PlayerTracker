# Tactical Table Top: Mobile-First Action Plan

## Product Direction

Refocus **Tactical Table Top** as a **mobile-first tactical tabletop simulator** with a strong in-person play model:

```text
Referee laptop/desktop = tactical control and authority
Player phones/tablets = personal tactical controllers
Apple TV / shared display = public battle map for the table
```

The app should not be “a desktop VTT squeezed onto a phone.” It should be:

```text
A mobile-first tactical combat system with a dedicated Referee workspace and shared table display.
```

The core design principle for players remains:

```text
One selected entity.
One current tactical decision.
Minimal persistent UI.
Contextual controls only.
```

The core design principle for the Referee is different:

```text
Unity is the spatial editor.
The browser is the inspector/control console.
The Local Host is the authority.
```

---

## Product Surfaces

Tactical Table Top should be designed around four cooperating surfaces/processes.

```text
1. Local Referee Host
   Authoritative encounter state, networking, save/load, event log.

2. Unity Referee View
   Desktop tactical viewport for map, tokens, LOS, movement, templates, spatial editing.

3. Browser Referee Console
   Web UI for details, properties, initiative, conditions, visibility, devices, logs.

4. Player and Display Clients
   Mobile player app and Apple TV shared display app.
```

This hybrid approach avoids two bad extremes:

```text
Bad extreme #1:
Build all Referee UI inside Unity.
Result: painful inspectors, forms, lists, initiative tables, and property editors.

Bad extreme #2:
Build the tactical map fully in the browser.
Result: duplicate renderer and weaker spatial tooling.
```

The recommended approach is:

```text
Unity for tactical/spatial interaction.
Browser UI for dense Referee controls.
Local Host for truth and synchronization.
```

---

## Recommended Architecture

```text
                         +----------------------+
                         |  Browser Referee UI  |
                         |  Properties/Details  |
                         +----------+-----------+
                                    |
                                    | WebSocket / HTTP
                                    |
+----------------------+     +------v-------+     +--------------------+
| Unity Referee View   |<--->| Local Host   |<--->| Unity Apple TV App |
| Tactical Map         |     | Authority    |     | Shared Display    |
+----------------------+     +------+-------+     +--------------------+
                                    ^
                                    |
                         +----------+-----------+
                         | Unity Mobile Clients |
                         | Player Controllers   |
                         +----------------------+
```

The **Local Host** owns truth.

The **Unity Referee View** is a privileged spatial client.

The **Browser Referee Console** is a privileged control/inspector client.

The **Player Mobile Client** is a permission-limited tactical controller.

The **Apple TV Client** is a mostly passive spectator/display client.

---

## State Ownership Rules

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

Example:

```text
Referee clicks Goblin Raider in Unity.
Browser inspector shows Goblin Raider.

Referee clicks Aldric in browser initiative list.
Unity highlights Aldric on the map.
```

Start with one authoritative Referee selection. Multi-select can come later.

---

## Communication Model

Use a command/event architecture.

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

The critical rule:

```text
Unity does not mutate final state directly.
The browser does not mutate final state directly.
Both send commands to the Local Host.
The Local Host validates, commits, and broadcasts events.
```

---

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

---

## Development Milestone 0: Product Scope Lock

### Goal

Define the first playable version tightly enough that development does not sprawl into a full VTT.

### MVP scope

```text
- One encounter
- One battle map
- Tokens on a grid or gridless surface
- Initiative order
- Active combatant
- Token selection
- Movement preview
- Basic line of sight
- Basic targeting
- Hybrid Referee workspace
- Shared Apple TV display mode
```

### Explicitly defer

```text
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

### Deliverable

A short product scope document answering:

```text
What is the app?
Who controls what?
What is the mobile user doing every turn?
What does the Referee control in Unity?
What does the Referee control in the browser?
What does the Apple TV display show?
What is intentionally not included?
```

---

## Development Milestone 1: Unity Tactical Referee Prototype

### Goal

Prove the spatial/tactical interaction in Unity before building the full hybrid system.

### Required systems

```text
- Battle map scene
- Token rendering
- Token selection
- Token movement
- Camera pan/zoom
- Line-of-sight preview
- Cover visualization placeholder
- Active token highlight
```

### Referee workflow

```text
Referee opens Unity prototype.
Referee loads a sample battle map.
Referee clicks a token.
Token becomes selected.
Referee previews movement.
Referee previews LOS to another token.
Referee advances active token manually.
```

### Deliverable

Referee can manipulate a sample encounter in Unity with no web UI yet.

---

## Development Milestone 2: Extract Serializable EncounterState

### Goal

Refactor Unity so the tactical scene is driven by serializable state instead of scene-only objects.

### Required work

```text
- Define EncounterState
- Define TokenState
- Define MapState
- Define TurnState
- Define VisibilityState
- Save/load sample EncounterState.json
- Render Unity scene from EncounterState
```

### Deliverable

Unity can load `EncounterState.json`, render the encounter, and apply basic state changes through a clean state API.

---

## Development Milestone 3: Local Referee Host

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
- Save EncounterState to disk
```

### Initial commands

```text
SelectTokenCommand
UpdateTokenCommand
MoveTokenCommand
AdvanceTurnCommand
```

### Deliverable

A test client can connect, update a token property, and receive a broadcast event.

---

## Development Milestone 4: Unity Referee View Becomes a Client

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

### Referee workflow

```text
Referee launches Local Host.
Referee opens Unity Referee View.
Unity connects to the host.
Unity displays the current encounter.
Referee clicks token in Unity.
Host receives selection command.
Host broadcasts TokenSelectedEvent.
Unity updates highlight from event.
```

### Deliverable

Unity tactical map is driven by Local Host state.

---

## Development Milestone 5: Browser Referee Console

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

### Workflow: select token in Unity, edit in browser

```text
Referee clicks Goblin Raider in Unity.
Unity sends SelectTokenCommand.
Host broadcasts TokenSelectedEvent.
Browser inspector updates to Goblin Raider.
Referee changes HP in browser.
Browser sends UpdateTokenCommand.
Host broadcasts TokenUpdatedEvent.
Unity updates Goblin Raider's health ring.
```

### Deliverable

Selecting a token in Unity updates the browser inspector. Editing a property in the browser updates Unity.

This milestone proves the hybrid Referee model.

---

## Development Milestone 6: Shared Referee Tools and Selection

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

### Unity toolbar placeholder

```text
Select
Move
Measure
LOS
Template
Reveal
```

### Browser controls

```text
Selected Token
Initiative
Visibility
Conditions
Ownership
Display Controls
Event Log
```

### Deliverable

Unity and browser stay synchronized as one workspace.

---

## Development Milestone 7: Mobile Battlefield Interaction Prototype

### Goal

Prove that phone interaction works for players.

### Player workflow: navigate map

```text
User opens encounter.
Map fills most of screen.
User drags to pan.
User pinches to zoom.
User double-taps active token to recenter.
```

### Player workflow: select owned token

```text
User taps owned token.
Token becomes selected.
Camera subtly centers selected token.
Bottom sheet appears.
Map remains visible.
```

### Placeholder bottom sheet

```text
Aldric
HP 24 / 31
Move 30 ft

[Move] [Attack] [Wait]
Conditions: Blessed
```

### Player workflow: move token

```text
User selects token.
User taps Move.
Valid movement area appears.
User taps destination.
Path preview appears.
User confirms movement.
Command is sent to Local Host.
Host validates.
Token moves on all clients.
```

### Player workflow: target enemy

```text
User selects active token.
User taps Attack.
Enemy tokens become target candidates.
User taps target.
LOS and cover result appears.
User confirms.
Result callout appears.
```

### Deliverable

Phone-playable prototype supporting pan, zoom, token selection, bottom sheet, movement preview, target preview, and LOS result.

---

## Development Milestone 8: Initiative and Turn Flow

### Goal

Make combat progression understandable and usable across Referee, player, and TV surfaces.

### Referee workflow

```text
Referee starts encounter from browser.
Initiative order appears in browser.
Unity highlights the active combatant.
Referee can advance turn manually.
```

### Player workflow

```text
Player sees whose turn it is.
If it is their turn, their owned token is highlighted.
Available actions appear.
Player moves, targets, or waits.
Player taps End Turn.
```

### Shared display workflow

```text
Apple TV shows:
Round 2
Aldric's Turn

Camera centers Aldric.
Initiative sidebar shows current and next actors.
```

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

---

## Development Milestone 9: Apple TV Display Client

### Goal

Create the shared battle map display.

The Apple TV app should be a spectator/display client, not a full VTT control surface.

### Apple TV workflow: join session

```text
Apple TV app opens.
Displays:

Tactical Table Top Display
Code: 482193

Referee browser console shows available display.
Referee approves connection.
TV joins the active encounter.
```

### Apple TV workflow: display active turn

```text
TV shows battle map.
Current actor is highlighted.
Camera centers active actor.
Overlay shows:

Round 3
Aldric's Turn
Next: Goblin Raider
```

### Apple TV workflow: display movement

```text
Player previews movement on phone.
TV shows path preview.
Destination marker appears.
When confirmed, token animates along path.
```

### Apple TV workflow: display targeting

```text
Player chooses target.
TV frames attacker and target.
Line appears between them.

LOS: Clear
Cover: None
```

### Apple TV workflow: display result

```text
Attack resolves.
TV shows large callout:

Aldric attacks Hobgoblin Captain
Hit
13 damage
```

### Minimal Apple TV controls

```text
Remote click: recenter on active token
Swipe: pan map
Up/down: zoom in/out
Back/Menu: show or hide overlay
Play/Pause: toggle director camera
```

### Deliverable

Apple TV joins the hosted encounter and displays map, tokens, current turn, movement previews, targeting previews, and result callouts.

---

## Development Milestone 10: Director Camera

### Goal

Make the TV display useful without requiring remote control.

### Camera behaviors

```text
Start of turn:
Center active token.

Movement preview:
Frame start position, path, and destination.

Targeting preview:
Frame attacker and target.

Area effect:
Zoom out to include full template.

Result:
Hold framing briefly while showing callout.

Idle:
Return to active token framing.
```

### Browser display controls

```text
[Follow Active Token]
[Frame Selection]
[Frame Whole Party]
[Frame Encounter]
[Show Movement Paths]
[Show LOS]
[Hide Overlays]
```

### Deliverable

The Apple TV display feels like a managed table camera, not a passive screen mirror.

---

## Development Milestone 11: Visibility and Information Control

### Goal

Prevent the shared display from revealing Referee-only information.

### Required visibility layers

```text
Referee View
- Everything

Player View
- What that player or character can know

Shared Table View
- What the party collectively sees
```

### Apple TV rule

The Apple TV renders **Shared Table View**, never Referee View.

### Example

```text
Hidden goblin behind wall:
- Referee sees it in Unity and browser.
- Player does not see it.
- Apple TV does not show it.

Goblin revealed:
- Referee changes visibility.
- Player devices see it.
- Apple TV shows it.
```

### Deliverable

Token visibility can differ by client role.

---

## Development Milestone 12: Referee Encounter Control

### Goal

Add enough Referee control to run a basic tactical encounter.

### Create encounter workflow

```text
Referee selects map.
Referee places tokens in Unity.
Referee edits token details in browser.
Referee assigns teams.
Referee assigns player ownership.
Referee sets initiative order.
Referee starts encounter.
```

### Control enemy workflow

```text
Referee selects enemy token in Unity.
Referee moves enemy spatially.
Referee targets player character.
Referee applies damage or condition in browser.
Referee ends enemy turn.
```

### Reveal/hide workflow

```text
Referee selects hidden token.
Browser inspector shows visibility status.
Referee taps Reveal.
Host updates visibility.
Token appears on player and TV displays.
```

### Initiative workflow

```text
Referee opens initiative panel in browser.
Referee drags or edits turn order.
Host updates initiative.
Unity highlights active token.
TV follows active token.
```

### Deliverable

A Referee can create and run a small encounter end-to-end using Unity for map work and browser UI for detailed controls.

---

## Development Milestone 13: Tactical Polish

### Goal

Make the app feel specifically designed for tactical play.

### Add after the core loop works

```text
- Movement range shading
- Path cost display
- Difficult terrain support
- Reach indicators
- Opportunity attack warnings
- Cover indicators
- Area templates
- Condition badges
- Health rings
- Team color rings
- Turn transition animation
- Damage/result callouts
```

### Deliverable

A full small encounter feels readable and responsive on mobile, Referee desktop, and TV.

---

## Development Milestone 14: Persistence

### Goal

Allow the Referee to save and reload encounters.

### Save data

```text
Campaign or Session
- encounters
- maps
- tokens
- ownership
- initiative
- current combat state
- visibility state
- event log
```

### Minimum persistence

```text
Save encounter
Load encounter
Duplicate encounter
Resume active encounter
Export encounter JSON
Import encounter JSON
```

### Deliverable

The app survives closing/reopening and can resume combat.

---

## Development Milestone 15: Launcher and Packaging

### Goal

Make the hybrid Referee system feel like one app.

### User-facing launch flow

```text
Referee launches Tactical Table Top Referee.
Local Host starts.
Unity Referee View opens.
Browser Referee Console opens.
Session code appears.
Players join from phones.
Apple TV joins as shared display.
```

### Avoid requiring

```text
- manual terminal commands
- manually opening localhost URLs
- manually typing IP addresses into Apple TV
```

### Deliverable

No manual terminal startup is required for normal Referee use.

---

## Development Tools Required

## Core development

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

### C#

Use C# for Unity client logic:

```text
- Tactical rendering controllers
- Token presentation
- Client-side previews
- Camera behavior
- Input handling
- Unity WebSocket client
- Local state projection from host events
```

### Xcode

Required for Apple platform builds:

```text
- iOS build signing
- iPadOS builds
- tvOS builds
- Apple Developer provisioning
- Device testing
```

### Apple Developer Account

Required eventually for:

```text
- Real-device deployment beyond local development limits
- TestFlight
- App Store distribution
- tvOS distribution
```

---

## Local Host Technology Options

The Local Host should be cross-platform and authoritative.

### Option A: Go Host

Advantages:

```text
- Single binary distribution
- Strong networking support
- Easy cross-platform builds
- Good WebSocket support
- Can embed browser UI assets
- Low runtime overhead
```

Best if you prioritize simple packaging and cross-platform local hosting.

### Option B: C#/.NET Host

Advantages:

```text
- Same language family as Unity
- Potential shared models with Unity
- Strong server tooling
- Cross-platform
```

Best if you prioritize shared data models and C# consistency.

### Option C: TypeScript/Node Host

Advantages:

```text
- Fast web UI iteration
- Same language as frontend
- Easy WebSocket development
- Large package ecosystem
```

Best if you prioritize rapid web app development.

### Recommendation

Best candidates:

```text
Go Host + TypeScript Web UI + Unity C# Clients
```

or:

```text
C#/.NET Host + TypeScript Web UI + Unity C# Clients
```

Use **Go** if packaging simplicity matters most.

Use **C#/.NET** if sharing models with Unity matters most.

---

## Browser Referee UI Stack

Recommended stack:

```text
Vite
TypeScript
React or Svelte
WebSocket client
Plain CSS, CSS modules, or lightweight component library
```

The browser UI should treat the host state as authoritative:

```text
Host state snapshot
+
Event stream
+
Local form state
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

---

## Networking and Pairing

### Recommended networking model

```text
Host-authoritative
Command/event based
Local network first
Session code pairing
```

### Pairing flow

```text
Referee Host starts session.
Browser console displays session code and QR code.
Player scans QR code or enters code.
Apple TV displays pairing code.
Referee approves display connection.
```

Do not make users type IP addresses into an Apple TV app.

---

## Data and Serialization

Use JSON first.

Serialize:

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

Later options:

```text
- SQLite
- LiteDB, if using .NET
- Embedded database
- Cloud persistence
- Custom binary format
```

Early development should favor debuggability over efficiency.

---

## Testing Tools

### Unity Test Framework

Use for:

```text
- Movement legality
- LOS blocked/unblocked
- Cover calculation
- Turn advancement
- Visibility filtering
- Client state projection
```

### Host/server tests

Use standard tests for the chosen host stack.

Test:

```text
- Command validation
- Event broadcasting
- State snapshots
- Save/load
- Visibility filtering
- Permission enforcement
```

### Browser UI tests

Later, use:

```text
- Playwright
- Vitest
- Component tests
```

### Device testing

Physical testing will be required on:

```text
- iPhone
- iPad if possible
- Apple TV if possible
- Mac/Windows Referee machine eventually
```

Simulator testing is useful but not enough for touch ergonomics, LAN behavior, or TV remote behavior.

---

## Suggested Repository Structure

```text
TacticalTableTop/
|
|-- Host/
|   |-- cmd/
|   |-- internal/
|   |-- protocol/
|   |-- saves/
|
|-- WebReferee/
|   |-- src/
|   |-- public/
|   |-- package.json
|
|-- Unity/
|   |-- Assets/
|   |   |-- Scripts/
|   |   |   |-- SimulationProjection/
|   |   |   |-- Networking/
|   |   |   |-- Presentation/
|   |   |   |-- Input/
|   |   |   |-- UI/
|   |   |
|   |   |-- Scenes/
|   |   |   |-- RefereeView.unity
|   |   |   |-- MobileClient.unity
|   |   |   |-- TVDisplay.unity
|   |   |
|   |   |-- Prefabs/
|   |   |-- Tests/
|
|-- SharedProtocol/
|   |-- schema/
|   |-- examples/
|
|-- Docs/
|   |-- TABLETOP_PLAN.md
|
|-- SampleData/
    |-- Encounters/
    |-- Maps/
    |-- Tokens/
```

---

## Suggested Development Order

```text
1. Unity tactical Referee prototype
2. Serializable EncounterState
3. Local Host process
4. Unity Referee View as host client
5. Browser Referee Console
6. Shared Referee selection/tool state
7. Mobile player client
8. Initiative and turn loop
9. Apple TV display client
10. Director camera
11. Visibility filtering
12. Referee encounter authoring/control
13. Tactical polish
14. Persistence
15. Launcher and packaging
```

The important point:

```text
Do not start by building complex Unity UI.
Do not start by duplicating the full tactical renderer in web.
Build Unity as the spatial viewport and browser as the control console.
```

---

## First Playable Prototype Target

The first meaningful prototype should support this complete scenario:

```text
Referee launches Tactical Table Top Referee.
Local Host starts.
Unity Referee View opens with a sample encounter.
Browser Referee Console opens.

Referee selects Goblin Raider in Unity.
Browser inspector shows Goblin Raider.

Referee changes Goblin Raider HP in browser.
Unity health ring updates.

Player opens phone client.
Player joins session.

Apple TV joins as display.

Round 1 begins.
Aldric is active.

Player selects Aldric on phone.
Player taps Move.
Movement range appears.
Player taps destination.
Phone shows movement preview.
TV shows movement path.
Referee Unity view shows same preview.
Player confirms.
Aldric moves.

Player taps Attack.
Player selects Goblin Raider.
Phone shows:
LOS: Clear
Cover: None

TV frames Aldric and Goblin Raider.
Player confirms attack.
Result callout appears on phone, TV, and Referee event log.

Player ends turn.
Goblin Raider becomes active.
```

That is the core experience.

Everything else can build from there.

---

## Final Recommendation

Use a hybrid Referee architecture:

```text
Unity Referee View
+
Browser Referee Console
+
Local Host Authority
```

This gives the project:

```text
- Unity-quality tactical visualization
- Browser-quality property editing
- Clean server-authoritative state
- Cross-platform Referee potential
- Strong local/in-person play model
- Good path to future remote/cloud hosting
- Clear separation between spatial editing and detailed control panels
```

The implementation rule to protect throughout development:

```text
The Local Host is the truth.
Unity is the spatial editor.
The browser is the inspector.
Players submit commands.
The Apple TV displays shared state.
```
