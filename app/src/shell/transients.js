// The page's one Back-closes-it stack (the kit's createTransients): the list's select mode and the Settings pages share
// it, as two stacks on one history would undo each other's entries. Made on first use.
import { createTransients } from '@core/ui';

/** @type {ReturnType<typeof createTransients> | null} */
let made = null;
export const transients = () => (made ||= createTransients({ history, location, events: window }));
