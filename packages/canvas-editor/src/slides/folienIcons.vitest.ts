import { icons } from '@iconify-json/tabler';
import { FOLIEN_ICONS } from '@gruenerator/contracts/slides';
import { describe, expect, it } from 'vitest';

describe('folien icons', () => {
  it('maps every symbol key to an icon that exists in the bundled Tabler set', () => {
    for (const [key, id] of Object.entries(FOLIEN_ICONS)) {
      expect(id, key).toMatch(/^tabler:/);
      expect(icons.icons[id.replace(/^tabler:/, '')], `${key} → ${id}`).toBeDefined();
    }
  });
});
