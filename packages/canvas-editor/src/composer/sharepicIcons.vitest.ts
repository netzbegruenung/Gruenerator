import { sharepicIconSchema } from '@gruenerator/contracts';
import { icons } from '@iconify-json/tabler';
import { describe, expect, it } from 'vitest';

import { SHAREPIC_ICON_IDS, VERGLEICH_MARKER_IDS } from './sharepicIcons';

describe('sharepic icons', () => {
  it.each([...sharepicIconSchema.options])(
    'maps %s to an icon of the bundled Tabler set',
    (key) => {
      const [prefix, name] = SHAREPIC_ICON_IDS[key].split(':');
      expect(prefix).toBe('tabler');
      expect(icons.icons[name!] ?? icons.aliases?.[name!]).toBeDefined();
    }
  );

  it('finds the comparison markers in the bundled Tabler set', () => {
    for (const id of Object.values(VERGLEICH_MARKER_IDS)) {
      expect(icons.icons[id.replace(/^tabler:/, '')]).toBeDefined();
    }
  });
});
