import { describe, expect, it } from 'vitest';

import { shareLinkKey } from './slug.js';

describe('shareLinkKey', () => {
  it('liest Suffix, uuid — und sonst nichts', () => {
    expect(shareLinkKey('ov-einladung-Ab3xK9')).toEqual({ slugSuffix: 'Ab3xK9' });
    expect(shareLinkKey('6f1c2d3e-0000-4000-8000-000000000001')).toEqual({
      id: '6f1c2d3e-0000-4000-8000-000000000001',
    });
    expect(shareLinkKey('pressemitteilung')).toBeNull();
  });
});
