import { describe, expect, it } from 'vitest';

import { assetFormBody, emptyAssetForm, isAssetFormComplete, parseTags } from './form';

describe('studio asset form', () => {
  it('splits, trims, dedupes and caps tags', () => {
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`).join(',');
    expect(parseTags(' Klima, ,Klima,  Wald ')).toEqual(['Klima', 'Wald']);
    expect(parseTags(many)).toHaveLength(10);
    expect(parseTags('x'.repeat(40))).toEqual(['x'.repeat(30)]);
  });

  it('needs a title, and the rights confirmation only for public items', () => {
    const form = emptyAssetForm('de-AT');
    expect(isAssetFormComplete(form)).toBe(false);
    expect(isAssetFormComplete({ ...form, title: 'Herz' })).toBe(true);
    expect(isAssetFormComplete({ ...form, title: 'Herz', visibility: 'public' })).toBe(false);
    expect(
      isAssetFormComplete({ ...form, title: 'Herz', visibility: 'public', rights: true })
    ).toBe(true);
  });

  it('confirms rights only for a public item', () => {
    const form = { ...emptyAssetForm('de-DE'), title: ' Herz ', tags: 'a, b', rights: true };
    expect(assetFormBody(form)).toEqual({
      title: 'Herz',
      tags: ['a', 'b'],
      visibility: 'private',
      audience: 'de-DE',
      rightsConfirmed: false,
    });
    expect(assetFormBody({ ...form, visibility: 'public' }).rightsConfirmed).toBe(true);
  });
});
