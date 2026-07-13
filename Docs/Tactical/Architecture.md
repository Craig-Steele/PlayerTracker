# Tactical Architecture

The tactical system uses a host-authoritative command/event model.

Rules:

- clients project state
- the host validates and commits
- snapshots resync clients
- shared protocol types define the wire contract
