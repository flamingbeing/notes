// The Vault layout's Settings: the kit's vault settings sheet (app-ui ui/vault/settings-sheet.js: a grey sheet over
// the app, a page over the one before, its Back, the X, a drag down, Esc, the search), drawn from settings-map.js.
// The root has the "Options" card (a row per page) and the "Core plugins" card (the page of each plugin or Notes extra
// that has options, while it is on). Every option is bound to the settings api (settings.set, settings.watch), its
// control named #opt-<key> as the Classic Settings name theirs; the buttons that open the app's sheets keep their
// ids, so list.js opens them (the sheet closes first). What stays Notes' own: the pages and their words, and the parts
// only Notes has (the theme's pickers, the accent and font size, the spaces, the tab arranger, the account).
import { tabArranger, installApp, installMode, aboutSheet, LABELS } from '@core/ui';
import { settingsSheet } from '@core/ui/vault/settings';
import { themeSwitch, themeChoice, chooseTheme, previewTheme, PRESET_IDS, TEXT_SIZES } from '@core/theme';
import { transients } from '../shell/transients.js';
import { available, RULES, repaints } from '../settings/bar.js';
import { OPTIONS } from '../settings/options.js';
import { GLYPHS, glyph } from './icons.js';
import { featureOn, GROUPS } from './plugins.js';
import { PAGES, OPTION_PAGES, PLUGIN_PAGES, TOOLBAR, pluginCards } from './settings-map.js';

/** @typedef {import('./settings-map.js').Row} Row @typedef {import('./settings-map.js').Page} Page */
/** @typedef {import('app-ui/ui/vault/settings-sheet.js').SettingsRow} KitRow @typedef {import('app-ui/ui/vault/settings-sheet.js').SettingsCard} KitCard */

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
const FONT_PX = { regular: 16, large: 18, larger: 20 };
/** @param {string} name */
const nodes = name => GLYPHS[name] || GLYPHS.x;
/** a row's second line, once the sheet has drawn the row around its control @param {Element} control */
const subOf = control => /** @type {HTMLElement | null} */ (control.closest('.ui-vault-set-row')?.querySelector('.ui-vault-set-sub') || null);

/**
 * @param {import('../cloud.js').Started} app
 * @param {{ list: ReturnType<typeof import('../screens/list.js').listScreen>, haiku: () => unknown, who: () => string }} h
 *   haiku: the Haiku page shown; who: the signed-in email
 * @returns {{ open: () => void, close: () => Promise<void> }}
 */
