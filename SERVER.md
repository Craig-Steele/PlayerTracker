# Server Workflow

This document covers the local server-owner workflow for Roll4Initiative.

The server owner signs into the server itself, not a central Roll4Initiative account service.
The web admin page includes the owner sign-up/login/logout/session-restore controls.

## Sign Up

Use the auth signup endpoint to create the server-owner account:

```text
POST /auth/signup
```

Provide an email, password, and optional display name. The server stores the account locally and returns a signed-in session cookie.

## Log In

Use the auth login endpoint to start a new signed-in session:

```text
POST /auth/login
```

The server verifies the email and password, then returns the same kind of session cookie.

## Restore Session

When the browser reloads or reopens, the web client can call:

```text
GET /auth/session
```

If the session cookie is still valid, the server returns the signed-in owner identity. The browser stays signed in without asking for the password again.

## Log Out

Use the auth logout endpoint to end the current session:

```text
POST /auth/logout
```

The server revokes the session and clears the cookie. A later restore call will fail until the owner logs in again.

## Shut Down

After signing in, the admin page exposes a Shutdown button:

```text
POST /admin/shutdown
```

The server asks for confirmation in the browser, then shuts itself down after the request is accepted. This is owner-gated and intended for local server management only.
