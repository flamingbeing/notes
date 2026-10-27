# Notes MCP server

A small local [MCP](https://modelcontextprotocol.io) server that lets Claude (Claude Desktop or Claude Code) work with **your own** Notes: list, search and read notes, create them, add to them, overwrite them and delete them (to the bin). You ask in plain words ("what did I write about the move?", "add this to today's note", "find notes tagged #idea") and Claude calls these tools.

It signs in as you and uses Firestore with your own sign-in, so the same `app/firestore.rules` as the web app apply: it sees and changes only your own vault and the shared spaces you are a member of, and a space where you are a viewer is read-only.

| Tool | What it does |
|---|---|
| `list_spaces()` | your vault ("My notes") and the shared spaces you are in, with your role |
| `list_notes({ space?, folder?, tag?, limit? })` | notes, newest first, with id, title, folder, tags and date |
| `search_notes({ text, space?, limit? })` | notes whose title, tags or text contain every word (`"quoted phrase"` stays whole) |
| `read_note({ note, space? })` | the full text of one note; `note` is an id, a title or alias, or `folder/Title` |
| `create_note({ title, body?, folder?, tags?, space? })` | adds a note; refuses a title already taken in that folder |
| `append_to_note({ note, text, space? })` | adds text to the end of a note |
| `update_note({ note, title?, body?, folder?, tags?, space?, confirm? })` | overwrites the fields given (a rename keeps the old title as an alias) |
| `delete_note({ note, space?, confirm? })` | moves a note to the bin, as the app does; restore it there |

Adding (`create_note`, `append_to_note`) saves at once. Overwriting and deleting are two calls: without `confirm` they only show what would change; Claude shows you that and repeats with `confirm: true` once you agree.

## Privacy: read this first

- **What you read or write through it is sent to Claude (Anthropic).** Keep patient details out of your notes.
- **Your sign-in stays on your computer.** Only a Firebase refresh token and your email are stored, in `~/.config/notes-mcp/token.json` (mode 0600). Nothing goes to any server other than Google's (sign-in, Firestore), the Notes app's own address (`/api/claims`, to get your role) and, through Claude, Anthropic.
- **To revoke access:** run `node server.mjs logout`, or delete that file (on Windows `C:\Users\you\.config\notes-mcp\token.json`), and remove the app in your Google Account → Security → Third-party access.

## Install

**Claude Desktop (easiest):** download **[notes.mcpb](https://github.com/flamingbeing/notes/releases/download/notes-mcp/notes.mcpb)**, open it (or drag it onto Settings → Extensions) and Install. The first time you ask about your notes a browser window opens to sign in with Google; once the page says you are signed in, ask again. To update, download and open the file again (the `notes-mcp` release is rebuilt by `.github/workflows/notes-mcpb.yml`).

**Claude Code or Codex CLI:** [Node.js](https://nodejs.org) 20.19 or later and git. Once:

```sh
git clone https://github.com/flamingbeing/notes.git && cd notes/mcp && npm install
claude mcp add notes -- node "$PWD/server.mjs"      # Claude Code
codex mcp add notes -- node "$PWD/server.mjs"       # Codex CLI
```

Commands: `node server.mjs login`, `node server.mjs logout`, `node server.mjs` (the server on stdio; Claude starts it).

## How it works

1. **Sign-in, with no server of ours for the login itself.** Google OAuth for an installed app: loopback listener on `http://127.0.0.1:<random port>`, PKCE (S256), a `state` check, scopes `openid email`; the Google ID token becomes a Firebase sign-in (`accounts:signInWithIdp`). The Notes rules read the role from a custom claim, so the server then asks the app's Worker (`POST /api/claims`, the call the page makes) and refreshes the token to carry it. A person with no role in the app is told so.
2. **Data.** Firestore REST as you (`Authorization: Bearer <ID token>`): `spaces/<uid>` is your vault, `spaces/s-…` the shared spaces (found by `memberIds`). Notes are cached for a minute per space. Writes use `:commit` with a server timestamp and a precondition (new notes must not exist; overwrites and deletes must match the version read), so a clash with the app is refused, not lost. A delete also writes the bin entry in the same commit.
3. **About the client secret in `config.mjs`.** Google's Desktop-app clients still ask for a secret with PKCE; Google documents it as not confidential for installed apps, so `CLIENT_ID` and `CLIENT_SECRET` live in `config.mjs` on purpose (env overrides `NOTES_GOOGLE_CLIENT_ID`, `NOTES_GOOGLE_CLIENT_SECRET`, `NOTES_FIREBASE_API_KEY`).

Files: `server.mjs`, `config.mjs`, `lib/auth.mjs`, `lib/firestore.mjs`, `lib/notes.mjs` (filters, search, formatting), `lib/write.mjs` (building and checking what is saved), `lib/source.mjs` (spaces and notes over Firestore), `lib/tools.mjs`, `tools/build-mcpb.mjs` (stages the Desktop extension; the workflow packs it with the official `mcpb` CLI). Note shapes come from the app's own `app/src/notes`.

## Tests

No network (HTTP stubbed, a fake Firestore that mirrors the rules' field checks), made-up data:

```sh
cd mcp && npm ci && npm test
```

## One-time owner setup

In the Google Cloud console for the project behind Notes' Firebase project:

1. APIs & Services → Credentials → Create credentials → OAuth client ID → **Desktop app**, named "Notes MCP". Copy the client id and secret into `config.mjs` and commit. Desktop clients accept any `http://127.0.0.1:<port>` redirect.
2. The consent screen already exists for the web sign-in (scopes `openid`, `email`); publish it ("In production") if it is in Testing, so any member can sign in.
3. If `login` fails with `INVALID_IDP_RESPONSE` about the audience, add the client id under Firebase → Authentication → Sign-in method → Google → "Allowlist client IDs from external projects".
