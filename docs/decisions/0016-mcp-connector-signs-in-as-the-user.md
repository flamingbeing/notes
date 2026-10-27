# 0016: the MCP connector signs in as the user

Status: accepted, 2026-10-27

## Decision

`mcp/` is a local MCP server (stdio) for Claude Desktop (`.mcpb`) and Claude Code. It signs in with Google (PKCE,
loopback), turns that into a Firebase sign-in, asks the Worker's `/api/claims` for the role claims and reads and
writes Firestore REST as that person, under the same rules as the page.

## Why

- No bypass: the rules read `request.auth.token.g._`, so a plain Firebase sign-in has no role and is refused. Asking
  `/api/claims` (as the page does) gives the connector exactly the person's own access, and nothing a service
  account could add.
- Needs only the project's free Desktop OAuth client; no server, no stored admin key.
- Overwrite and delete are allowed (owner decision), but shown first (`confirm`), version-checked, and a delete goes
  to the bin as the app does.

## Consequences

Note shapes are imported from `app/src/notes` so the connector and the page cannot drift. The Desktop OAuth client
id and secret are public by design (`mcp/config.mjs`).
