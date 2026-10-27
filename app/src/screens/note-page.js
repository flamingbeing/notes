// The note page (#edit, a dialog: over the whole screen on a phone, beside the list from 600 px): a note's title and text, and under Details its folder, the
// notes it links to (a missing one is made on a click), the notes linking to it (backlinks), its files and Move. Each
// note opened is a step in the browser's history (#/note/<id>): Back goes to the note before, then to the list, and a
// reload opens the note again. A new note (+) opens empty and is made by the first title or text typed (untitled:
// "Untitled", "Untitled 2", ...); closed with nothing typed, it leaves nothing behind. The text is edited in the editor
// (editor/, CodeMirror with live preview), loaded the first time a note opens; until then, or if it can't load, the
// plain textarea does the job. The textarea stays the note's text either way: the editor writes each change into it.
// A read view (marked + DOMPurify) shows the note as a page; a viewer starts there.
// Saves happen by themselves, as in the logbook: the text and folder after 3 s without typing, when the editor loses
// the focus, and when the page is hidden or left; a new title when the title box is left (it renames the note and
// rewrites [[links]] to it in the vault); everything when the page closes (Save and Close both keep the text).
// The sheet follows its note on the server: a change made elsewhere comes in when nothing is typed here (and merges
// with what is typed when it saves); a delete made elsewhere closes the sheet and says so, unless the person has typed
// a change: then the sheet stays open, says so, and saving adds their text back as a new note.
// Attachments: files attached (button), pasted or dropped are kept on the device at once and uploaded when online; the
// text gets `![[name]]` at the cursor. The read view shows them (images inline). Remove drops the file, not the text.
// A [[Space/Note]] link to a note in another space the person is in opens that space, then the note; "Move" sends the
// note to another space they can write (or their own notes).
import { confirmModal } from '@core/ui';
import { TOO_BIG } from '../cloud.js';
import { linksIn } from '../notes/parse.js';
import { sizeOf } from '../notes/model.js';
import { tidyMarkdown } from '../notes/paste-clean.js';
import { embedFor, fullPath, isImage, pastedName } from '../notes/attach.js';
import { $, input, dialog } from '../shell/dom.js';

/** @typedef {import('../cloud.js').Note} Note */
/** @typedef {import('../editor/index.js').Editor} Editor */
/** @typedef {{ title?: boolean, say?: boolean }} SaveHow  title: a new title too (renames); say: toast the outcome */

const area = () => /** @type {HTMLTextAreaElement} */ ($('edit-body'));
const QUIET_MS = 3000;
const AUTO = { title: false, say: false };

/**
 * @param {import('../cloud.js').Started} app
 * @param {(message: string) => unknown} toast  a short note (the kit's toaster)
 * @param {() => boolean} canWrite  false: the sheet only shows the note (a viewer)
 * @param {(note: Note) => void} [onShow]  a note is on the page (the list marks its row)
 */
