# Tactical Table Top Map (`.tttm`) Format

This document defines the current `.tttm` map package and gives source-to-package guidance for agents that create maps from adventure PDFs or other published material. The package is a ZIP archive; its sidecar metadata is the renderer-independent map contract. Do not add fields or meanings that are not described here without coordinating a format-version change.

## Package identity and contents

- `.tttm` is the canonical extension for new Tactical Table Top Map packages.
- The archive uses ZIP and currently contains exactly one PNG map image and exactly one JSON sidecar whose filename ends in `.map.json`.
- The current exporter writes both files at the archive root with a shared filename stem, for example `Crypt.png` and `Crypt.map.json`.
- `imagePath` in the sidecar names the PNG. Keep it equal to the PNG's package-relative path; do not use absolute paths, URLs, or paths outside the package.
- The PNG is the visual map background. Grid alignment is baked into its raster bounds; semantic overlays remain in JSON and are not baked into the PNG.
- `.zmap` and `.map.zip` are accepted legacy import extensions. New exports use `.tttm`; changing the extension does not change the ZIP representation.

Example package:

```text
Crypt.tttm                 # ZIP archive
├── Crypt.png
└── Crypt.map.json
```

The current writer stores ZIP entries without compression. Consumers should treat the file as a ZIP package, not depend on that compression detail.

## Metadata identity and compatibility

Every new sidecar must contain:

```json
"format": "TacticalTableTop.Map",
"version": 1
```

The format identifier prevents another TTT resource type from being interpreted as a map. `version` is the map metadata schema version; it is distinct from the enclosing ZIP format and from the JSON Schema document's own version. A reader must reject an unknown format identifier or unsupported future map version with an actionable error.

Legacy TTT sidecars may omit `format` and/or `version`; current readers interpret omitted fields as `TacticalTableTop.Map` version `1`. When generating new packages, always write both fields. Do not silently rewrite an input `.zmap` or `.map.zip`; write a `.tttm` only when explicitly exporting.

## Version 1 sidecar

The following is a complete minimal example. Optional fields may be omitted as described below; current Codable decoding requires the core fields shown.

```json
{
  "format": "TacticalTableTop.Map",
  "version": 1,
  "imagePath": "Crypt.png",
  "grid": {
    "eastWestSquareCount": 12,
    "northSouthSquareCount": 9,
    "squareSizeFt": 5,
    "coordinateConvention": { "origin": "southwest" },
    "boundaryBehavior": "bounded"
  },
  "blockedTiles": [
    { "x": 4, "y": 3 }
  ],
  "terrain": {
    "defaultType": "normal",
    "overrides": [
      { "x": 7, "y": 1, "width": 3, "height": 2, "type": "water" }
    ]
  },
  "elevation": {
    "defaultHeightFt": 0,
    "overrides": [
      { "x": 2, "y": 5, "width": 2, "height": 2, "heightFt": 5 }
    ]
  },
  "edges": [
    { "axis": "vertical", "x": 6, "y": 2, "type": "wall" },
    { "axis": "horizontal", "x": 6, "y": 2, "type": "door", "widthFt": 3, "initialState": "closed", "locked": false }
  ],
  "mapPresentation": {
    "sideWallColor": { "r": 0.1, "g": 0.1, "b": 0.1, "a": 0.5 }
  },
  "playerPlacement": {
    "defaultBounds": { "west": 1, "east": 4, "south": 1, "north": 3 }
  },
  "stickers": [
    { "x": 5, "y": 4, "emoji": "🌳", "sizePercent": 200, "opacityPercent": 75 }
  ]
}
```

### Coordinates and grid

