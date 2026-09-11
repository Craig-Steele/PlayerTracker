# Railway deployment

This repository is prepared for a single Railway service built from the root `Dockerfile`. Railway detects a root-level file named exactly `Dockerfile`; no Railway config file is required for this setup.

## Container contract

- The executable is `PlayerTracker`.
- The server binds to `0.0.0.0`.
- `PORT` is used when it is a valid TCP port; local/default fallback is `8080`.
- `Client-Web` is copied to `/app/Client-Web` and served by Vapor.
- `/health` returns HTTP `200 OK` with body `OK`.
- Browser and local-folder launching are disabled in the container.
- Production mode is the default; set `PLAYERTRACKER_ENV=development` only for local HTTP development.

## Railway service setup

1. In Railway, create a project and add a service from the GitHub repository and the `main` branch. The service should use the repository root as its source directory.
2. Railway will build the root `Dockerfile`. Do not add a start command that bypasses the image entrypoint.
3. In the service **Variables** tab, add `PLAYERTRACKER_DATA_DIR=/data`.
4. Add a Railway Volume to this service and set its mount path to `/data`. The application stores SQLite under `/data/TacticalTableTop/Initiative/data/app.sqlite3`.
5. Because Railway mounts volumes as `root` while this image runs as `playertracker`, add the Railway configuration variable `RAILWAY_RUN_UID=0` so the application can write to the mounted volume.
6. In service settings, set the healthcheck path to `/health`.
7. Under **Networking → Public Networking**, use **Generate Domain** only when the service is ready to be internet-accessible.

Railway supplies `PORT` at runtime. Do not hard-code a public port or commit secrets. The Docker image defaults `PLAYERTRACKER_ENV=production`, `ROLL4INITIATIVE_LAUNCH_BROWSER=0`, and `ROLL4INITIATIVE_OPEN_LOCAL_FOLDERS=0`; keeping those values explicit as service variables is optional.

For local macOS development, run with `PLAYERTRACKER_ENV=development`. This restores browser/Finder launching and permits HTTP cookies. The runtime mode is intentionally independent of `PORT`.

## Local container smoke test

```sh
docker build -t playertracker .
docker run --rm -p 8080:8080 -e PORT=8080 -e PLAYERTRACKER_DATA_DIR=/data playertracker
```

Then request `/health`, `/`, and a static page such as `/index.html` from the host. Use a bind mount for `/data` when testing persistence across container restarts.

## Security review before public deployment

The following must be resolved or consciously accepted before exposing this application publicly:

- Production authentication/session cookies now use the `Secure` flag; local HTTP development requires `PLAYERTRACKER_ENV=development`.
- `/admin/shutdown` calls the existing `requireServerOwnerSession`, but that helper currently checks authentication rather than a distinct owner role.
- Signup, player joining, and several library/state reads are internet-reachable by design; add rate limiting and/or access policy if this is not intended to be public.
- `/server-ip` exposes local/public address information and calls an external IP service; disable or protect it if it is not needed remotely.
- Review CORS, CSRF protection, request limits, and logging before production use. No WebSocket routes were found; the server currently uses HTTP/SSE event streams.

## Intentionally deferred

SQLite/Fluent remains unchanged. A Railway Volume is required for data to survive redeploys, and SQLite is a single-instance persistence choice; PostgreSQL and any storage architecture change are intentionally deferred. Railway project creation, volume creation, domain generation, secrets, and deployment are also deferred.
