import { describe, expect, it } from 'vitest';

import { isCustomRolleOffered, offeredEbenen, offeredRollen } from './instanceRoleOffer.js';
import { DE_EBENEN, DE_ROLLEN } from './rolesConfig.js';

const BGST_ROLLE = 'Mitarbeiter*in Bundesgeschäftsstelle';

describe('offeredEbenen', () => {
  it('passes everything through where no policy narrows it', () => {
    expect(offeredEbenen(DE_EBENEN, 'production')).toEqual(DE_EBENEN);
  });

  it('narrows bgst to the federal level', () => {
    expect(offeredEbenen(DE_EBENEN, 'bgst').map((e) => e.id)).toEqual(['bund']);
  });

  it('keeps registry order', () => {
    const offered = offeredEbenen(DE_EBENEN, 'production').map((e) => e.id);
    expect(offered).toEqual(DE_EBENEN.map((e) => e.id));
  });
});

describe('offeredRollen', () => {
  it('passes everything through where no policy narrows it', () => {
    expect(offeredRollen('bund', DE_ROLLEN['bund'] ?? [], 'production')).toEqual(DE_ROLLEN['bund']);
  });

  it('narrows bgst to the Bundesgeschäftsstelle role', () => {
    expect(offeredRollen('bund', DE_ROLLEN['bund'] ?? [], 'bgst')).toEqual([BGST_ROLLE]);
  });

  // Without this a caller reaching the role list through a stale Ebene id would
  // hand out roles the instance meant to drop.
  it('yields nothing for an Ebene the instance does not offer', () => {
    expect(offeredRollen('land', DE_ROLLEN['land'] ?? [], 'bgst')).toEqual([]);
  });
});

describe('isCustomRolleOffered', () => {
  it('is on by default', () => {
    expect(isCustomRolleOffered('production')).toBe(true);
  });

  it('is off on bgst', () => {
    expect(isCustomRolleOffered('bgst')).toBe(false);
  });
});
