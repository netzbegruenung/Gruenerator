import { SITE_BLOCK_TYPES } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { SITE_BLOCK_UI } from './blockUi';

describe('SITE_BLOCK_UI', () => {
  it('names every block type with a label and a description', () => {
    for (const { type } of SITE_BLOCK_TYPES) {
      expect(SITE_BLOCK_UI[type].label).not.toBe('');
      expect(SITE_BLOCK_UI[type].description).not.toBe('');
      expect(typeof SITE_BLOCK_UI[type].icon).toBe('function');
    }
  });

  it('keeps the labels the editor has always shown', () => {
    expect(SITE_BLOCK_UI.hero.label).toBe('Profil');
    expect(SITE_BLOCK_UI.heroImage.label).toBe('Hero-Bild');
    expect(SITE_BLOCK_UI.actions.label).toBe('Aktionen');
  });
});
