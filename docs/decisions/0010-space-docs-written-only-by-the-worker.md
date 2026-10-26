# 0010: Shared spaces: the space doc is written only by the Worker

Status: accepted (2026-10-26)

Decision: a shared space is `spaces/s-<random>` = `{ name, owner, members: { uid: owner | edit | view }, memberIds,
emails: { uid: email }, invited: { <key>: { email, role } }, updatedAt, closing? }`, with its notes, files and bin
under it as in a person's vault (`spaces/<uid>`). **Only the Worker writes the space doc** (`/api/spaces`,
`worker/spaces.js`); the rules let members read it and nobody write it, and `invites/` is closed to devices.

- Create, rename, invite, change a role, remove or leave, take back an invite, move a note and delete a space are
  Worker calls, each one Firestore commit with field masks and array union/remove (`worker/store.js`, REST as the
  service account), so a device can never overwrite a member the Worker just added.
- **Invite by Google email.** Someone already in the app joins at once. Someone who isn't can be invited by an app
  admin only; they get a pending invite (`invites/<sha-256(email)[:40]>`, no email in a doc id), taken up at their
  first sign-in with that verified email when `/api/claims` runs (they come in as an app member with their own
  vault). The email lookup is Identity Toolkit's `accounts:lookup`: no new secret, fine on the Spark plan.
- **Moving a note** between spaces (or to and from the vault) is one commit: copy, delete, bin entry; the caller
  must be able to write both.
- **Deleting a space** sets `closing` (the rules then refuse writes), then deletes notes, files, bin and the R2 bytes
  in rounds of 200; the page calls again until `{ done: true }`.
- **On the device** one space is open at a time (app-sync's scope); the others are read-only watches for
  `[[Space/Note]]` links. Someone taken out of a space (or whose space is deleted) has its notes and unsent saves
  dropped from the device and goes back to their own notes.

Why: members change from several places at once (owner, invitee's first sign-in, leave); one writer with atomic
field writes cannot lose an update, and the rules stay simple (no email in rules, decision 0004).

Cost: every space change needs the network and the Worker; the device shows the change only when the live list of
spaces brings it back.