- Grid indices are zero-based integers. `x` increases west-to-east; `y` increases south-to-north. The origin is the southwest corner (`coordinateConvention.origin` is `southwest`).
- A square point `{ "x": 0, "y": 0 }` is the bottom-left cell. The image is conventionally viewed from above with its first pixel row at the top; convert between image rows and map `y` using `imageRow = northSouthSquareCount - 1 - y`.
- `eastWestSquareCount` and `northSouthSquareCount` are positive counts, not maximum indices. Valid cell coordinates are `0 <= x < columns`, `0 <= y < rows`.
- `squareSizeFt` is the physical side length represented by one grid square, in feet. Do not guess it from artwork scale when the adventure provides no scale. Use an explicit, clearly reported assumption only when the workflow requires one.
- The PNG's bounds align to the declared grid: its full width and height represent the declared column and row counts. During authoring, calibration uses a 5×5 or 10×10 patch; once accepted, the image is expanded on each side to the nearest full grid boundaries using the map's infinite-fill color. This preserves the source pixels while making the resulting package use ordinary image-edge alignment. Grid offsets are not serialized or used by tactical rendering.
- Keep the source map's actual raster proportions; do not stretch one axis independently to force an apparent fit. If a source has page borders or unrelated content, prepare the image before loading it into the authoring tool.
- `boundaryBehavior` is `bounded` or `infinite`. Bounded restricts placement to the map image; infinite permits play beyond the image. Neither value creates wall records.

### Semantic layers

Each layer has a separate meaning. Do not collapse all visual markings into one type; where the source supports it, the same square can have independent terrain, elevation, obstacle, and sticker records.

- `blockedTiles`: array of blocked square points. These mean a square cannot be entered (for example, a solid pillar or a clearly impassable boulder). They are not a synonym for difficult terrain, water, walls, or decorative scenery.
- `terrain`: `defaultType` is normally `normal`; `overrides` are rectangles with `x`, `y`, positive `width` and `height`, and `type`. Current authoring/tactical terrain types are `normal`, `difficult`, `water`, `lava`, and `impassible`. `impassible` is a terrain property that prohibits entry; `blockedTiles` remains the separate obstacle layer. Use only types appropriate to what the source actually depicts.
- `elevation`: `defaultHeightFt` plus rectangular overrides with `x`, `y`, `width`, `height`, and `heightFt`. Values are elevations in feet relative to the map's represented baseline. A contour or height label should affect only the area the source establishes; do not extrapolate uncertain contour boundaries as fact.
- `edges`: optional array of wall/door/window features on grid-line segments, each represented once. `axis` is `vertical` or `horizontal`; `type` is `wall`, `doorway`, `door`, `secretDoor`, or `window`. A vertical edge lies on grid line `x` between cells/vertices `y` and `y + 1`; a horizontal edge lies on grid line `y` from `x` to `x + 1`. Valid vertical coordinates have `0 <= x <= columns` and `0 <= y < rows`; horizontal coordinates have `0 <= x < columns` and `0 <= y <= rows`. No more than one feature may occupy an axis-and-coordinate location. Omitted segments are open/unmarked, not implicit walls.
  - Doors require a positive `widthFt` and include `initialState` (`open` or `closed`) and `locked`. In the authoring UI, Door Initial State choices map to metadata as follows: `Closed` → `initialState: "closed", locked: false`; `Closed and Locked` → `initialState: "closed", locked: true`; `Open` → `initialState: "open", locked: false`. `locked` is authoring/referee metadata, not a player-facing locked/unlocked visual distinction.
  - `doorway` remains a valid metadata type for compatibility and width annotation, although the current authoring UI offers wall and door tools rather than a separate doorway tool.
  - `secretDoor` is a secret wall-edge feature with no door state fields. It is magenta in authoring and referee tactical views. The server serializes it as an ordinary `wall` in player map responses so its identity is not disclosed in the player's map JSON.
  - `window` requires a positive `widthFt` and `initialState`: `uninspected` means no visibility through to the area inside and is impassable; `inspected` means visibility through and is impassable; `open` means visibility through and passable. These states describe authored starting metadata. The current authoring/package support does not implement tactical visibility/line-of-sight, movement enforcement, or runtime state transitions.
- `playerPlacement.defaultBounds`: optional inclusive rectangle with `west`, `east`, `south`, and `north` cell coordinates. It is a suggested/default player start area, not a wall or an obstacle.
- `stickers`: optional visual-only emoji objects with cell anchor `x`,`y`, `emoji`, `sizePercent` (33–500% of a square), and optional `opacityPercent` (0–100; omitted legacy value defaults to 100%). Stickers are decorative and must not encode collision or movement rules.
- `mapPresentation`: renderer appearance metadata. `sideWallColor` is a required RGBA object (`r`,`g`,`b`,`a`, each normalized 0–1) in current models. `outsideMapFill`, `terrainBoundary`, and `blankBackgroundColor` are optional renderer-facing values; `blankBackgroundColor` is a `#RRGGBB` color for a generated solid-color map background.

