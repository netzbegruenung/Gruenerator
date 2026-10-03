import { LANDESVERBAENDE } from '@gruenerator/shared/agents';
import { describe, expect, it } from 'vitest';

import { umfragenPath, umfragenRegion } from './umfragenRegion';

describe('umfragenRegion', () => {
  // The notebook overview links `/umfragen/<lv.id>` — an LV whose id is no
  // PolitPro parliament id would silently lose its poll card.
  it.each(LANDESVERBAENDE.map((lv) => lv.id))('resolves the Landesverband %s', (id) => {
    expect(umfragenRegion(id)?.parliament).toBe(id);
  });

  it('resolves Austria with the AT locale', () => {
    expect(umfragenRegion('oesterreich')).toMatchObject({ label: 'Österreich', locale: 'at' });
  });

  it('rejects anything that is not a Land page', () => {
    expect(umfragenRegion('deutschland')).toBeNull();
    expect(umfragenRegion('atlantis')).toBeNull();
  });

  it('builds the Land path', () => {
    expect(umfragenPath('berlin')).toBe('/umfragen/berlin');
  });
});
