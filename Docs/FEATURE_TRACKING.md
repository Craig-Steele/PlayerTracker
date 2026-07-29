# Feature Tracking

Use this document to capture feature ideas, rough notes, decisions, and follow-up work outside the formal roadmap.

Keep entries short and concrete. One idea per line or table row is usually enough.

## How To Use

- Add new ideas near the top of the backlog.
- Record the source of the idea when it came from a user request, bug report, or internal discussion.
- Note the expected benefit, any dependencies, and whether the idea is still viable.
- Move items to `In Progress`, `Decided`, or `Parked` as the idea gets clarified.

## Backlog

| Date | Idea | Source | Why it matters | Notes | Status |
| --- | --- | --- | --- | --- | --- |
| 2026-06-11 | Controlled creatures: let players add creatures they control, such as familiars and companions, with referee approval by individual creature or by category like livestock, familiars, or beasts | User request | Supports player-controlled creatures without giving unrestricted monster access | Likely needs a referee approval workflow plus category-based permissions and per-creature approval state | Draft |
| 2026-06-11 | Display QR sizing: let the display page enlarge the QR code during encounter setup and shrink it back when the encounter starts | User request | Improves scanability during setup while keeping the live encounter display less visually dominant | Likely needs display-state awareness and a simple QR size toggle tied to encounter phase | Draft |
| 2026-06-11 | Optional point tracking: support additional resource pools such as Psi points, Wildshape uses, and Spell Slots, similar to TempHP | User request | Extends the existing lightweight resource tracking model to more rulesets and character resource types | Likely needs a generalized resource field model instead of one-off special cases for each pool | Draft |
| 2026-06-11 | Traveller pre-initiative skill checks: support rulesets where a skill check such as Tactics can modify initiative for the entire party | User request | Enables ruleset-specific initiative setup instead of forcing all systems into the same turn-order flow | Likely needs ruleset-driven encounter setup and a way to apply a shared initiative modifier before combat starts | Draft |
| 2026-06-11 | Admin data export: allow the admin page to download the server data file as SQLite | User request | Gives the server owner a direct backup/export path from the UI | Likely needs careful handling of file access, download authorization, and any in-use database state | Draft |
| 2026-06-11 | Admin server restart control: allow the admin page to restart the server instead of only shutting it down | User request | Lets the server owner recover from transient issues without a separate terminal/session | Likely touches admin actions, shutdown semantics, and any safeguards around disruptive server control | Draft |
| 2026-06-11 | Player Management: from Admin or Referee pages, add/remove/list the players in a campaign | User request | Gives campaign hosts a direct way to manage membership from the main operational pages | Likely touches campaign membership, invite flow, and role/permission checks on both admin and referee surfaces | Draft |
| 2026-06-11 |  |  |  |  | Draft |

## In Progress

| Date | Idea | Owner | Next step | Notes | Status |
| --- | --- | --- | --- | --- | --- |

## Decided

| Date | Idea | Decision | Reason | Notes |
| --- | --- | --- | --- | --- |

## Parked

| Date | Idea | Reason parked | Revisit trigger | Notes |
| --- | --- | --- | --- | --- |

## Notes

- Prefer concrete behavior changes over broad themes.
- If an idea touches an existing roadmap item, link to the relevant section in `PRODUCTION_PLAN.md` or `TEST_PLAN.md`.
- If an idea becomes a committed delivery target, move it out of this document and into the appropriate plan.
