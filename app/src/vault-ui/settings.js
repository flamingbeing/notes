// The Vault layout's Settings: a grey sheet over the app, nearly the screen's height, drawn from settings-map.js. The
// root has a search box, the "Options" card (a row per page) and the "Core plugins" card (the page of each plugin or
// Notes extra that has options, while it is on). A page slides in from the right over the one before; its Back (the
// arrow, Android's Back, a swipe right) slides it away, and the X closes the whole sheet, as does a drag down on the
// root's top or Esc. Every option is bound to the settings api (settings.set, settings.watch), its control named
// #opt-<key> as the Classic Settings name theirs; the buttons that open the app's sheets keep their ids, so list.js
// opens them (the sheet closes first). It moves only by transform and opacity, on the kit's spring (glide) and drag.
import { drag, glide, still, tabArranger, installApp, installMode, aboutSheet, LABELS } from '@core/ui';
import { themeSwitch, themeChoice, chooseTheme, previewTheme, PRESET_IDS, TEXT_SIZES } from '@core/theme';
import { transients } from '../shell/transients.js';
import { available, RULES, repaints } from '../settings/bar.js';
import { OPTIONS } from '../settings/options.js';
import { glyph } from './icons.js';
import { featureOn, GROUPS } from './plugins.js';
import { PAGES, OPTION_PAGES, PLUGIN_PAGES, TOOLBAR, findRows, pluginCards } from './settings-map.js';
import { shadeEl } from './sheet.js';

/** @typedef {import('./settings-map.js').Row} Row @typedef {import('./settings-map.js').Page} Page */
/** @typedef {{ id: string, el: HTMLElement, x: number, v: number, step: { readonly active: boolean, close: () => Promise<void> } | null, from: HTMLElement | null }} Shown */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, unknown>} [props] @param {...(Node | string | null | undefined | false)} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
const el = (tag, props = {}, ...kids) => {
  const e = /** @type {HTMLElementTagNameMap[K]} */ (Object.assign(document.createElement(tag), props));
  e.append(.../** @type {(Node | string)[]} */ (kids.filter(k => k !== null && k !== undefined && k !== false)));
  return e;
};
/** the sheet's buttons that open one of the app's sheets (list.js has them): the sheet closes first */
const AFTER_CLOSE = new Set(['open-transfer', 'open-drive', 'open-bin', 'open-feedback', 'open-mcp', 'sign-out']);
const PARALLAX = 0.3;
// The Vault layout's palette, pinned (boot.js pins it the same way at startup): the kit's style, ground, look and
// density stay the Classic layout's, so a style picked there never repaints the Vault one. Kept on this device as
// picked; only shown without them here.
const PIN = { preset: PRESET_IDS[0], surface: '', look: '', density: 'regular' };
const VAULT_ACCENT = '#9873f6';
/** a theme change from this page: kept, then shown with the Vault palette pinned @param {Parameters<typeof chooseTheme>[0]} [change] */
const pickTheme = change => {
  if (change) chooseTheme(change);
  previewTheme(PIN);
  const a = themeChoice().accent;
  if (a) document.documentElement.style.setProperty('--vl-pick', a); else document.documentElement.style.removeProperty('--vl-pick');
};
const FONT_PX = { regular: 16, large: 18, larger: 20 };   // how far the page under moves while one slides over it (of the width)

/**
 * @param {import('../cloud.js').Started} app
 * @param {{ list: ReturnType<typeof import('../screens/list.js').listScreen>, haiku: () => unknown }} h  haiku: the Haiku page shown
 * @returns {{ open: () => void, close: () => Promise<void> }}
 */
