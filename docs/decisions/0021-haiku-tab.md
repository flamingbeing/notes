# 0021: Haiku tab: the text is never stored, prompts are notes

Status: accepted, 2026-10-29

## Decision

A Haiku tab (phone tab bar; the side bar's Haiku opens it as a side panel on a tablet or laptop), shown to the owner and
admins only. Pick a prompt, paste text (Paste reads the clipboard), Run: the Worker's `POST /api/haiku { prompt, text }`
(`worker/haiku.js`) sends the prompt as the system prompt and the text as one user message to Claude Haiku
(`claude-haiku-5-5`, low effort, at most 16000 tokens out) and the reply replaces the box's text; Undo puts the text from
before back; Copy copies the box.

- **The text is never stored**: not as a note, not in Firestore or R2, not in this device's storage, not in a Worker
  log. It lives in the box (and Undo's one copy) in memory until the page goes.
- **Prompts are notes in the `Prompts/` folder** of the open space, edited with the normal editor and synced like any
  note. The picker lists them by title; a first line that only repeats the title is left out of what is sent. With
  none, a built-in "Tidy this text" prompt. The last pick is remembered per device (localStorage).
- The route checks a verified sign-in whose role, read fresh from `members/` as the service account, is admin and not
  revoked (the owner by default). Caps: text 30000 characters, prompt 20000. A cut-off reply (`max_tokens`) or a
  refusal is said plainly, never put in the box. Without the `ANTHROPIC_API_KEY` Worker secret the route answers 503;
  on localhost it answers a canned reply (the tests).

## Why

- It spends the owner's Anthropic credits, so only the owner and admins can call it.
- Pasted text can hold anything, patient details included, and the app keeps no patient details in its cloud: so the
  text never leaves the page except for the one call, and nothing keeps it.
- Prompts as notes need no new data, screen or rules, and the owner edits them where he edits everything else.

## Consequences

- The call is Worker-side: the page's Content-Security-Policy is unchanged.
- This tab is notes' own screen and route (not a starter recipe): no other app has it.
- Prompts in a shared space are that space's notes: whoever can see the space can read them.
