import { describe, expect, it } from 'vitest';

import { galleryScopeEmptyText, STUDIO_ASSET_SCOPES } from './labels';

describe('gallery labels', () => {
  it('offers Entdecken, Meine and Gemerkt in that order', () => {
    expect(STUDIO_ASSET_SCOPES.map((s) => [s.value, s.label])).toEqual([
      ['shop', 'Entdecken'],
      ['mine', 'Meine'],
      ['saved', 'Gemerkt'],
    ]);
  });

  it('names an empty list per kind and scope', () => {
    expect(galleryScopeEmptyText('sticker', 'mine')).toBe('Du hast noch keine eigenen Sticker.');
    expect(galleryScopeEmptyText('background', 'saved')).toBe(
      'Du hast dir noch keine Hintergründe gemerkt.'
    );
    expect(galleryScopeEmptyText('background', 'shop')).toBe(
      'Unter „Entdecken“ gibt es noch keine Hintergründe.'
    );
  });
});
