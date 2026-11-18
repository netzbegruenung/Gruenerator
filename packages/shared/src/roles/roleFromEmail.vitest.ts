import { describe, expect, it } from 'vitest';

import { landesverbandIdsForRoles } from '../agents/landesverbandForRoles.js';

import { LV_MAIL_DOMAIN_BUNDESLAENDER, suggestedRoleForEmail } from './roleFromEmail.js';
import { DE_BUNDESLAENDER } from './rolesConfig.js';

describe('suggestedRoleForEmail', () => {
  it('suggests the LGS role of the Landesverband behind the mail domain', () => {
    expect(suggestedRoleForEmail('anna@gruene-hessen.de', 'de-DE')).toEqual({
      ebene: 'land',
      rolle: 'Mitarbeiter*in Landesgeschäftsstelle',
      bundesland: 'Hessen',
    });
    expect(suggestedRoleForEmail('Ben@Gruene-Berlin.DE', 'de-DE')?.bundesland).toBe('Berlin');
  });

  it('feeds the LV entitlement once saved', () => {
    const role = suggestedRoleForEmail('anna@gruene-hessen.de', 'de-DE');
    expect(landesverbandIdsForRoles([role!], 'de-DE')).toEqual(['hessen']);
  });

  it('suggests nothing for other domains, subdomains, Austria or a missing address', () => {
    expect(suggestedRoleForEmail('anna@gmail.com', 'de-DE')).toBeNull();
    expect(suggestedRoleForEmail('anna@kv.gruene-hessen.de', 'de-DE')).toBeNull();
    expect(suggestedRoleForEmail('anna@gruene-hessen.de.example.com', 'de-DE')).toBeNull();
    expect(suggestedRoleForEmail('anna@gruene.at', 'de-AT')).toBeNull();
    expect(suggestedRoleForEmail('anna@gruene-hessen.de', 'de-AT')).toBeNull();
    expect(suggestedRoleForEmail(null, 'de-DE')).toBeNull();
    expect(suggestedRoleForEmail('gruene-hessen.de', 'de-DE')).toBeNull();
  });

  it('maps every domain to a Bundesland the wizard offers', () => {
    const labels = new Set(DE_BUNDESLAENDER.map((bl) => bl.label));
    for (const bundesland of LV_MAIL_DOMAIN_BUNDESLAENDER) {
      expect(labels.has(bundesland), bundesland).toBe(true);
    }
  });
});
