# 0019: MCP sign-in by code

Status: accepted, 2026-10-27 (supersedes the sign-in part of 0016 as the default; the PKCE path stays)

## Decision

Settings → Advanced → Connect MCP shows a code (valid until Disconnect, not used up): `nmcp1.` + base64url of the project id and this sign-in's
Firebase refresh token (`app/src/mcp/code.js`, shared with `mcp/`). `node mcp/server.mjs login <code>` checks it with
one refresh at securetoken.googleapis.com (public Web API key), then keeps the refresh token and email in the 0600
token file. The Google Desktop-client sign-in is used only when `mcp/config.mjs` has a client.

Disconnect MCP calls the Worker's `POST /api/sessions/revoke` (`worker/sessions.js`: Identity Toolkit `validSince` for
the caller's own account) and signs the device out.

## Why

- The owner has no Google console step: the Desktop client of 0016 needed one click that was never done.
- Same access as the page: it is the page's own sign-in, so the rules and `/api/claims` apply unchanged.

## Consequences

- Firebase cannot end one refresh token: Disconnect (and "sign out everywhere") ends all of the account's sign-ins, the
  page's included. The sheet says so and asks twice.
- The code is as strong as a sign-in: shown on a tap, cleared when the sheet closes, never stored in a file or the app's
  data. The option is off by default and per device.
- Already-issued ID tokens run out within the hour: Disconnect ends refresh, not the token in hand (the rules do not check
  `validSince`). `login` reads the code at a hidden prompt, never from argv.
- No OS keychain (it would add a native dependency to the `.mcpb`); a 0600 file as before.