export function notePage(app, toast, canWrite, onShow) {
  const sheet = dialog('edit');
  const { settings } = app;
  /** @type {Note | null} the note as last saved or opened (the base of its next save) */
  let editing = null;
  let editingGone = false;   // the note was deleted elsewhere while the person had typed a change
  /** @type {(() => void) | null} */
  let stopLive = null;
  /** @type {Editor | null} */
  let ed = null;
  /** @type {{ show: (text: string) => void } | null} */
  let reader = null;
  let reading = false;
  let timer = 0;
  /** @type {string[]} ids of the notes opened, the latest first (the switcher's list before anything is typed) */
  const recent = [];
  /** @type {WeakSet<Note>} new notes not made yet (the + button's) */
  const drafts = new WeakSet();
  let shown = 0;   // notes shown so far (a close's late clean-up leaves a note opened since alone)
  const isDraft = () => !!editing && drafts.has(editing);
  const untitled = () => { let t = 'Untitled', i = 1; while (app.find(t)) t = `Untitled ${++i}`; return t; };

  const typed = () => !!editing && (input('edit-text').value.trim() !== editing.title || area().value !== (editing.body || '') || input('edit-path').value.trim() !== (editing.path || ''));
  // the person's edits saved, one save at a time: a new title renames (and relinks); a note deleted elsewhere comes
  // back as a new note. -> '' or why the server refused it
  let saving = Promise.resolve('');
  /** @param {SaveHow} [how] */
  const commit = (how = {}) => (saving = saving.then(() => save(how), () => save(how)));
  /** @param {SaveHow} how */
  const save = async ({ title: withTitle = true, say = true }) => {
    clearTimeout(timer);
    const note = editing;
    if (!note || !typed() || !canWrite() || (editingGone && !withTitle)) return '';
    const draft = drafts.has(note);
    const title = (withTitle || draft ? input('edit-text').value.trim() : '') || note.title || untitled();
    const body = area().value, path = input('edit-path').value.trim();
    if (!withTitle && body === (note.body || '') && path === (note.path || '')) return '';
    let why = '';
    if (editingGone || draft) {
      const made = await app.create({ title, body, path });
      why = made.refused;
      if (!why && editing === note) {
        editingGone = false; editing = made.note; follow(made.note);
        if (draft) {
          if (!input('edit-text').value.trim()) input('edit-text').value = title;
          remember(made.note);
          if (sheet.open && !unwinding) history.replaceState({ note: made.note.id, n: history.state?.n || 1 }, '', hashOf(made.note));
          fillMove(); redrawFiles();
        }
      }
      if (draft && !why) { toast('Added'); return ''; }
    } else {
      why = title !== note.title ? await app.rename(note, title, { body, path }) : await app.edit(note, { body, path });
      if (!why && editing === note) editing = { ...note, title, body, path };
    }
    if (say || (why && why !== TOO_BIG)) toast(why || 'Saved');
    return why;
  };
  const later = () => { clearTimeout(timer); if (canWrite()) timer = window.setTimeout(() => void commit(AUTO), QUIET_MS); };

  const button = (/** @type {string} */ label, /** @type {() => void} */ onClick, cls = '') => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.type = 'button'; b.textContent = label; if (cls) b.className = cls;
    b.addEventListener('click', onClick);
    li.append(b);
    return li;
  };
  // go to another note from this one: this one's edits are saved first; a link to no note makes it
  const go = async (/** @type {string} */ target) => {
    if (await commit()) return;   // refused: stay on this note with the text as typed
    const have = app.find(target);
    if (have) { show(have); return; }
    if (app.resolveAttachment(target)) { void openFile(target); return; }
    const far = app.findElsewhere(target);
    if (far) {
      const why = await app.switchTo(far.space);
      if (why) toast(why); else show(far.note);
      return;
    }
    if (!canWrite()) { toast('There is no such note yet.'); return; }
    const { note, refused } = await app.create({ title: target });
    if (refused) { toast(refused); return; }
    show(note);
  };
  const redraw = () => {
    if (!editing) return;
    const targets = [...new Map(linksIn(area().value).filter(l => l.target).map(l => [l.target.toLowerCase(), l.target])).values()];
    $('edit-links').replaceChildren(...targets.map(t => {
      const to = app.find(t), far = to ? null : app.findElsewhere(t);   // (a note in another space: its link as written)
      if (!to && !far && app.resolveAttachment(t)) return button(`${t} (file)`, () => void openFile(t));
      return button(to ? to.title : far ? t : `${t} (new)`, () => void go(t), to || far ? '' : 'missing');
    }));
    $('edit-links-box').hidden = targets.length === 0;
    const back = isDraft() ? [] : app.backlinks(editing.id);
    $('edit-backlinks').replaceChildren(...back.map(n => button(n.title, () => void go(n.title))));
    $('edit-backlinks-box').hidden = back.length === 0;
    // the Details line, so what is folded is seen: the folder, and how many links each way
    const path = input('edit-path').value.trim();
    $('edit-where').textContent = [path ? `${path}/` : '', targets.length ? `${targets.length} ${targets.length === 1 ? 'link' : 'links'}` : '',
      back.length ? `linked from ${back.length}` : ''].filter(Boolean).map(x => ` · ${x}`).join('');
    const size = sizeOf(area().value);
    $('edit-size').textContent = size === 'too-big' ? TOO_BIG : size === 'warn' ? 'This note is getting big (over 800 KB).' : '';
  };
  const typing = () => { redraw(); later(); };
  // the textarea typed in (before the editor loads, or by a test): the editor follows it
  area().addEventListener('input', () => { ed?.set(area().value); typing(); });
  input('edit-path').addEventListener('input', () => { redraw(); later(); });
  // Details open or folded: kept on this device
  const more = /** @type {HTMLDetailsElement} */ ($('edit-more'));
  try { more.open = localStorage.getItem('notes:details') === 'open'; } catch { /* (no storage: folded) */ }
  more.addEventListener('toggle', () => { try { localStorage.setItem('notes:details', more.open ? 'open' : 'folded'); } catch { /* kept for now only */ } });
  input('edit-path').addEventListener('change', () => void commit(AUTO));
  input('edit-text').addEventListener('change', () => void commit({ title: true, say: false }));
  // the page hidden (another app, a closed tab): what is typed is saved now
  const away = () => { if (sheet.open) void commit({ title: true, say: false }); };
  window.addEventListener('pagehide', away);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') away(); });

  // the editor's options (this device): source mode, line numbers, readable line width
  const options = () => ({ source: !!settings.get('sourceMode'), lineNumbers: !!settings.get('lineNumbers') });
  const applyOptions = () => {
    sheet.classList.toggle('wide', !settings.get('readableWidth'));
    ed?.setOptions(options());
  };
  settings.watch(null, applyOptions);
  applyOptions();

  // read view or editing: a viewer starts in the read view
  /** @param {boolean} on */
  const setReading = on => {
    reading = on && !!reader;
    const mode = $('edit-mode');
    mode.hidden = !reader;
    mode.setAttribute('aria-pressed', String(reading));
    if (reading) reader?.show(area().value);
    $('edit-read').hidden = !reading;
    $('edit-cm').hidden = reading || !ed;
    area().hidden = reading || !!ed;
    $('edit-fmt').hidden = reading || !ed || !canWrite();
  };
  $('edit-mode').addEventListener('click', () => { setReading(!reading); if (!reading) ed?.focus(); });

  // Attachments. The list under the text; the file itself opens in a new tab (a picture) or downloads (the Worker says so)
  /** @param {string} target a reference as written */
  const openFile = async target => {
    const a = app.resolveAttachment(target);
    if (!a) { toast('That file is not in this space.'); return; }
    try { window.open(await app.attachmentUrl(a), '_blank', 'noopener'); } catch { toast('The file is not on this device yet, and cannot be fetched now.'); }
  };
  /** text at the cursor @param {string} text */
  const insertText = text => {
    if (ed) { ed.insert(text); return; }
    const a = area(), at = a.selectionStart ?? a.value.length;
    a.value = a.value.slice(0, at) + text + a.value.slice(a.selectionEnd ?? at);
    a.selectionStart = a.selectionEnd = at + text.length;
    typing();
  };
  /** @param {Iterable<File>} picked */
  const attachFiles = async picked => {
    const note = editing;
    if (!note || !canWrite() || editingGone || drafts.has(note)) return;
    const names = [];
    for (const f of picked) {
      const name = isImage(f) && (!f.name || /^image\.\w+$/i.test(f.name)) ? pastedName(f.type) : f.name || 'file';
      const { att, refused } = await app.attach(note, f, name);
      if (att) { names.push(att); } else toast(refused);
    }
    if (editing !== note || !names.length) return;
    insertText(names.map(embedFor).join('\n') + '\n');
    toast(names.length === 1 ? `Attached ${names[0].name}` : `Attached ${names.length} files`);
    redrawFiles();
  };
  /** the files of this note, with a picture's thumbnail */
  function redrawFiles() {
    if (!editing) return;
    const mine = app.attachmentsOf(editing.id);
    $('edit-files-box').hidden = mine.length === 0;
    $('edit-attach-box').hidden = !canWrite() || editingGone || isDraft();
    const id = editing.id;
    $('edit-files').replaceChildren(...mine.map(a => {
      const li = document.createElement('li'), name = document.createElement('span');
      name.className = 'name'; name.textContent = a.state === 'stored' ? fullPath(a) : `${fullPath(a)} (uploading)`;
      if (isImage(a)) {
        const img = document.createElement('img'); img.alt = ''; li.append(img);
        void Promise.resolve(app.attachmentUrl(a, true)).then(u => { if (editing?.id === id) img.src = u; }, () => { img.remove(); });
      }
      li.append(name);
      const open = document.createElement('button');
      open.type = 'button'; open.textContent = 'Open'; open.addEventListener('click', () => void openFile(fullPath(a)));
      li.append(open);
      if (canWrite()) {
        const put = document.createElement('button');
        put.type = 'button'; put.textContent = 'Insert'; put.addEventListener('click', () => insertText(embedFor(a) + '\n'));
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'danger'; del.textContent = 'Remove';
        del.addEventListener('click', async () => {
          if (!await confirmModal(`Remove “${a.name}” from this note’s files? The text that shows it stays.`, { title: 'Remove file', danger: true, yes: 'Remove' })) return;
          await app.removeAttachment(a);
        });
        li.append(put, del);
      }
      return li;
    }));
    if (reading) reader?.show(area().value);
  }
  $('edit-attach').addEventListener('click', () => $('edit-attach-input').click());
  $('edit-attach-input').addEventListener('change', () => {
    const inp = /** @type {HTMLInputElement} */ ($('edit-attach-input'));
    const picked = [...(inp.files || [])];
    inp.value = '';
    void attachFiles(picked);
  });
  // a picture or file pasted or dropped on the text; pasted text is the editor's
  sheet.addEventListener('paste', e => {
    const files = [...(/** @type {ClipboardEvent} */ (e).clipboardData?.files || [])];
    if (!files.length || !canWrite()) return;
    e.preventDefault(); e.stopPropagation();
    void attachFiles(files);
  }, true);
  sheet.addEventListener('dragover', e => { if (canWrite() && e.dataTransfer?.types.includes('Files')) { e.preventDefault(); sheet.classList.add('dropping'); } });
  sheet.addEventListener('dragleave', () => sheet.classList.remove('dropping'));
  sheet.addEventListener('drop', e => {
    sheet.classList.remove('dropping');
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || !canWrite()) return;
    e.preventDefault(); e.stopPropagation();
    void attachFiles(files);
  }, true);

  // the editor, the first time a note opens (the list screen loads none of it)
  /** @type {Promise<void> | null} */
  let loading = null;
  const load = () => (loading ??= (async () => {
    try {
      const [{ createEditor }, { readView }, { fmtBar }] = await Promise.all([import('../editor/index.js'), import('../editor/read-view.js'), import('../editor/fmt-bar.js')]);
      reader = readView($('edit-read'), t => void go(t), { resolve: t => app.resolveAttachment(t), url: a => app.attachmentUrl(a), open: t => void openFile(t) });
      ed = createEditor({
        parent: $('edit-cm'), text: area().value, label: 'Text', readOnly: !canWrite(), options: options(),
        titles: () => app.notes().filter(n => n.id !== editing?.id).map(n => ({ title: n.title, path: n.path })),
        onChange: text => { area().value = text; typing(); },
        onBlur: () => void commit(AUTO),
        onLink: t => void go(t),
      });
      $('edit-fmt').replaceChildren(fmtBar(() => ed?.view || null));
      document.documentElement.dataset.editor = 'ready';
    } catch (err) {
      // the textarea stays: the note can still be written
      console.warn('The editor did not load; using the plain text box.', err);
      document.documentElement.dataset.editor = 'failed';
    }
  })());

  // a note too big to save keeps the sheet open, so the text isn't lost with it
  const tooBig = () => sizeOf(area().value) === 'too-big';
  $('edit-form').addEventListener('submit', e => {
    if (tooBig() && canWrite() && typed()) { e.preventDefault(); toast(TOO_BIG); }
  });
  sheet.addEventListener('cancel', e => { if (tooBig() && canWrite() && typed()) { e.preventDefault(); toast(TOO_BIG); } });
  // (beside the list the page is not modal, and the browser only closes a modal dialog on Esc)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || !sheet.open || sheet.matches(':modal')) return;
    // (a box outside the page keeps its own Esc, and a sheet over the page takes it first)
    if (!sheet.contains(/** @type {Node} */ (e.target)) && /** @type {Element} */ (e.target).closest?.('input, textarea, select')) return;
    if (document.querySelector('dialog:modal')) return;
    const cancel = new Event('cancel', { cancelable: true });
    sheet.dispatchEvent(cancel);
    if (!cancel.defaultPrevented) sheet.close();
  });
  sheet.addEventListener('close', async () => {
    const turn = shown;
    stopLive?.(); stopLive = null;
    // back to the list in the history too (the steps this page added; none when Back closed it)
    const steps = history.state?.n || 0;
    if (steps > 0 && !unwinding) { unwinding = true; history.go(-steps); }
    if (sheet.returnValue !== 'delete' && sheet.returnValue !== 'gone') await commit();
    else clearTimeout(timer);
    // (a new note's save takes a moment: another note may have opened meanwhile)
    if (shown === turn) editing = null;
  });
  const remove = async () => {
    if (!editing) return;
    if (!await confirmModal('Delete this note? It goes to the bin.', { title: 'Delete note', danger: true, yes: 'Delete' })) return;
    const note = editing; editing = null;
    clearTimeout(timer);
    sheet.close('delete');
    if (note && !editingGone && !drafts.has(note)) { await app.remove(note); toast('Deleted'); }
  };
  $('edit-delete').addEventListener('click', () => void remove());

  // where the note can move: the person's own notes and each space they can write, but not the one it is in
  const moveSel = () => /** @type {HTMLSelectElement} */ ($('edit-move'));
  const fillMove = () => {
    const here = app.space(), me = app.vault();
    const opt = (/** @type {string} */ value, /** @type {string} */ label) => Object.assign(document.createElement('option'), { value, textContent: label });
    const to = [...(here.id !== me && me ? [opt(me, 'My notes')] : []), ...app.spaces().filter(x => x.id !== here.id && x.role !== 'view').map(x => opt(x.id, x.name))];
    moveSel().replaceChildren(opt('', 'Move to…'), ...to);
    $('edit-move-box').hidden = !canWrite() || to.length === 0 || isDraft();
  };
  $('edit-move-go').addEventListener('click', async () => {
    const note = editing, to = moveSel().value;
    if (!note || !to || editingGone || drafts.has(note)) return;
    const name = moveSel().selectedOptions[0]?.textContent || '';
    const back = app.backlinks(note.id).length;
    const warn = back ? ` ${back === 1 ? 'One note here links' : `${back} notes here link`} to it; those links won’t find it there.` : '';
    if (!await confirmModal(`Move “${note.title}” to ${name}?${warn}`, { title: 'Move note', yes: 'Move' })) return;
    if (await commit()) return;
    const now = editing;   // as just saved
    if (now?.id !== note.id) return;
    stopLive?.(); stopLive = null;   // its delete here isn't "deleted on another device"
    const why = await app.move(now, to);
    if (why) { toast(why); follow(now); return; }
    editing = null;
    sheet.close('moved');
    toast(`Moved to ${name}`);
  });

  /** follow a note on the server @param {Note} note */
  const follow = note => {
    let seen = false;
    stopLive?.();
    stopLive = app.watchNote(note.id, doc => {
      if (editing?.id !== note.id) return;
      if (doc) {
        seen = true;
        const ours = doc.body === area().value && doc.title === input('edit-text').value.trim();
        const differs = !ours && (doc.body !== editing.body || doc.title !== editing.title);
        if (differs && !typed()) {
          // nothing typed here: the other device's text comes in
          editing = doc;
          input('edit-text').value = doc.title;
          input('edit-path').value = doc.path || '';
          area().value = doc.body || '';
          ed?.set(area().value);
          if (reading) reader?.show(area().value);
          redraw();
        }
        $('edit-live').textContent = !differs ? '' : typed() ? 'Changed on another device; your edits merge into it when saved.' : 'Changed on another device; this is the new text.';
      } else if (seen && typed()) {
        editingGone = true;
        $('edit-live').textContent = 'This note was deleted on another device. Saving adds your text back as a new note.';
      } else if (seen) {
        editing = null;
        sheet.close('gone');
        $('edit-msg').textContent = `“${note.title}” was deleted on another device.`;
      }
    });
  };

  // the history: one entry per note opened, { note: id ('' for a new note), n: how many steps from the list }
  const hashOf = (/** @type {Note} */ note) => (note.id ? `#/note/${encodeURIComponent(note.id)}` : '#/new');
  const remember = (/** @type {Note} */ note) => { recent.splice(0, recent.length, note.id, ...recent.filter(id => id !== note.id).slice(0, 19)); };
  /** @type {string | null} a note named by the address when the page loaded, opened once the list has it */
  let linked = /^#\/note\/(.+)$/.exec(location.hash)?.[1] ?? null;
  if (linked) { try { linked = decodeURIComponent(linked); } catch { linked = null; } }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  // (going back to the list takes a moment: a note opened meanwhile gets its step once there)
  let unwinding = false;
  /** @type {[unknown, string] | null} */
  let queued = null;
  window.addEventListener('popstate', () => {
    if (unwinding) {
      unwinding = false;
      if (queued) { history.pushState(queued[0], '', queued[1]); queued = null; }
      return;
    }
    const at = history.state;
    if (!at?.n) { if (sheet.open) sheet.close(); return; }
    const note = app.notes().find(n => n.id === at.note);
    if (note && note.id !== editing?.id) void (async () => { if (sheet.open && editing && await commit()) return; show(note, false); })();
  });

  /** @param {Note} note @param {boolean} [step]  a new step in the history (not when Back or Forward brought it) */
  const show = (note, step = true) => {
    clearTimeout(timer);
    shown++;
    linked = null;
    editing = note;
    if (!drafts.has(note)) remember(note);
    if (step) {
      const at = { note: note.id, n: (sheet.open && !unwinding ? history.state?.n || 0 : 0) + 1 };
      if (unwinding) queued = [at, hashOf(note)]; else history.pushState(at, '', hashOf(note));
    }
    input('edit-text').value = note.title;
    input('edit-path').value = note.path || '';
    area().value = note.body || '';
    const rw = canWrite();
    for (const id of ['edit-text', 'edit-path', 'edit-body']) input(id).readOnly = !rw;
    ed?.setReadOnly(!rw);
    ed?.set(area().value);
    $('edit-save').hidden = !rw; $('edit-delete').hidden = !rw;
    fillMove();
    $('edit-live').textContent = ''; $('edit-msg').textContent = '';
    editingGone = false;
    if (drafts.has(note)) { stopLive?.(); stopLive = null; } else follow(note);
    redraw();
    redrawFiles();
    setReading(!rw);
    // beside the list (not over it) from 600 px: the list stays in reach, so it is not modal there
    if (!sheet.open) { if (matchMedia('(min-width: 600px)').matches) sheet.show(); else sheet.showModal(); }
    onShow?.(note);
    if (drafts.has(note)) input('edit-text').focus();
    void load().then(() => { if (editing?.id === note.id) { ed?.setReadOnly(!canWrite()); ed?.set(area().value); setReading(reading || !canWrite()); } });
  };
  return {
    /** open the page on a note (the one open now is saved first) @param {Note} note */
    open: async note => { if (sheet.open && editing && editing.id !== note.id && await commit()) return; show(note); },
    /** open the page on a new note, made in this folder once something is typed @param {string} folder */
    draft: async folder => {
      if (!canWrite() || (sheet.open && editing && await commit())) return;
      const note = /** @type {Note} */ ({ id: '', title: '', body: '', path: folder, links: [], tags: [], aliases: [] });
      drafts.add(note);
      show(note);
    },
    /** the list has drawn: open the note the address named at load, once it is there */
    drawn: () => { const note = linked && !sheet.open ? app.notes().find(n => n.id === linked) : null; if (note) show(note); },
    redraw,
    /** the open note's attachments changed (a device sent one, or removed one) */
    redrawFiles: () => { if (sheet.open) redrawFiles(); },
    /** the note open now (a new one once it is made), or null */
    current: () => (sheet.open && !isDraft() ? editing : null),
    recent: () => [...recent],
    /** read view on or off */
    toggleRead: () => { if (sheet.open && reader) setReading(!reading); },
    /** the open note's Markdown tidied (paste-clean's tidy: spacing, bullets, blank lines) */
    tidy: () => {
      if (!sheet.open || !canWrite()) return;
      const text = tidyMarkdown(area().value);
      if (text === area().value) { toast('Already tidy'); return; }
      area().value = text; ed?.set(text); typing();
      toast('Tidied');
    },
    remove,
  };
}
