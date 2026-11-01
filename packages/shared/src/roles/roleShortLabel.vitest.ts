import { describe, expect, it } from 'vitest';

import {
  AT_ROLLEN,
  DE_ROLLEN,
  grueneJugendRoleLocale,
  needsBundesland,
  needsLocalName,
  ROLE_BAUSTEIN_KEYS,
  ROLE_SHORT_LABELS,
  roleShortLabel,
} from './rolesConfig.js';

/**
 * Der Composer zeigt die Rolle als Chip neben dem Plus. Es gibt dort keinen
 * Platz für „Mitarbeiter*in Landesgeschäftsstelle" — die Kurzform muss deshalb
 * für jede Katalogrolle existieren und untereinander unterscheidbar sein.
 */
describe('roleShortLabel', () => {
  it('hat für jeden Baustein ein Kürzel', () => {
    for (const key of ROLE_BAUSTEIN_KEYS) {
      expect(ROLE_SHORT_LABELS[key], key).toBeTruthy();
    }
  });

  it('vergibt kein Kürzel zweimal — sonst sehen zwei Rollen im Chip gleich aus', () => {
    const labels = Object.values(ROLE_SHORT_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('bleibt kurz genug für den Chip', () => {
    for (const [key, label] of Object.entries(ROLE_SHORT_LABELS)) {
      expect(label.length, `${key} → ${label}`).toBeLessThanOrEqual(12);
    }
  });

  it('kürzt jede Rolle aus dem DE- und AT-Katalog', () => {
    for (const [ebene, rollen] of [...Object.entries(DE_ROLLEN), ...Object.entries(AT_ROLLEN)]) {
      for (const rolle of rollen) {
        const short = roleShortLabel(ebene, rolle);
        expect(short, `${ebene}/${rolle}`).not.toBe(rolle);
        expect(short.length, `${ebene}/${rolle} → ${short}`).toBeLessThanOrEqual(12);
      }
    }
  });

  it('unterscheidet „Ratsmitglied" nach Ebene', () => {
    expect(roleShortLabel('kreisverband', 'Ratsmitglied')).toBe('Kreistag');
    expect(roleShortLabel('ortsverband', 'Ratsmitglied')).toBe('Rat');
  });

  it('streift bei frei eingetippten Rollen nur das „Mitarbeiter*in" ab', () => {
    expect(roleShortLabel('land', 'Mitarbeiter*in Klimabeirat')).toBe('Klimabeirat');
    expect(roleShortLabel('land', 'Schatzmeister*in')).toBe('Schatzmeister*in');
  });
});

describe('grueneJugendRoleLocale', () => {
  it('names the country of a Grüne Jugend role and nothing else', () => {
    expect(grueneJugendRoleLocale({ ebene: 'gruene-jugend', rolle: 'GRÜNE JUGEND vor Ort' })).toBe(
      'de-DE'
    );
    expect(
      grueneJugendRoleLocale({ ebene: 'gruene-jugend', rolle: 'Landesorganisation Grüne Jugend' })
    ).toBe('de-AT');
    expect(grueneJugendRoleLocale({ ebene: 'ortsverband', rolle: 'Ratsmitglied' })).toBeNull();
    expect(grueneJugendRoleLocale(null)).toBeNull();
  });
});

describe('needsBundesland / needsLocalName', () => {
  it('lets the Grüne Jugend role decide what it needs', () => {
    expect(needsBundesland('gruene-jugend', 'Bundesverband GRÜNE JUGEND')).toBe(false);
    expect(needsBundesland('gruene-jugend', 'Landesverband GRÜNE JUGEND')).toBe(true);
    expect(needsLocalName('gruene-jugend', 'Landesverband GRÜNE JUGEND')).toBe(false);
    expect(needsLocalName('gruene-jugend', 'Grüne Jugend vor Ort')).toBe(true);
    expect(needsBundesland('gruene-jugend', null)).toBe(false);
  });

  it('keeps the party levels deciding by level', () => {
    expect(needsBundesland('land', null)).toBe(true);
    expect(needsLocalName('kreisverband', 'Ratsmitglied')).toBe(true);
    expect(needsBundesland('bund', 'Mitarbeiter*in MdB-Büro')).toBe(false);
  });
});
