// The note page in the Vault layout, on top of the app's own (screens/note-page.js, unchanged in the Classic layout):
// the header's title renamed in place (a tap; Enter or leaving it saves through the page's rename, which rewrites the
// links to it; Esc puts it back), the note's menu (the dots: vault-ui/note-menu.js), Find (find.js), the mobile
// toolbar over the keyboard (toolbar.js) and the Linked mentions under the note (mentions.js), each loaded when first
// needed. Every save goes through the page, so through the write queue.
import { transients } from '../shell/transients.js';

/** @typedef {import('../notes/model.js').Note} Note */
/** @typedef {import('./left.js').Ctx} Ctx */

/** a box of the note page typed into, as the person would (its own listeners save it) @param {string} id @param {string} v */
const typeInto = (id, v) => {
  const box = /** @type {HTMLInputElement} */ (document.getElementById(id));
  box.value = v;
  box.dispatchEvent(new Event('input', { bubbles: true }));
  box.dispatchEvent(new Event('change', { bubbles: true }));
};

/**
 * @param {{
 *   list: ReturnType<typeof import('../screens/list.js').listScreen>,
 *   page: ReturnType<typeof import('../screens/note-page.js').notePage>,
 *   settings: import('../cloud.js').Started['settings'],
 *   on: (key: string) => boolean, state: () => ReturnType<typeof import('./state.js').vaultState>,
 *   ctx: () => Promise<Ctx>, closeTab: () => unknown, syncMode: () => void,
 *   title: HTMLButtonElement, titleText: HTMLElement,
 * }} o
 */
