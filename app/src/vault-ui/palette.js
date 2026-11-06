// The Vault layout's command palette (Ctrl+P, the ribbon menu, a pull down on the note): the find-as-you-type sheet
// over the commands that can run now (vault-ui/commands.js), each as "Group: Command" with the group muted. Nothing
// typed: the commands run lately on this device first. A command picked runs once the sheet has gone. Loaded on first use.
import { pickSheet } from './pick-sheet.js';
import { rank } from './fuzzy.js';
import { available, fullName, withRecent, ranRecent } from './commands.js';

/** @typedef {import('./commands.js').Command} Command */

/**
 * @param {{ ctx: () => import('./commands.js').CmdCtx, state: () => ReturnType<typeof import('./state.js').vaultState> }} o
 */
export function commandPalette(o) {
  /** @param {Command} c @param {[number, number][]} ranges */
  const item = (c, ranges) => ({ key: c.id, text: fullName(c), ranges, muted: c.group ? c.group.length + 2 : 0 });
  const sheet = pickSheet({
    id: 'vl-palette', label: 'Command palette', placeholder: 'Select a command...', empty: 'No commands found.',
    list: q => {
      const list = available(o.ctx());
      if (!q.trim()) return withRecent(list, o.state().get().cmdRecent).map(c => item(c, []));
      return rank(q, list, fullName).map(r => item(r.item, r.ranges));
    },
    choose: id => {
      const c = o.ctx();
      const cmd = available(c).find(x => x.id === id);
      if (!cmd) return;
      o.state().set({ cmdRecent: ranRecent(o.state().get().cmdRecent, id) });
      return cmd.run(c);
    },
  });
  return { open: () => sheet.open(), close: () => sheet.close(), isOpen: sheet.isOpen };
}
