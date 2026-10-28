/**
 * A registration names only actions the Grünerator declared
 * (`HostCanvasActions`, `utils/balkenUtils.ts`): a misspelt action name is a
 * type error, not a kind that silently cannot change. Checked by the
 * package's typecheck; the runtime case only keeps the file a test.
 */
import { describe, expect, it } from 'vitest';

import { BALKEN_KIND } from './balkenKind';

import type { ElementKindRegistration } from '@ggraphic/editor/utils/elementKinds';

describe('balken registration types', () => {
  it('names its actions from HostCanvasActions', () => {
    const misspelt: ElementKindRegistration<'balken'> = {
      ...BALKEN_KIND,
      // @ts-expect-error — not an action of the Grünerator's kinds
      actions: { update: 'updateBalkn', remove: 'removeBalken' },
      // @ts-expect-error — not an action of the Grünerator's kinds
      add: { action: 'addBalkn', args: ({ mode }) => [mode] },
    };
    expect(misspelt.kind).toBe('balken');
    expect(BALKEN_KIND.actions).toEqual({ update: 'updateBalken', remove: 'removeBalken' });
  });
});
