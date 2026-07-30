# Tactical Table Top: Product Vision

## Goal

Refocus **Tactical Table Top** as a **mobile-first tactical tabletop simulator** for in-person play.

## Core Setup

```text
Referee laptop/desktop = tactical control and authority
Player phones/tablets = personal tactical controllers
Apple TV / shared display = public battle map for the table
```

The app should not be a desktop VTT squeezed onto a phone. It should be a tactical combat system with a dedicated Referee workspace and a shared table display.

## Product Principles

Players should experience:

```text
One selected entity.
One current tactical decision.
Minimal persistent UI.
Contextual controls only.
```

The Referee experience is different:

```text
Unity is the spatial editor.
The browser is the inspector/control console.
The Local Host is the authority.
```

## Product Surfaces

The product is designed around four cooperating surfaces:

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

## Scope Boundaries

This product is intentionally not a full VTT.

Defer:

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

## Near-Term Scope

The initial implementation should start with a narrow tactical slice, but that is a roadmap constraint, not the product ceiling.

The roadmap defines the first playable loop. This vision stays broader:

```text
- mobile-first tactical tabletop play
- referee authority with player-controlled characters
- Unity for spatial manipulation
- browser for detailed control and inspection
- host-authoritative synchronization
- shared display support
- room to grow into richer tactical rules, map tooling, and encounter management
```

The early build should prove the core play model, then expand from there.
