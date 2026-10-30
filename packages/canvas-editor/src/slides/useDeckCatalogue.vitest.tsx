import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDeckCatalogue } from './useDeckCatalogue';

describe('useDeckCatalogue fallback', () => {
  it('falls back to the built-in Offiziell of the picker locale', () => {
    const de = renderHook(() => useDeckCatalogue(null, 'de-DE')).result.current;
    const at = renderHook(() => useDeckCatalogue(null, 'de-AT')).result.current;
    expect(de).toMatchObject([{ id: 'de-folien-offiziell', stil: 'cd', locale: 'de-DE' }]);
    expect(at).toMatchObject([{ id: 'at-folien-offiziell', stil: 'cd', locale: 'de-AT' }]);
  });
});
