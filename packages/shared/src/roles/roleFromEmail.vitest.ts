import { describe, expect, it } from 'vitest';

import { landesverbandIdsForRoles } from '../agents/landesverbandForRoles.js';

import {
  LV_MAIL_DOMAIN_BUNDESLAENDER,
  landesverbandBundeslandForEmail,
  landesverbandMailDomains,
  suggestedRoleForEmail,
} from './roleFromEmail.js';
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

// Access criterion for the automatic Landesverband project: must be exact.
describe('landesverbandBundeslandForEmail', () => {
  it('maps exactly the LV domain, case-insensitive', () => {
    expect(landesverbandBundeslandForEmail('kim@gruene-hessen.de')).toBe('Hessen');
    expect(landesverbandBundeslandForEmail('Kim@GRUENE-NRW.DE')).toBe('Nordrhein-Westfalen');
    expect(landesverbandBundeslandForEmail('kim@gruene.berlin')).toBe('Berlin');
  });

  it.each([
    ['subdomain of an LV domain', 'kim@kv.gruene-hessen.de'],
    ['LV domain as a prefix', 'kim@gruene-hessen.de.evil.com'],
    ['LV domain inside the local part', 'gruene-hessen.de@example.com'],
    ['look-alike domain', 'kim@gruene-hessen.com'],
    ['federal party domain', 'kim@gruene.de'],
    ['Austrian domain', 'kim@gruene.at'],
    ['prototype key as domain', 'kim@__proto__'],
    ['prototype key as domain (constructor)', 'kim@constructor'],
    ['no at-sign', 'gruene-hessen.de'],
    ['empty local part', '@gruene-hessen.de'],
    ['empty', ''],
  ])('rejects %s', (_label, email) => {
    expect(landesverbandBundeslandForEmail(email)).toBeNull();
  });

  it('rejects null and undefined', () => {
    expect(landesverbandBundeslandForEmail(null)).toBeNull();
    expect(landesverbandBundeslandForEmail(undefined)).toBeNull();
  });
});

describe('landesverbandMailDomains', () => {
  it('lists every domain of a Landesverband and none for unknown labels', () => {
    expect(landesverbandMailDomains('Berlin')).toEqual(['gruene-berlin.de', 'gruene.berlin']);
    expect(landesverbandMailDomains('Hessen')).toEqual(['gruene-hessen.de']);
    expect(landesverbandMailDomains('Wien')).toEqual([]);
  });
});
