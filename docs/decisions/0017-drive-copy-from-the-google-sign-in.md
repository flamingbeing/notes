# 0017: Drive copy through the existing Google sign-in

**Decision.** Notes to Google Drive asks the `drive.file` permission by popup from the Firebase Google sign-in
(`reauthenticateWithPopup` with the scope added, the same account only) and calls the Drive REST API with `fetch`. No
Google Identity Services script, no extra OAuth client id, no token stored: the token lasts an hour and is asked again
on the next tap.

**Why.** The logbook's Drive sync needs its own web client id and Google's script (a second CSP origin, a second consent
screen). Here the person is already signed in with Google, and `drive.file` (the app sees only files it made) is not a
restricted scope.

**Shape.** `@core/drive` (`app/public/drive/`, named exports, nothing runs on import): `block.js` (the app's marked block
in a file, 3-way merge of edits made inside it), `paths.js` (`Notes/<space>/<folder>/<title>.md`), `remote.js` (Drive
calls, write only if unchanged), `token.js`, `store.js` (what this device last sent, in IndexedDB), `sync.js` (one tap, only
changed notes). Off until turned on; runs only on a tap; never deletes in Drive (a renamed note gets a new file).

**If Google refuses.** Drive's API must be enabled in the Google Cloud project behind the Firebase project; a 403 "has not
been used" is that, an owner click. Any scope wider than `drive.file` is out of scope here: stop and ask.
