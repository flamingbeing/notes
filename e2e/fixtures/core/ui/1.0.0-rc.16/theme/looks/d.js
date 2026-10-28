// Look D, slim: a slim bar that always shows the screen's name over a hairline (no large title), room at its start for
// the app's side-bar button, lists as cards inset from the edges with faint lines, a full-width tab bar with icons, no
// band and no glass; quiet like a notes app. Data only (looks.js says what each key means).
/** @type {import('../looks.js').Look} */
export default {
  id: 'd',
  name: 'Slim',
  desc: 'A slim bar with the name always showing, flat lists, no band',
  variants: { header: 'slim', menu: 'popover', glass: 'none', tick: 'round', tabbar: 'edge' },
  tokens: {
    'look-font-head': 'inherit',
    'title-size': '1.25rem', 'title-weight': '600', 'title-track': '0',
    'bar-line': 'var(--line)',
    'card-r': 'var(--radius-l)', 'list-inset': 'var(--gap)', 'list-bg': 'var(--surface)',
    'list-edge': 'transparent', 'list-sep': 'color-mix(in srgb, var(--line) 25%, transparent)', 'list-shadow': 'none',
    'row-weight': '400',
    'control-r': 'var(--radius)', 'pill-r': 'var(--radius-l)',
    'menu-r': 'var(--radius-l)', 'sheet-r': 'calc(var(--radius-l) * 1.33)',
    'tick-size': '20px', 'tab-active': 'transparent',
    'glass-tint': '0%',
  },
};
