import { readFileSync } from 'node:fs';

import { SITE_IMAGE_FOCUS_STEPS } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

const baseCss = readFileSync(new URL('./base.css', import.meta.url), 'utf8');

describe('base.css', () => {
  it('defines all 25 focus classes', () => {
    const found = [
      ...baseCss.matchAll(
        /\.site-focus-(\d+)-(\d+)\s*\{\s*object-position:\s*(\d+)% (\d+)%;\s*\}/g
      ),
    ];
    expect(found).toHaveLength(25);
    for (const x of SITE_IMAGE_FOCUS_STEPS) {
      for (const y of SITE_IMAGE_FOCUS_STEPS) {
        expect(found.some((m) => m.slice(1).join(',') === `${x},${y},${x},${y}`)).toBe(true);
      }
    }
  });
});
