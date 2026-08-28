import { describe, expect, it } from 'vitest';

import { AGENT_ICON_KEYS } from './agentIcons.js';
import { SYSTEM_AGENTS } from './system.js';

/**
 * `agentFrontmatterSchema` already rejects an unknown `iconKey` at codegen time,
 * and `Record<AgentIconKey, …>` makes a missing platform mapping a compile
 * error. Neither reaches the *committed* `index.generated.ts`: nothing re-runs
 * the agent codegen in CI, so a hand-edit or a stale regeneration would ship a
 * key that resolves nowhere — which is how 7 of 19 agents came to show the
 * generic sparkle (#2951). This closes that last gap, and covers the LV builders
 * in `lv*Agents.ts`, which the frontmatter schema never sees.
 */
describe('Agenten-Icons', () => {
  const withIconKey = SYSTEM_AGENTS.filter((a) => a.iconKey);

  it('kennt jeden iconKey der Registry', () => {
    const known = new Set<string>(AGENT_ICON_KEYS);
    const unknown = withIconKey
      .filter((a) => !known.has(a.iconKey as string))
      .map((a) => `${a.identifier} → "${a.iconKey as string}"`);
    expect(unknown, 'Unbekannte iconKeys — in AGENT_ICON_KEYS eintragen').toEqual([]);
  });

  it('prüft überhaupt etwas', () => {
    expect(withIconKey.length).toBeGreaterThan(15);
  });
});
