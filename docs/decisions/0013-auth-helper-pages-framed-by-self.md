# 0013: With the sign-in domain on the app's own host, the Worker lets Firebase's helper pages be framed by itself

Status: accepted (2026-10-26)

Decision:

- When `authDomain` is the app's own host, Firebase's sign-in loads its helper pages (`/__/auth/*`) in an iframe on
  that same host. The Worker therefore sends `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` for those
  paths (`framedBySelf` in `worker/headers.js`), and `DENY` / `'none'` everywhere else.
- The OAuth web client needs `https://<host>/__/auth/handler` among its authorized redirect URIs, and the host must be
  in Firebase's authorized domains.

Why: with `DENY` on the helper pages the browser refuses the frame, Google sign-in comes back signed out and the app
stays on "Connecting…". Nothing in the console points at the header, so it took a live sign-in to find (fixed in #9).

Cost: the helper pages can be framed by this site's own pages; no other site can frame them or any other page.

Check for other apps using the same Worker pattern: any app whose `authDomain` is its own host needs both the header
exception and the redirect URI.