export function settingsHost(app, h) {
  const { settings } = app;
  const on = (/** @type {string} */ key) => featureOn('vault', k => settings.get(k), key);
  const d = /** @type {HTMLDialogElement} */ (el('dialog', { id: 'vl-settings', className: 'vl-set' }));
  const status = el('p', { className: 'vl-set-status' });
  status.setAttribute('role', 'status');
  document.body.append(d);

  // ---- options bound to the settings api: shown now, and again on every change (here, another tab, a profile)
  /** @type {Map<string, ((v: unknown) => void)[]>} */
  const shows = new Map();
  /** @param {string} key @param {(v: unknown) => void} f */
  const shown = (key, f) => { shows.set(key, [...(shows.get(key) || []), f]); f(settings.get(key)); };
  /** @type {(() => void)[]} drawn again on any change (a row that shows only with a plugin on, the root's cards) */
  const redraws = [];
  /** @param {HTMLElement} node @param {() => boolean} when */
  const gate = (node, when) => { const f = () => { node.hidden = !when(); }; redraws.push(f); f(); };
  let said = 0;
  /** @param {string} text @param {boolean} [bad] */
  const say = (text, bad = false) => {
    status.textContent = text;
    status.classList.toggle('bad', bad);
    clearTimeout(said);
    if (text) said = window.setTimeout(() => { status.textContent = ''; }, 4000);
  };
  /** a value saved; refused (an account option while signed out, say): the control shows the value in force again @param {string} key @param {unknown} v */
  const save = async (key, v) => {
    try { await settings.set(key, v); say(''); return true; }
    catch (e) { say(e instanceof Error ? e.message : String(e), true); shows.get(key)?.forEach(f => f(settings.get(key))); return false; }
  };
  settings.watch(null, (/** @type {unknown} */ v, /** @type {string | undefined} */ key) => { if (key) shows.get(key)?.forEach(f => f(v)); redraws.forEach(f => f()); });

  // ---- the parts of a row
  let n = 0;
  /** @param {string} label @param {string | undefined} sub @param {string} [forId] @param {...Node} more  more words after the line (the email) */
  const words = (label, sub, forId, ...more) => {
    const name = forId ? el('label', { className: 'vl-set-name', htmlFor: forId, textContent: label }) : el('span', { className: 'vl-set-name', textContent: label });
    return el('div', { className: 'vl-set-text' }, name, sub || more.length ? el('div', { className: 'vl-set-sub' }, sub || '', ...more) : null);
  };
  /** a row: its words, then its control at the end (side) or under them (a pill) @param {Node} text @param {Node | null} control @param {boolean} [under] */
  const row = (text, control, under = false) => el('div', { className: `vl-set-row${under ? ' vl-set-col' : ''}` }, text, control);
  /** a pill button @param {string} label @param {() => unknown} run @param {{ id?: string, danger?: boolean }} [o] */
  const pill = (label, run, o = {}) => {
    const b = el('button', { type: 'button', className: `vl-set-pill${o.danger ? ' vl-set-danger' : ''}`, textContent: label });
    if (o.id) b.id = o.id;
    b.addEventListener('click', () => void run());
    return b;
  };
  /** a switch bound to an option @param {string} key @param {string} id */
  const toggle = (key, id) => {
    const sw = /** @type {HTMLInputElement} */ (el('input', { type: 'checkbox', id, className: 'vl-toggle' }));
    sw.setAttribute('role', 'switch');
    shown(key, (/** @type {unknown} */ v) => { sw.checked = v === true; });
    sw.addEventListener('change', () => void save(key, sw.checked));
    return sw;
  };

  /** an option's row: a switch, a choice (a pill of choices) or a folder box @param {import('./settings-map.js').OptionRow} r */
  const optionRow = r => {
    const id = r.alias ? `vl-opt-${r.key}-2` : `opt-${r.key}`;
    const def = OPTIONS[r.key]?.default;
    /** @type {HTMLElement} */
    let out;
    if (r.choices) {
      const pick = /** @type {HTMLSelectElement} */ (el('select', { id, className: 'vl-set-select' }));
      for (const [v, w] of r.choices) pick.add(new Option(w, v));
      shown(r.key, v => { pick.value = String(v ?? def); });
      pick.addEventListener('change', async () => {
        // (a new layout: the app loads again in it)
        if (await save(r.key, pick.value) && r.key === 'layout') location.reload();
      });
      out = row(words(r.label, r.sub, id), el('div', { className: 'vl-set-drop' }, pick, glyph('chevronsUpDown', 'vl-set-chev')), true);
    } else if (typeof def === 'boolean') {
      out = row(words(r.label, r.sub, id), toggle(r.key, id));
    } else {
      const box = /** @type {HTMLInputElement} */ (el('input', { id, className: 'vl-set-input', maxLength: 200, placeholder: r.hint || '', autocomplete: 'off', spellcheck: false }));
      shown(r.key, v => { if (document.activeElement !== box) box.value = String(v || ''); });
      // (kept when the box is left: the option's clean trims the slashes)
      box.addEventListener('change', async () => { await save(r.key, box.value); box.value = String(settings.get(r.key) || ''); });
      out = row(words(r.label, r.sub, id), box, true);
    }
    if (r.when) { const w = r.when; gate(out, () => on(w)); }
    return out;
  };

  /** @type {Record<string, (r: import('./settings-map.js').PartRow) => HTMLElement>} the parts the map leaves to the screen */
  const PARTS = {
    version: () => {
      const name = el('span', { className: 'vl-set-name', textContent: `Version ${app.update ? '…' : 'dev'}` });
      app.update?.versionLabel().then((/** @type {string} */ v) => { name.textContent = `Version ${v || LABELS.notInstalled}`; }, () => { name.textContent = `Version ${LABELS.notInstalled}`; });
      return row(el('div', { className: 'vl-set-text' }, name), null);
    },
    update: r => {
      const text = words(r.label, r.sub);
      const line = /** @type {HTMLElement} */ (text.querySelector('.vl-set-sub'));
      line.setAttribute('role', 'status');
      const go = pill('Check now', async () => {
        line.textContent = LABELS.checking;
        try { line.textContent = (await app.update?.checkNow()) ? LABELS.updated : LABELS.newest; }
        catch { line.textContent = LABELS.checkFailed; }
      }, { id: 'vl-set-check' });
      go.disabled = !app.update;
      return row(text, go, true);
    },
    account: r => row(words(r.label, r.sub ? `${r.sub} ` : '', undefined, el('span', { id: 'who' })),
      pill('Log out', () => {}, { id: 'sign-out', danger: true }), true),
    file: r => {
      const text = words(r.label, r.sub);
      const picker = /** @type {HTMLInputElement} */ (el('input', { type: 'file', accept: '.json,application/json', hidden: true }));
      const exp = pill('Export', () => {
        const url = URL.createObjectURL(new Blob([settings.exportFile()], { type: 'application/json' }));
        el('a', { href: url, download: 'notes-settings.json' }).click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, { id: 'vl-set-export' });
      const imp = pill('Import', () => picker.click(), { id: 'vl-set-import' });
      picker.addEventListener('change', async () => {
        const f = picker.files?.[0];
        picker.value = '';
        if (!f) return;
        try {
          const { changed, dropped } = await settings.importFile(await f.text());
          say(changed.length || dropped.length ? `Imported: ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}${dropped.length ? `, ${dropped.length} left out` : ''}` : 'Nothing to change');
        } catch (e) { say(e instanceof Error ? e.message : String(e), true); }
      });
      return row(text, el('div', { className: 'vl-set-pills' }, exp, imp, picker), true);
    },
    scheme: r => {
      const pick = /** @type {HTMLSelectElement} */ (el('select', { id: 'vl-scheme', className: 'vl-set-select' }));
      for (const [v, w] of [['auto', 'Adapt to system'], ['light', 'Light'], ['dark', 'Dark']]) pick.add(new Option(w, v));
      pick.value = themeChoice().theme;
      pick.addEventListener('change', () => pickTheme({ theme: pick.value }));
      return row(words(r.label, r.sub, pick.id), el('div', { className: 'vl-set-drop' }, pick, glyph('chevronsUpDown', 'vl-set-chev')), true);
    },
    accent: r => {
      const well = /** @type {HTMLInputElement} */ (el('input', { type: 'color', id: 'vl-accent', className: 'vl-set-well' }));
      const reset = el('button', { type: 'button', className: 'vl-set-reset', id: 'vl-accent-reset', title: 'Back to the default colour' }, glyph('rotateCcw'));
      reset.setAttribute('aria-label', 'Back to the default accent colour');
      const sync = () => { well.value = themeChoice().accent || VAULT_ACCENT; reset.hidden = !themeChoice().accent; };
      well.addEventListener('change', () => { pickTheme({ accent: well.value }); sync(); });
      reset.addEventListener('click', () => { pickTheme({ accent: '' }); sync(); well.focus(); });
      sync();
      return row(words(r.label, r.sub, well.id), el('div', { className: 'vl-set-ctl' }, reset, well));
    },
    fontSize: r => {
      const slide = /** @type {HTMLInputElement} */ (el('input', { type: 'range', id: 'vl-font-size', className: 'vl-set-range', min: '0', max: String(TEXT_SIZES.length - 1), step: '1' }));
      const value = el('span', { className: 'vl-set-value', id: 'vl-font-size-value' });
      const reset = el('button', { type: 'button', className: 'vl-set-reset', id: 'vl-font-reset', title: 'Back to 16' }, glyph('rotateCcw'));
      reset.setAttribute('aria-label', 'Back to the default font size');
      const px = (/** @type {string} */ t) => FONT_PX[/** @type {keyof typeof FONT_PX} */ (t)] ?? 16;
      const sync = () => {
        const t = themeChoice().text, i = Math.max(0, TEXT_SIZES.indexOf(t));
        slide.value = String(i);
        slide.setAttribute('aria-valuetext', `${px(t)} pixels`);
        value.textContent = String(px(t));
        reset.hidden = i === 0;
      };
      slide.addEventListener('input', () => { value.textContent = String(px(TEXT_SIZES[Number(slide.value)] || 'regular')); });
      slide.addEventListener('change', () => { pickTheme({ text: TEXT_SIZES[Number(slide.value)] || TEXT_SIZES[0] }); sync(); });
      reset.addEventListener('click', () => { pickTheme({ text: TEXT_SIZES[0] }); sync(); slide.focus(); });
      sync();
      return row(words(r.label, r.sub, slide.id), el('div', { className: 'vl-set-ctl' }, reset, value, slide));
    },
    theme: () => {
      const host = el('div', { className: 'vl-set-theme' });
      themeSwitch(host);
      // (the kit's pickers the Vault layout has its own rows for, or pins: Base color scheme, Accent color and Font
      // size above; look, style, ground and density stay the Classic layout's)
      for (const id of ['look', 'theme', 'preset', 'surface', 'density', 'text', 'accent']) host.querySelector(`#${id}-pick`)?.closest('label')?.remove();
      for (const b of host.querySelectorAll('.theme-switch > button')) b.remove();
      host.querySelector('datalist')?.remove();
      // (each of the kit's pickers as a row: its words over a pill)
      for (const label of host.querySelectorAll('.theme-switch > label')) {
        const lead = label.firstChild;
        if (lead?.nodeType === Node.TEXT_NODE) label.replaceChild(el('span', { className: 'vl-set-name', textContent: (lead.textContent || '').trim() }), lead);
        const pick = label.querySelector('select');
        if (pick) { pick.classList.add('vl-set-select'); const drop = el('span', { className: 'vl-set-drop' }); pick.before(drop); drop.append(pick, glyph('chevronsUpDown', 'vl-set-chev')); }
        label.classList.add('vl-set-row', 'vl-set-col');
      }
      // (a pick there shows the whole choice again: the Vault palette pinned back over it)
      host.addEventListener('change', () => pickTheme());
      return host;
    },
    commands: () => {
      const spacing = el('div', { className: 'vl-set-cmd' }, glyph('type'), el('span', { textContent: 'Line spacing' }));
      gate(spacing, () => on('xLineSpacing'));
      const list = el('div', { className: 'vl-set-cmds' }, ...TOOLBAR.map(t => el('div', { className: 'vl-set-cmd' }, glyph(t.icon), el('span', { textContent: t.label }))));
      list.insertBefore(spacing, list.lastChild);
      return list;
    },
    spaces: () => {
      const box = el('div', { className: 'vl-set-spaces' });
      box.setAttribute('role', 'radiogroup');
      box.setAttribute('aria-label', 'Spaces');
      const draw = () => {
        const here = app.space().id, mine = app.vault();
        const rows = [{ id: mine, name: 'My notes' }, ...app.spaces().map(s => ({ id: s.id, name: s.role === 'view' ? `${s.name} (view only)` : s.name }))];
        box.replaceChildren(...rows.map(s => {
          const b = el('button', { type: 'button', className: 'vl-set-choice', id: `vl-set-space-${s.id}` }, glyph('folder'), el('span', { textContent: s.name }));
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(s.id === here));
          if (s.id === here) b.append(glyph('check', 'vl-set-tick'));
          b.addEventListener('click', async () => {
            if (s.id === app.space().id) return;
            const why = await app.switchTo(s.id);
            if (why) say(why, true);
            draw();
            opening.get('account-tools')?.();
          });
          return b;
        }));
      };
      opening.set('account', draw);
      draw();
      return box;
    },
    'space-tools': r => {
      /** a button of the app's spaces sheet, there on the page (hidden in this layout) @param {string} sel */
      const press = async (/** @type {string} */ sel) => { await close(); /** @type {HTMLElement | null} */ (document.querySelector(sel))?.click(); };
      const members = pill('Members of this space', () => press('#space-open'), { id: 'vl-set-members' });
      const make = pill('New space', () => press('#space-new'), { id: 'vl-set-new-space' });
      const out = row(words(r.label, r.sub), el('div', { className: 'vl-set-pills' }, members, make), true);
      // (Members only in a shared space, New space for those who may make one; neither: no row)
      opening.set('account-tools', () => {
        const role = h.list.role();
        members.hidden = app.space().id === app.vault();
        make.hidden = !(role === 'admin' || role === 'member');
        out.hidden = members.hidden && make.hidden;
      });
      return out;
    },
    arranger: () => {
      const host = el('div', { className: 'vl-set-arrange' });
      const draw = () => tabArranger(host, { tabs: available(), get: () => settings.get('tabs'), set: v => settings.set('tabs', v), rules: RULES });
      let stop = draw();
      repaints.add(() => { stop(); stop = draw(); });
      return host;
    },
    install: r => {
      const text = words(r.label, r.sub);
      if (installMode() === 'installed') { /** @type {HTMLElement} */ (text.querySelector('.vl-set-sub')).textContent = 'Installed.'; return row(text, null); }
      const go = pill('Install', async () => {
        if (await installApp() === 'accepted') { /** @type {HTMLElement} */ (text.querySelector('.vl-set-sub')).textContent = 'Installed. Open it from your home screen.'; go.hidden = true; }
      }, { id: 'vl-set-install' });
      return row(text, go, true);
    },
    licences: r => row(words(r.label, r.sub), pill('Open', () => aboutSheet({ name: 'Notes', update: app.update || null }), { id: 'vl-set-about' }), true),
    haiku: r => {
      const go = pill('Open Haiku', async () => { await close(); h.haiku(); }, { id: 'vl-set-haiku' });
      const text = words(r.label, r.sub);
      opening.set('haiku', () => { go.disabled = h.list.role() !== 'admin'; });
      return row(text, go, true);
    },
  };
  /** @type {Map<string, () => void>} drawn again as Settings or a page opens (the spaces, who may do what) */
  const opening = new Map();

  /** the Core plugins page: a card per group (the reference's plugins, then the Notes extras), name, line, gear, switch */
  const pluginsPart = () => el('div', {}, ...pluginCards().map(({ group, rows }) => {
    const head = el('h3', { className: 'vl-set-h', textContent: GROUPS[group].title });
    const sub = GROUPS[group].sub ? el('p', { className: 'vl-set-h-sub', textContent: GROUPS[group].sub }) : null;
    return el('section', { className: 'vl-set-group' }, head, sub, el('div', { className: 'vl-set-card' }, ...rows.map(p => {
      const id = `opt-${p.key}`;
      const r = el('div', { className: 'vl-set-row' }, words(p.label, p.sub, id));
      if (p.gear && PAGES.some(pg => pg.id === p.gear)) {
        const g = el('button', { type: 'button', className: 'vl-set-gear', id: `vl-set-gear-${p.gear}` }, glyph('settings'));
        g.setAttribute('aria-label', `${p.label} options`);
        g.addEventListener('click', () => void push(/** @type {string} */ (p.gear), g));
        gate(g, () => on(p.key));
        r.append(g);
      }
      r.append(toggle(p.key, id));
      return r;
    })));
  }));

  /** @param {Row} r @param {Page} page */
  const rowOf = (r, page) => {
    if ('key' in r) return optionRow(r);
    if ('button' in r) {
      const b = pill(r.text, () => {}, { id: r.button, danger: r.danger });
      b.setAttribute('aria-label', `${r.text} ${r.label}`);
      return row(words(r.label, r.sub), b, true);
    }
    if ('link' in r) {
      const a = el('a', { className: 'vl-set-pill', href: r.link, target: '_blank', rel: 'noopener', textContent: r.text });
      a.setAttribute('aria-label', `${r.text} ${r.label}`);
      return row(words(r.label, r.sub), a, true);
    }
    if ('info' in r) return row(words(r.label, r.sub), el('div', { className: 'vl-set-value', textContent: r.info }), true);
    if ('part' in r) return PARTS[r.part]?.(r) || el('div', {});
    void page;
    return el('div', {});
  };

  // ---- the pages
  /** @param {string} id @param {string} title @param {boolean} root */
  const frame = (id, title, root) => {
    const heading = el('h2', { className: 'vl-set-title', id: `vl-set-title-${id}`, textContent: title, tabIndex: -1 });
    const shut = el('button', { type: 'button', className: 'vl-set-circle vl-set-close' }, glyph('x'));
    shut.setAttribute('aria-label', 'Close settings');
    if (root) shut.id = 'vl-settings-close';
    shut.addEventListener('click', () => void close());
    let back = null;
    if (!root) {
      back = el('button', { type: 'button', className: 'vl-set-circle vl-set-back' }, glyph('arrowLeft'));
      back.setAttribute('aria-label', 'Back');
      back.addEventListener('click', () => void stepBack());
    }
    const head = el('div', { className: 'vl-set-head' }, back || el('span'), heading, shut);
    const scroll = el('div', { className: 'vl-set-scroll' });
    const pageEl = el('section', { className: 'vl-set-page', hidden: !root }, head, scroll);
    pageEl.dataset.page = id;
    pageEl.setAttribute('aria-labelledby', heading.id);
    d.append(pageEl);
    return { pageEl, head, scroll };
  };
  /** @type {Map<string, HTMLElement>} */
  const pages = new Map();
  for (const page of PAGES) {
    const { pageEl, scroll } = frame(page.id, page.title, false);
    /** @type {HTMLElement | null} */
    let card = null;
    /** @param {string} [title] @param {string} [sub] */
    const group = (title, sub) => {
      card = el('div', { className: 'vl-set-card' });
      scroll.append(el('section', { className: 'vl-set-group' }, title ? el('h3', { className: 'vl-set-h', textContent: title }) : null,
        sub ? el('p', { className: 'vl-set-h-sub', textContent: sub }) : null, card));
    };
    page.rows.forEach((r, i) => {
      if ('heading' in r) { group(r.heading, r.sub); return; }
      if ('part' in r && r.part === 'plugins') { scroll.append(pluginsPart()); card = null; return; }
      if (!card) group();
      const node = rowOf(r, page);
      node.dataset.row = String(i);
      /** @type {HTMLElement} */ (card).append(node);
    });
    pages.set(page.id, pageEl);
    swipeBack(pageEl);
  }

  // ---- the root: the search, the Options card, the Core plugins card
  const root = frame('root', 'Settings', true);
  root.pageEl.hidden = false;
  const q = /** @type {HTMLInputElement} */ (el('input', { type: 'search', id: 'vl-set-q', className: 'vl-set-q', placeholder: 'Search settings...', autocomplete: 'off', spellcheck: false }));
  q.setAttribute('aria-label', 'Search settings');
  const search = el('label', { className: 'vl-set-search' }, glyph('search'), q);
  /** a row of the root that opens a page @param {Page} page */
  const goRow = page => {
    const b = el('button', { type: 'button', className: 'vl-set-nav', id: `vl-set-go-${page.id}` }, glyph(page.icon), el('span', { className: 'vl-set-nav-label', textContent: page.title }), glyph('chevronRight', 'vl-set-more'));
    b.addEventListener('click', () => void push(page.id, b));
    return b;
  };
  const optionsCard = el('section', { className: 'vl-set-group' }, el('h3', { className: 'vl-set-h', textContent: 'Options' }), el('div', { className: 'vl-set-card' }, ...OPTION_PAGES.map(goRow)));
  const pluginRows = PLUGIN_PAGES.map(p => { const b = goRow(p); const k = /** @type {string} */ (p.plugin); gate(b, () => on(k)); return b; });
  const pluginsCard = el('section', { className: 'vl-set-group' }, el('h3', { className: 'vl-set-h', textContent: 'Core plugins' }), el('div', { className: 'vl-set-card' }, ...pluginRows));
  gate(pluginsCard, () => pluginRows.some(b => !b.hidden));
  const results = el('div', { className: 'vl-set-card vl-set-results', id: 'vl-set-results', hidden: true });
  const none = el('p', { className: 'vl-set-none', textContent: 'No setting matches', hidden: true });
  none.dataset.faint = '';
  const menu = el('div', {}, optionsCard, pluginsCard);
  root.scroll.append(search, results, none, menu);
  // (a page a search found: opened at the row, which flashes)
  /** @param {string} pageId @param {string} [key] @param {number} [index] @param {HTMLElement} [from] */
  const jump = async (pageId, key, index, from) => {
    await push(pageId, from);
    const page = pages.get(pageId);
    const hit = /** @type {HTMLElement | null} */ ((key && page?.querySelector(`#opt-${CSS.escape(key)}`)?.closest('.vl-set-row')) || page?.querySelector(`[data-row="${index}"]`) || null);
    if (!hit) return;
    hit.scrollIntoView({ block: 'center' });
    hit.classList.add('vl-set-flash');
    setTimeout(() => hit.classList.remove('vl-set-flash'), 1200);
  };
  const find = () => {
    const words = q.value.trim();
    menu.hidden = !!words;
    if (!words) { results.hidden = true; none.hidden = true; return; }
    const hits = findRows(words, p => !p.plugin || on(p.plugin)).filter(x => !('when' in x.row) || !x.row.when || on(x.row.when));
    results.replaceChildren(...hits.map(({ page, row: r, index }) => {
      const b = el('button', { type: 'button', className: 'vl-set-nav vl-set-hit' }, glyph(page.icon),
        el('span', { className: 'vl-set-nav-two' }, el('span', { className: 'vl-set-nav-label', textContent: 'label' in r ? r.label : '' }), el('span', { className: 'vl-set-hit-page', textContent: page.title })),
        glyph('chevronRight', 'vl-set-more'));
      b.addEventListener('click', () => void jump(page.id, 'key' in r ? r.key : undefined, index, b));
      return b;
    }));
    results.hidden = !hits.length;
    none.hidden = !!hits.length;
  };
  q.addEventListener('input', find);
  redraws.push(() => { if (q.value.trim()) find(); });
  d.append(status);

  // ---- the stack of pages: the root, then each page over the one before
  /** @type {Shown[]} */
  const stack = [{ id: 'root', el: root.pageEl, x: 0, v: 0, step: null, from: null }];
  const width = () => d.getBoundingClientRect().width || innerWidth;
  /** @type {ReturnType<typeof glide> | null} */
  let slideRun = null;
  /** the top page `x` px from its place, the page under it moved a little the other way @param {Shown} top @param {Shown | undefined} under @param {number} x */
  const place = (top, under, x) => {
    top.x = x;
    top.el.style.transform = x > 0.5 ? `translateX(${x}px)` : '';
    if (under) under.el.style.transform = x < width() - 0.5 ? `translateX(${-PARALLAX * (width() - x)}px)` : '';
  };
  /** @param {Shown} top @param {Shown | undefined} under @param {number} to @param {number} [v] */
  const slide = async (top, under, to, v = 0) => {
    slideRun?.stop();
    slideRun = null;
    if (still()) { place(top, under, to); return; }
    const w = width();
    /** @type {[Element, (x: number) => Keyframe][]} */
    const parts = [[top.el, x => ({ transform: `translateX(${x}px)` })]];
    if (under) parts.push([under.el, x => ({ transform: `translateX(${-PARALLAX * (w - x)}px)` })]);
    const g = glide(parts, top.x, to, v);
    slideRun = g;
    await g.done;
    if (slideRun === g) { slideRun = null; place(top, under, to); g.stop(); }
  };
  /** a page over the one showing (a history step: Back takes it away) @param {string} id @param {HTMLElement | null} [from]  the row that opened it */
  async function push(id, from = null) {
    const pageEl = pages.get(id);
    if (!pageEl || !d.open || closing || stack.some(s => s.id === id)) return;
    const under = stack[stack.length - 1];
    /** @type {Shown} */
    const top = { id, el: pageEl, x: width(), v: 0, step: null, from };
    stack.push(top);
    opening.get(id)?.();
    if (id === 'account') opening.get('account-tools')?.();
    pageEl.hidden = false;
    pageEl.inert = false;
    /** @type {HTMLElement} */ (pageEl.querySelector('.vl-set-scroll')).scrollTop = 0;
    place(top, under, top.x);
    named();
    top.step = transients().open(() => { top.step = null; void pop(top); });
    /** @type {HTMLElement} */ (pageEl.querySelector('.vl-set-title')).focus({ preventScroll: true });
    await slide(top, under, 0);
    if (stack[stack.length - 1] === top) { under.el.inert = true; under.el.hidden = true; }
  }
  /** a page away (its history step already gone: Back, the arrow, a swipe) @param {Shown} top */
  async function pop(top) {
    const i = stack.indexOf(top);
    if (i < 1) return;
    stack.splice(i, 1);
    const under = stack[i - 1];
    under.el.hidden = false;
    under.el.inert = false;
    named();
    if (!closing && d.open) { place(top, under, top.x); await slide(top, under, width(), top.v); }
    top.el.hidden = true;
    top.el.style.transform = '';
    top.v = 0;
    under.el.style.transform = '';
    if (!closing) top.from?.focus({ preventScroll: true });
  }
  /** Back from the page on top: its history step taken back (which slides it away) */
  const stepBack = async () => {
    const top = stack[stack.length - 1];
    if (stack.length < 2) return;
    if (top.step?.active) await top.step.close(); else await pop(top);
  };
  const named = () => d.setAttribute('aria-labelledby', `vl-set-title-${stack[stack.length - 1].id}`);
  /** a swipe right on a page: it follows the finger, and past a third (or flicked) it goes Back @param {HTMLElement} pageEl */
  function swipeBack(pageEl) {
    drag(pageEl, {
      axis: 'x', name: 'back',
      filter: e => !(/** @type {Element} */ (e.target).closest?.('input, select, textarea, .ui-tab-arrange, .vl-set-arrange')),
      start: () => {
        const top = stack[stack.length - 1], under = stack[stack.length - 2];
        if (top.el !== pageEl || !under) return 0;
        slideRun?.stop();
        slideRun = null;
        under.el.hidden = false;
        return top.x;
      },
      move: x => { const top = stack[stack.length - 1]; if (top.el === pageEl) place(top, stack[stack.length - 2], Math.max(0, x)); },
      end: (x, v) => {
        const top = stack[stack.length - 1], under = stack[stack.length - 2];
        if (top.el !== pageEl || !under) return;
        if (x > width() / 3 || v > 0.5) { top.v = v; void stepBack(); }
        else void slide(top, under, 0, v).then(() => { if (stack[stack.length - 1] === top) under.el.hidden = true; });
      },
      bounds: () => [0, width()],
    });
  }

  // ---- the sheet: up from the bottom, down to close (the shade behind it fades with it)
  let sy = 0;
  /** @type {ReturnType<typeof glide> | null} */
  let sheetRun = null;
  const height = () => d.getBoundingClientRect().height || innerHeight;
  const sheetPut = (/** @type {number} */ y) => {
    sy = y;
    d.style.transform = y > 0.5 ? `translateY(${y}px)` : '';
    shadeEl().style.opacity = String(Math.max(0, 1 - y / height()));
  };
  /** @param {number} to @param {number} [v] */
  const sheetMove = async (to, v = 0) => {
    const from = sheetRun ? sheetRun.stop() : sy;
    sheetRun = null;
    if (still()) { sheetPut(to); return; }
    const hh = height();
    const g = glide([[d, y => ({ transform: `translateY(${Math.max(0, y)}px)` })], [shadeEl(), y => ({ opacity: String(Math.max(0, 1 - y / hh)) })]], from, to, v);
    sheetRun = g;
    await g.done;
    if (sheetRun === g) { sheetRun = null; sheetPut(to); g.stop(); }
  };
  drag(root.head, {
    axis: 'y', mouse: true, name: 'sheet',
    start: () => { const at = sheetRun ? sheetRun.stop() : sy; sheetRun = null; sheetPut(at); return at; },
    move: y => sheetPut(Math.max(0, y)),
    end: (y, v) => { if (y > height() / 3 || v > 0.5) void close(v); else void sheetMove(0, v); },
    bounds: () => [0, height()],
  });

  /** @type {{ readonly active: boolean, close: () => Promise<void> } | null} */
  let rootStep = null;
  let closing = false;
  /** @type {Promise<void> | null} */
  let shut = null;
  /** every page off the stack, the root alone (closed) */
  const restack = () => {
    for (const s of stack.splice(1)) { s.el.hidden = true; s.el.style.transform = ''; s.step = null; }
    root.pageEl.hidden = false;
    root.pageEl.inert = false;
    root.pageEl.style.transform = '';
    named();
  };
  /** down and closed (the steps already gone) @param {number} [v] */
  const hide = (v = 0) => (shut ||= (async () => {
    closing = true;
    if (d.open) await sheetMove(height(), v);
    if (d.open) d.close();
    shadeEl().classList.remove('on');
    restack();
    closing = false;
    shut = null;
  })());
  /** closed: the pages' steps and the sheet's taken back, newest first, then down it goes @param {number} [v] */
  async function close(v = 0) {
    if (!d.open) return;
    if (shut) return shut;
    closing = true;
    for (const s of [...stack.slice(1).reverse().map(x => x.step), rootStep]) if (s?.active) await s.close();
    rootStep = null;
    await hide(v);
  }
  const open = () => {
    if (d.open && !shut) return;
    closing = false;
    restack();
    q.value = '';
    find();
    say('');
    redraws.forEach(f => f());
    opening.forEach(f => f());
    shadeEl().classList.add('on');
    if (!d.open) d.showModal();
    sheetPut(height());
    rootStep = transients().open(() => { rootStep = null; void hide(); });
    root.scroll.scrollTop = 0;
    /** @type {HTMLElement} */ (root.pageEl.querySelector('.vl-set-title')).focus({ preventScroll: true });
    void sheetMove(0);
  };
  d.addEventListener('cancel', e => { e.preventDefault(); void close(); });
  // closed from outside (Sign out, another screen taking over): its steps go too, nothing moves
  d.addEventListener('close', () => {
    if (shut) return;
    closing = true;
    void (async () => {
      for (const s of [...stack.slice(1).reverse().map(x => x.step), rootStep]) if (s?.active) await s.close();
      rootStep = null;
      shadeEl().classList.remove('on');
      sheetPut(0);
      restack();
      closing = false;
    })();
  });
  // a button that opens one of the app's sheets: Settings closes first (its steps landed), then the click goes on to list.js
  let passing = false;
  d.addEventListener('click', e => {
    const b = /** @type {Element} */ (e.target).closest?.('button[id]');
    if (!b || passing || !AFTER_CLOSE.has(b.id)) return;
    e.stopPropagation();
    void close().then(() => { passing = true; try { /** @type {HTMLElement} */ (b).click(); } finally { passing = false; } });
  });
  return { open, close };
}