export function settingsHost(app, h) {
  const { settings } = app;
  const on = (/** @type {string} */ key) => featureOn('vault', k => settings.get(k), key);
  /** @type {import('app-ui/ui/vault/settings-sheet.js').SettingsSheet} */
  let sheet;
  /** @param {string} text @param {boolean} [bad] */
  const say = (text, bad = false) => sheet.say(text, bad);
  // (the buttons list.js shows or hides by what is on, who may: told again once a page with them is drawn)
  let told = false;
  const tell = () => { if (told) return; told = true; queueMicrotask(() => { told = false; h.list.modules(); }); };

  /** a pill button @param {string} label @param {() => unknown} run @param {{ id?: string, danger?: boolean }} [o] */
  const pill = (label, run, o = {}) => {
    const b = el('button', { type: 'button', className: `ui-vault-set-pill${o.danger ? ' is-danger' : ''}`, textContent: label });
    if (o.id) b.id = o.id;
    b.addEventListener('click', () => void run());
    return b;
  };
  /** a choice with the kit's chevrons over it @param {HTMLSelectElement} pick */
  const drop = pick => el('span', { className: 'ui-vault-set-drop' }, pick, glyph('chevronsUpDown', 'ui-vault-set-chev'));
  /** @param {string} key @param {unknown} v */
  const save = async (key, v) => { await settings.set(key, v); };

  /** an option's row: a switch, a choice (a pill of choices) or a folder box @param {import('./settings-map.js').OptionRow} r @param {string} keywords @returns {KitRow} */
  const optionRow = (r, keywords) => {
    const id = r.alias ? `vl-opt-${r.key}-2` : `opt-${r.key}`;
    const def = OPTIONS[r.key]?.default;
    const w = r.when;
    const base = { id, label: r.label, sub: r.sub, keywords, shown: w ? () => on(w) : undefined };
    if (r.choices) {
      return { ...base, choice: { options: r.choices, get: () => String(settings.get(r.key) ?? def),
        // (a new layout: the app loads again in it)
        set: async v => { await save(r.key, v); if (r.key === 'layout') location.reload(); } } };
    }
    if (typeof def === 'boolean') return { ...base, toggle: { get: () => settings.get(r.key) === true, set: v => save(r.key, v) } };
    return { ...base, under: true, control: () => {
      const box = /** @type {HTMLInputElement} */ (el('input', { id, className: 'vl-set-input', maxLength: 200, placeholder: r.hint || '', autocomplete: 'off', spellcheck: false }));
      box.value = String(settings.get(r.key) || '');
      // (kept when the box is left: the option's clean trims the slashes)
      box.addEventListener('change', async () => {
        try { await save(r.key, box.value); say(''); } catch (e) { say(e instanceof Error ? e.message : String(e), true); }
        box.value = String(settings.get(r.key) || '');
      });
      return box;
    } };
  };

  let version = app.update ? '…' : 'dev';
  app.update?.versionLabel().then((/** @type {string} */ v) => { version = v || LABELS.notInstalled; }, () => { version = LABELS.notInstalled; })
    .then(() => sheet?.refresh());
  /** @type {() => void} */
  let arrangerStop = () => {};
  /** @type {HTMLElement | null} */
  let arrangerHost = null;
  const arrange = () => {
    arrangerStop();
    arrangerStop = () => {};
    if (arrangerHost?.isConnected) arrangerStop = tabArranger(arrangerHost, { tabs: available(), get: () => settings.get('tabs'), set: v => settings.set('tabs', v), rules: RULES });
  };
  repaints.add(arrange);

  /** @type {Record<string, (r: import('./settings-map.js').PartRow, keywords: string) => KitRow>} the parts the map leaves to the screen */
  const PARTS = {
    version: () => ({ label: `Version ${version}`, value: '' }),
    update: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, under: true, control: () => {
      const go = pill('Check now', async () => {
        const line = subOf(go);
        if (!line) return;
        line.setAttribute('role', 'status');
        line.textContent = LABELS.checking;
        try { line.textContent = (await app.update?.checkNow()) ? LABELS.updated : LABELS.newest; }
        catch { line.textContent = LABELS.checkFailed; }
      }, { id: 'vl-set-check' });
      go.disabled = !app.update;
      return go;
    } }),
    account: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, under: true, control: () => {
      const out = pill('Log out', () => {}, { id: 'sign-out', danger: true });
      // (the email after the line's words, where the app keeps it current)
      queueMicrotask(() => subOf(out)?.append(' ', el('span', { id: 'who', textContent: h.who() })));
      return out;
    } }),
    file: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, under: true, control: () => {
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
      return el('div', { className: 'vl-set-pills' }, exp, imp, picker);
    } }),
    scheme: (r, keywords) => ({ id: 'vl-scheme', label: r.label, sub: r.sub, keywords,
      choice: { options: [['auto', 'Adapt to system'], ['light', 'Light'], ['dark', 'Dark']], get: () => themeChoice().theme, set: v => pickTheme({ theme: v }) } }),
    accent: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, control: () => {
      const well = /** @type {HTMLInputElement} */ (el('input', { type: 'color', id: 'vl-accent', className: 'vl-set-well' }));
      well.setAttribute('aria-label', r.label);
      const reset = el('button', { type: 'button', className: 'vl-set-reset', id: 'vl-accent-reset', title: 'Back to the default colour' }, glyph('rotateCcw'));
      reset.setAttribute('aria-label', 'Back to the default accent colour');
      const sync = () => { well.value = themeChoice().accent || VAULT_ACCENT; reset.hidden = !themeChoice().accent; };
      well.addEventListener('change', () => { pickTheme({ accent: well.value }); sync(); });
      reset.addEventListener('click', () => { pickTheme({ accent: '' }); sync(); well.focus(); });
      sync();
      return el('div', { className: 'vl-set-ctl' }, reset, well);
    } }),
    fontSize: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, control: () => {
      const slide = /** @type {HTMLInputElement} */ (el('input', { type: 'range', id: 'vl-font-size', className: 'vl-set-range', min: '0', max: String(TEXT_SIZES.length - 1), step: '1' }));
      slide.setAttribute('aria-label', r.label);
      const value = el('span', { className: 'ui-vault-set-value', id: 'vl-font-size-value' });
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
      return el('div', { className: 'vl-set-ctl' }, reset, value, slide);
    } }),
    theme: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, control: () => {
      const host = el('div', { className: 'vl-set-theme vl-set-bare' });
      themeSwitch(host);
      // (the kit's pickers the Vault layout has its own rows for, or pins: Base color scheme, Accent color and Font
      // size above; look, style, ground and density stay the Classic layout's)
      for (const id of ['look', 'theme', 'preset', 'surface', 'density', 'text', 'accent']) host.querySelector(`#${id}-pick`)?.closest('label')?.remove();
      for (const b of host.querySelectorAll('.theme-switch > button')) b.remove();
      host.querySelector('datalist')?.remove();
      // (each of the kit's pickers as a row: its words over a pill)
      for (const label of host.querySelectorAll('.theme-switch > label')) {
        const lead = label.firstChild;
        if (lead?.nodeType === Node.TEXT_NODE) label.replaceChild(el('span', { className: 'ui-vault-set-name', textContent: (lead.textContent || '').trim() }), lead);
        const pick = label.querySelector('select');
        if (pick) { pick.classList.add('ui-vault-set-select'); const at = el('span'); pick.before(at); at.replaceWith(drop(pick)); }
        label.classList.add('ui-vault-set-row', 'is-under');
      }
      // (a pick there shows the whole choice again: the Vault palette pinned back over it)
      host.addEventListener('change', () => pickTheme());
      return host;
    } }),
    commands: (r, keywords) => ({ label: r.label, keywords, control: () => {
      const spacing = el('div', { className: 'vl-set-cmd', hidden: !on('xLineSpacing') }, glyph('type'), el('span', { textContent: 'Line spacing' }));
      const list = el('div', { className: 'vl-set-cmds vl-set-bare' }, ...TOOLBAR.map(t => el('div', { className: 'vl-set-cmd' }, glyph(t.icon), el('span', { textContent: t.label }))));
      list.insertBefore(spacing, list.lastChild);
      return list;
    } }),
    spaces: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, control: () => {
      const box = el('div', { className: 'vl-set-spaces vl-set-bare' });
      box.setAttribute('role', 'radiogroup');
      box.setAttribute('aria-label', 'Spaces');
      const here = app.space().id, mine = app.vault();
      const rows = [{ id: mine, name: 'My notes' }, ...app.spaces().map(s => ({ id: s.id, name: s.role === 'view' ? `${s.name} (view only)` : s.name }))];
      box.append(...rows.map(s => {
        const b = el('button', { type: 'button', className: 'vl-set-choice', id: `vl-set-space-${s.id}` }, glyph('folder'), el('span', { textContent: s.name }));
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(s.id === here));
        if (s.id === here) b.append(glyph('check', 'vl-set-tick'));
        b.addEventListener('click', async () => {
          if (s.id === app.space().id) return;
          const why = await app.switchTo(s.id);
          sheet.refresh();
          if (why) say(why, true);
        });
        return b;
      }));
      return box;
    } }),
    // (Members only in a shared space, New space for those who may make one; neither: no row)
    'space-tools': (r, keywords) => {
      const members = () => app.space().id !== app.vault();
      const make = () => { const role = h.list.role(); return role === 'admin' || role === 'member'; };
      /** a button of the app's spaces sheet, there on the page (hidden in this layout) @param {string} sel */
      const press = async (/** @type {string} */ sel) => { await sheet.close(); /** @type {HTMLElement | null} */ (document.querySelector(sel))?.click(); };
      return { label: r.label, sub: r.sub, keywords, under: true, shown: () => members() || make(), control: () => {
        const a = pill('Members of this space', () => press('#space-open'), { id: 'vl-set-members' });
        const b = pill('New space', () => press('#space-new'), { id: 'vl-set-new-space' });
        a.hidden = !members();
        b.hidden = !make();
        return el('div', { className: 'vl-set-pills' }, a, b);
      } };
    },
    arranger: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, control: () => {
      const host = el('div', { className: 'vl-set-arrange vl-set-bare' });
      host.dataset.noSwipe = '';
      arrangerHost = host;
      queueMicrotask(arrange);
      return host;
    } }),
    install: (r, keywords) => {
      if (installMode() === 'installed') return { label: r.label, sub: 'Installed.', keywords, value: '' };
      return { label: r.label, sub: r.sub, keywords, under: true, control: () => {
        const go = pill('Install', async () => {
          if (await installApp() !== 'accepted') return;
          const line = subOf(go);
          if (line) line.textContent = 'Installed. Open it from your home screen.';
          go.hidden = true;
        }, { id: 'vl-set-install' });
        return go;
      } };
    },
    licences: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, under: true,
      control: () => pill('Open', () => aboutSheet({ name: 'Notes', update: app.update || null }), { id: 'vl-set-about' }) }),
    haiku: (r, keywords) => ({ label: r.label, sub: r.sub, keywords, under: true, control: () => {
      const go = pill('Open Haiku', async () => { await sheet.close(); h.haiku(); }, { id: 'vl-set-haiku' });
      go.disabled = h.list.role() !== 'admin';
      return go;
    } }),
  };

  /** @param {Row} r @param {Page} page @returns {KitRow | null} */
  const rowOf = (r, page) => {
    const keywords = ['find' in r ? r.find : '', 'info' in r ? r.info : '', page.title].filter(Boolean).join(' ');
    if ('key' in r) return optionRow(r, keywords);
    if ('button' in r) {
      const { button: id, text, danger } = r;
      return { label: r.label, sub: r.sub, keywords, under: true, control: () => {
        const b = pill(text, () => {}, { id, danger });
        b.setAttribute('aria-label', `${text} ${r.label}`);
        tell();
        return b;
      } };
    }
    if ('link' in r) {
      const { link, text } = r;
      return { label: r.label, sub: r.sub, keywords, under: true, control: () => {
        const a = el('a', { className: 'ui-vault-set-pill', href: link, target: '_blank', rel: 'noopener', textContent: text });
        a.setAttribute('aria-label', `${text} ${r.label}`);
        return a;
      } };
    }
    if ('info' in r) { const { info } = r; return { label: r.label, sub: r.sub, keywords, under: true, control: () => el('div', { className: 'ui-vault-set-value', textContent: info }) }; }
    if ('part' in r) return PARTS[r.part]?.(r, keywords) || null;
    return null;
  };
  /** a page's rows as the kit's cards: a heading starts a card; the Core plugins page, a card per group @param {Page} page @returns {KitCard[]} */
  const cardsOf = page => {
    /** @type {KitCard[]} */
    const cards = [];
    /** @type {KitCard | null} */
    let card = null;
    for (const r of page.rows) {
      if ('heading' in r) { card = { title: r.heading, sub: r.sub, rows: [] }; cards.push(card); continue; }
      if ('part' in r && r.part === 'plugins') {
        for (const { group, rows } of pluginCards()) cards.push({ title: GROUPS[group].title, sub: GROUPS[group].sub, rows: rows.map(p => ({
          id: `opt-${p.key}`, label: p.label, sub: p.sub, keywords: page.title, gear: p.gear,
          toggle: { get: () => settings.get(p.key) === true, set: (/** @type {boolean} */ v) => save(p.key, v) },
        })) });
        card = null;
        continue;
      }
      const row = rowOf(r, page);
      if (!row) continue;
      if (!card) { card = { rows: [] }; cards.push(card); }
      card.rows.push(row);
    }
    return cards;
  };
  /** @type {import('app-ui/ui/vault/settings-sheet.js').SettingsPage[]} */
  const pages = PAGES.map(p => ({ id: p.id, title: p.title, icon: nodes(p.icon), cards: () => cardsOf(p), shown: () => !p.plugin || on(p.plugin) }));
  /** @returns {KitCard[]} */
  const rootCards = () => [
    { title: 'Options', rows: OPTION_PAGES.map(p => ({ go: p.id, label: p.title })) },
    { title: 'Core plugins', rows: PLUGIN_PAGES.map(p => ({ go: p.id, label: p.title, shown: () => on(/** @type {string} */ (p.plugin)) })) },
  ];
  sheet = settingsSheet({ id: 'vl-set', title: 'Settings', root: rootCards, pages, steps: transients(), search: { placeholder: 'Search settings...' } });
  const d = sheet.el;

  // ---- a change from anywhere (here, another tab, a profile, an import): its controls show it, and the page on top
  // is drawn again only if a row there came or went (so a switch's knob keeps moving)
  /** @type {Map<string, string>} the plugin's options page: its gear */
  const gearOf = new Map(pluginCards().flatMap(c => c.rows).filter(p => p.gear).map(p => [p.key, /** @type {string} */ (p.gear)]));
  /** whether a row of the page on top came or went since it was drawn (its rows' places against the drawn ones) */
  const drift = () => {
    const top = sheet.top();
    const page = PAGES.find(pg => pg.id === top);
    const cards = top === 'root' ? rootCards() : page ? cardsOf(page) : [];
    const want = cards.flatMap((c, ci) => c.rows.map((r, ri) => (!r.shown || r.shown() ? `${ci}-${ri}` : ''))).filter(Boolean).join(' ');
    const drawn = d.querySelectorAll(`.ui-vault-set-page[data-page="${top}"] .ui-vault-set-card > [data-row]`);
    return want !== [...drawn].map(n => /** @type {HTMLElement} */ (n).dataset.row).join(' ');
  };
  settings.watch(null, (/** @type {unknown} */ v, /** @type {string | undefined} */ key) => {
    if (!sheet.isOpen()) return;
    if (key) {
      for (const id of [`opt-${key}`, `vl-opt-${key}-2`]) {
        const c = document.getElementById(id);
        if (c instanceof HTMLInputElement && c.type === 'checkbox') c.checked = v === true;
        else if (c instanceof HTMLSelectElement) c.value = String(v ?? OPTIONS[key]?.default);
        else if (c instanceof HTMLInputElement && document.activeElement !== c) c.value = String(v || '');
      }
      const g = gearOf.get(key) && document.getElementById(`vl-set-gear-${gearOf.get(key)}`);
      if (g) g.hidden = v !== true;
    }
    if (drift()) sheet.refresh();
  });

  // a button that opens one of the app's sheets: Settings closes first (its steps landed), then the click goes on to list.js
  let passing = false;
  d.addEventListener('click', e => {
    const b = /** @type {Element} */ (e.target).closest?.('button[id]');
    if (!b || passing || !AFTER_CLOSE.has(b.id)) return;
    e.stopPropagation();
    void sheet.close().then(() => { passing = true; try { /** @type {HTMLElement} */ (b).click(); } finally { passing = false; } });
  });
  return {
    open: () => { sheet.open(); tell(); },
    close: () => sheet.close(),
  };
}