export function noteUi(o) {
  const { list, page, settings } = o;
  const html = document.documentElement;
  const edit = /** @type {HTMLDialogElement} */ (document.getElementById('edit'));
  const toast = (/** @type {string} */ m) => list.toast(m);

  // ---- the title in the header: a tap renames the note in place
  const input = /** @type {HTMLInputElement} */ (Object.assign(document.createElement('input'), { id: 'vl-title-input', className: 'vl-title-input', type: 'text', maxLength: 200, autocomplete: 'off', spellcheck: false, hidden: true }));
  input.setAttribute('aria-label', 'File name');
  input.enterKeyHint = 'done';
  o.title.after(input);
  /** @type {{ active: boolean, close: () => Promise<void> } | null} */
  let renameStep = null;
  let renaming = false;
  /** @param {boolean} keep  save what is typed (Enter, the box left), or not (Esc, Back) */
  const endRename = keep => {
    if (!renaming) return;
    renaming = false;
    const v = input.value.trim(), note = page.current();
    input.hidden = true;
    o.title.hidden = false;
    html.classList.remove('vl-title-edit');
    const s = renameStep;
    renameStep = null;
    if (s?.active) void s.close();
    if (keep && note && v && v !== note.title) {
      typeInto('edit-text', v);
      o.titleText.textContent = v;
    }
  };
  const startRename = () => {
    const note = page.current();
    if (!note || !list.canWrite() || renaming) return;
    renaming = true;
    input.value = note.title;
    o.title.hidden = true;
    input.hidden = false;
    html.classList.add('vl-title-edit');
    input.focus();
    input.select();
    renameStep = transients().open(() => { renameStep = null; endRename(false); });
  };
  o.title.addEventListener('click', startRename);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); endRename(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endRename(false); }
  });
  input.addEventListener('blur', () => endRename(true));

  // ---- reading and editing; the note's "Backlinks in document"
  /** @param {boolean} on */
  const setReading = on => { if (page.reading() !== on) page.toggleRead(); o.syncMode(); };
  const mentionsOn = () => {
    const note = page.current();
    return !!note && o.on('pBacklinks') && settings.get('vMentions') !== false && !o.state().get().mentionsOff.includes(note.id);
  };
  /** @param {boolean} on */
  const setMentions = on => {
    const note = page.current();
    if (!note) return;
    const off = o.state().get().mentionsOff.filter(id => id !== note.id);
    o.state().set({ mentionsOff: on ? off : [note.id, ...off] });
    // (turned on here while Settings > Backlinks has them off everywhere: on again everywhere, as asked here)
    if (on && settings.get('vMentions') === false) void settings.set('vMentions', true);
    drawMentions();
  };

  // ---- a note opened from here (a mention): at a line, if given
  /** @param {Note} note @param {number} [line] */
  const openAt = async (note, line) => {
    await page.open(note);
    if (line === undefined || page.current()?.id !== note.id) return;
    if (page.reading()) return;
    await page.whenEditor();
    const v = page.editor();
    if (!v || page.current()?.id !== note.id || line >= v.state.doc.lines) return;
    v.dispatch({ selection: { anchor: v.state.doc.line(line + 1).from }, scrollIntoView: true });
  };

  // ---- Linked mentions, under the note
  const slot = Object.assign(document.createElement('div'), { className: 'vl-mn-slot' });
  (document.getElementById('edit-more') || document.getElementById('edit-live'))?.before(slot);
  /** @type {ReturnType<typeof import('./mentions.js').mentionsBlock> | null} */
  let mentions = null;
  /** @type {Promise<unknown> | null} */
  let mentionsMade = null;
  let queued = 0;
  const drawMentions = () => {
    if (!mentionsOn()) { if (mentions) mentions.draw(); return; }
    mentionsMade ||= import('./mentions.js').then(m => {
      mentions = m.mentionsBlock({ host: slot, notes: () => list.notes(), current: () => page.current(), state: o.state, open: openAt, enabled: mentionsOn });
    }).catch(() => { mentionsMade = null; });
    void mentionsMade.then(() => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(() => mentions?.draw());
    });
  };

  // ---- the mobile toolbar, once the editor is there
  /** @type {ReturnType<typeof import('./toolbar.js').mobileToolbar> | null} */
  let bar = null;
  const attach = () => {
    const box = document.getElementById('edit-attach-box');
    if (!box || box.hidden) { toast('Files can be attached to a saved note.'); return; }
    /** @type {HTMLInputElement | null} */ (document.getElementById('edit-attach-input'))?.click();
  };
  const toolbarReady = () => page.whenEditor().then(() => import('./toolbar.js')).then(m => {
    bar ||= m.mobileToolbar({ view: () => page.editor(), reading: () => page.reading(), writable: () => list.canWrite() && !!page.current(), settings, on: o.on, attach, host: edit });
  });
  list.pageLayout.onUpdate = () => bar?.refresh();

  // ---- the menu and Find
  /** @type {ReturnType<typeof import('./find.js').findBar> | null} */
  let finder = null;
  const find = async () => {
    setReading(false);
    await page.whenEditor();
    finder ||= (await import('./find.js')).findBar({ view: () => page.editor(), host: edit });
    finder.open();
  };
  const details = () => {
    const d = /** @type {HTMLDetailsElement} */ (document.getElementById('edit-more'));
    d.open = true;
    d.scrollIntoView({ block: 'start' });
  };
  /** @type {import('./note-menu.js').MenuCtx} */
  const menuCtx = {
    note: () => page.current(), ctx: o.ctx, on: o.on, canWrite: () => list.canWrite(),
    reading: () => page.reading(), setReading, editMode: () => String(settings.get('vEditMode') || 'source'),
    setEditMode: m => { void settings.set('vEditMode', m); },
    mentionsOn, setMentions, closeTab: o.closeTab, find: () => void find(), details,
    body: () => /** @type {HTMLTextAreaElement} */ (document.getElementById('edit-body')).value,
    toast, bookmarked: id => o.state().get().bookmarks.includes(id),
  };
  const menu = async () => {
    if (!page.current()) { await o.closeTab(); return; }
    (await import('./note-menu.js')).openNoteMenu(menuCtx);
  };

  // (what is used soon, loaded while the person reads)
  const idle = window.requestIdleCallback || (/** @type {(f: () => void) => number} */ f => setTimeout(f, 1500));
  idle(() => { void import('./note-menu.js').catch(() => {}); });

  return {
    /** a note is on the page */
    shown() {
      endRename(false);
      if (finder?.isOpen()) void finder.close();
      drawMentions();
      if (!bar) void toolbarReady().catch(() => { /* offline before it loaded: tried at the next note */ });
    },
    /** the empty page instead */
    blank() { endRename(false); if (finder?.isOpen()) void finder.close(); mentions?.draw(); },
    /** the notes changed (here or elsewhere) */
    changed: drawMentions,
    menu,
    /** an option or plugin changed */
    options: drawMentions,
    /** a note opened at a line (the sidebars' mentions and headings) */
    openAt,
    /** Find in this note */
    find: () => void find(),
    /** the note's "Backlinks in document", turned the other way */
    toggleMentions: () => setMentions(!mentionsOn()),
    /** the editing view's mode (Source, Live Preview), turned the other way */
    toggleEditMode: () => { if (page.reading()) { setReading(false); return; } void settings.set('vEditMode', String(settings.get('vEditMode') || 'source') === 'live' ? 'source' : 'live'); },
  };
}
