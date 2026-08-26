import { describe, expect, it } from 'vitest';

import {
  autoAssignedRole,
  isCustomRolleOffered,
  offeredEbenen,
  offeredRollen,
  roleAssignedByPolicy,
} from './instanceRoleOffer.js';
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

describe('autoAssignedRole', () => {
  it('assigns the one role bgst offers', () => {
    expect(autoAssignedRole('bgst')).toEqual({ ebene: 'bund', rolle: BGST_ROLLE });
  });

  it('assigns nothing where the wizard has a real choice to offer', () => {
    expect(autoAssignedRole('production')).toBeNull();
    expect(autoAssignedRole('beta')).toBeNull();
    expect(autoAssignedRole('local')).toBeNull();
  });

  it('reads the same on the registry as through the policy', () => {
    expect(autoAssignedRole('bgst')).toEqual(
      roleAssignedByPolicy({ ebenen: ['bund'], rollen: [BGST_ROLLE], allowCustom: false }, 'de-DE')
    );
  });
});

// Die Registry enthält heute genau eine Instanz, die sich selbst eine Rolle
// gibt — und keine, die einen der Ausschlüsse auslöst. Ungeprüft blieben sie
// deshalb genau so lange, bis jemand sie versehentlich konfiguriert.
describe('roleAssignedByPolicy', () => {
  it('refuses an Ebene that would still have to ask for a Bundesland', () => {
    expect(
      roleAssignedByPolicy(
        { ebenen: ['land'], rollen: ['Mitarbeiter*in Landesgeschäftsstelle'], allowCustom: false },
        'de-DE'
      )
    ).toBeNull();
  });

  it('refuses an Ebene that would still have to ask for a Gliederung name', () => {
    expect(
      roleAssignedByPolicy(
        { ebenen: ['kreisverband'], rollen: ['Mitarbeiter*in Kreisverband'], allowCustom: false },
        'de-DE'
      )
    ).toBeNull();
  });

  it('refuses a role that would still have to ask for an MdB name', () => {
    expect(
      roleAssignedByPolicy(
        { ebenen: ['bund'], rollen: ['Mitarbeiter*in MdB-Büro'], allowCustom: false },
        'de-DE'
      )
    ).toBeNull();
  });

  // `offeredRoles` trägt nackte Strings, weil die Instanz-Registry `rolesConfig`
  // nicht importieren darf. Ein Vertipper dort darf niemandem eine Rolle geben,
  // die es nicht gibt.
  it('refuses a role the registry does not know', () => {
    expect(
      roleAssignedByPolicy(
        { ebenen: ['bund'], rollen: ['Mitarbeiter*in Bundesgeschaeftsstelle'], allowCustom: false },
        'de-DE'
      )
    ).toBeNull();
  });

  it('checks against the pinned locale, not always the German registry', () => {
    const atOnly = {
      ebenen: ['bund'],
      rollen: ['Mitarbeiter*in Bundespartei'],
      allowCustom: false,
    } as const;
    expect(roleAssignedByPolicy(atOnly, 'de-AT')).toEqual({
      ebene: 'bund',
      rolle: 'Mitarbeiter*in Bundespartei',
    });
    expect(roleAssignedByPolicy(atOnly, 'de-DE')).toBeNull();
  });

  it('keeps asking where the offer is not a singleton', () => {
    expect(
      roleAssignedByPolicy(
        {
          ebenen: ['bund'],
          rollen: [BGST_ROLLE, 'Mitarbeiter*in Bundestagsfraktion'],
          allowCustom: false,
        },
        'de-DE'
      )
    ).toBeNull();
    expect(roleAssignedByPolicy({ rollen: [BGST_ROLLE], allowCustom: false }, 'de-DE')).toBeNull();
  });

  // Freitext heißt: es gibt eine Antwort, die die Instanz nicht kennt.
  it('keeps asking while the free-text role is still on offer', () => {
    expect(roleAssignedByPolicy({ ebenen: ['bund'], rollen: [BGST_ROLLE] }, 'de-DE')).toBeNull();
  });

  it('assigns nothing without a policy at all', () => {
    expect(roleAssignedByPolicy(undefined, 'de-DE')).toBeNull();
  });
});
