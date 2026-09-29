import { beforeAll, describe, expect, it } from 'vitest';

import { createBalkenInstanceFromPreset } from '../../utils/balkenUtils';
import { loadCanvasConfig } from '../configLoader';

import type { BalkenInstance } from '../../primitives/BalkenGroup';

/**
 * Guard for #3869: `createBaseActions` wires `addBalken` into every template
 * with an elements catalog, but the balken settings panel (colour scheme,
 * width, fine tuning) was only reachable in dreizeilen. Selecting a balken
 * must open a `settings` section that shows exactly that balken — on desktop
 * via `getAutoSwitchTab`, on mobile via "Mehr", which follows the same target.
 */

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

/** Templates whose catalog offers the balken. profilbild has no catalog. */
const TEMPLATES: CanvasConfigType[] = [
  'zitat-pure',
  'info',
  'veranstaltung',
  'simple',
  'dreizeilen',
  'zitat',
  'slider',
  'freeform',
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
];

describe.each(TEMPLATES)('%s: a hand-added balken has reachable settings', (type) => {
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(type);
  }, 120_000);

  it('opens the settings of the selected balken', () => {
    const balken = createBalkenInstanceFromPreset('single');
    const target = config.getAutoSwitchTab?.(balken.id) ?? null;
    expect(target, `${type}: selecting a balken opens no tab`).toBe('settings');

    const section = config.sections[target as string];
    expect(section, `${type}: no section behind '${target}'`).toBeDefined();

    const initial = config.createInitialState({}) as { balkenInstances?: BalkenInstance[] };
    const state = { ...initial, balkenInstances: [...(initial.balkenInstances ?? []), balken] };
    const props = section.propsFactory(state as never, {} as never, {
      selectedElement: balken.id,
    }) as { selectedBalken: BalkenInstance | null; isPrimary: boolean };

    expect(props.selectedBalken?.id).toBe(balken.id);
    expect(props.isPrimary).toBe(false);
  });
});