Rectangular overrides are a compact encoding of repeated cells. Prefer non-overlapping rectangles and merge adjacent equal values when doing so preserves the source meaning. If an override covers one cell, use `width: 1` and `height: 1`.

The map file describes static geometry and presentation, not all game rules or encounter state. Do not add custom fields for creature footprints or squeezing; those are ruleset/runtime decisions. Door state changes during play belong to encounter state, not a rewritten map package.

## Producing a map from a PDF adventure

An agent creating a `.tttm` from source material should use this order and preserve uncertainty instead of manufacturing detail:

1. **Locate and extract the map.** Identify the page/panel that contains the tactical map. Render or extract it at sufficient resolution for grid lines, door gaps, symbols, and labels to remain legible. Crop to the map image, excluding page furniture where possible, but retain labels, compass indicators, scale bars, and legend material needed to interpret it. Do not redraw or alter the map artwork unless asked.
2. **Establish orientation.** Read compass/legend cues and confirm which side is north. TTT coordinates have south at `y = 0`; rotate only when source evidence requires it. Record an assumption if north is uncertain.
3. **Calibrate the grid.** Count complete columns and rows from visible grid lines or cell structure. Set `squareSizeFt` from the adventure's scale text, legend, or explicit encounter description. If grid lines are absent, establish a defensible grid from repeated room/cell geometry and report the method and confidence. Do not claim exact alignment where the PDF raster does not support it.
4. **Create the base package data.** Use the prepared map image as PNG and set `imagePath` to that packaged image's relative path. Add required grid metadata and version identity. Keep the image at its extracted aspect ratio; do not resize one axis independently to force a fit.
5. **Transcribe features into independent layers.** Map clearly depicted blocked squares to `blockedTiles`; terrain regions to `terrain.overrides`; height labels/contours to `elevation.overrides`; walls and door openings to `edges`; and purely decorative symbols to `stickers`. Consult any legend before interpreting symbols. A doorway gap is not a wall, and an omitted edge is not a wall. Water or lava may also be difficult/impassible only when the rules/source says so; their visual appearance alone does not establish movement rules.
6. **Report ambiguity.** Keep uncertain features out of authoritative collision/terrain metadata rather than inventing them. Provide a short companion note listing unresolved grid scale, orientation, feature classification, or boundary questions. If the task requires a complete playable map, ask for clarification or label every assumption explicitly.
7. **Validate and package.** Confirm positive grid dimensions and square size; all cell and rectangle coordinates are within bounds; edge axes/types/positions are valid and unique; door state/width are valid; sticker sizes/opacities are in range; and all feature coordinates line up with the PNG. Serialize valid JSON, then package exactly one PNG and one `.map.json` sidecar in a ZIP archive named with `.tttm`.

## Validation and interoperability checklist

- JSON parses as an object and uses `format: TacticalTableTop.Map`, `version: 1` for new output.
- `imagePath` resolves to the package PNG; archive contains exactly one PNG and one `.map.json` sidecar.
- Grid counts and square size are positive; origin is `southwest`; image and grid align.
- Cell positions are in range; rectangle widths/heights are positive and remain within the grid.
- Edges use valid axes/types and coordinates, are unique by axis/x/y, and doors have a positive width and valid initial state.
- Sticker content is non-empty and within size/opacity limits.
- Source-derived interpretation notes accompany uncertain PDF readings; they are not silently embedded as unsupported JSON fields.
- ZIP can be imported by a current TTT referee map selector. Legacy `.zmap` inputs remain readable but should not be renamed or rewritten without an explicit export.

## Reserved resource extensions

- `.tttm` — Tactical Table Top Map (this document).
- `.tttc` — Tactical Table Top Character (reserved; no new serialization contract is defined here).
- `.tttx` — Tactical Table Top aggregate/campaign package (reserved; no new serialization contract is defined here).
