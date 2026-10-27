import { describe, expect, it } from 'vitest';

import {
  LV_HUBS,
  getLandesverbandHubById,
  getLandesverbandHubsByIds,
  hasLandesverbandContentIn,
} from './landesverbandHubs.js';

/**
 * Die Frage, die eine ganze Fläche entscheidet: führt die Instanz überhaupt
 * Landesverbände? Der Admin-Bereich zeigt seinen Landesverbände-Reiter nur
 * dann — auf einer Instanz ohne LV gäbe es dort niemanden zu verwalten.
 */
describe('hasLandesverbandContentIn', () => {
  it('bejaht es, wo die Landesverbands-Notebooks angeboten werden', () => {
    expect(hasLandesverbandContentIn('production')).toBe(true);
    expect(hasLandesverbandContentIn('beta')).toBe(true);
  });

  // bgst blendet `notebookCategories: ['landesebene', 'oesterreich']` aus —
  // damit fällt jedes LV-Notebook und mit ihm jeder Hub.
  it('verneint es, wo die Instanz beide Kategorien ausblendet', () => {
    expect(hasLandesverbandContentIn('bgst')).toBe(false);
  });

  // Drei Landesverbände stehen global auf `enabled: false` (Hamburg,
  // Schleswig-Holstein, Sachsen). Die Aggregatfrage darf davon nicht kippen,
  // sonst hinge der Reiter am Schaltzustand eines einzelnen LV.
  it('bleibt wahr, solange irgendein Landesverband angeboten wird', () => {
    expect(LV_HUBS.length).toBeGreaterThan(3);
    expect(hasLandesverbandContentIn('production')).toBe(true);
  });
});

/**
 * Die Auflösung über die LV-Id läuft durch dasselbe Gate wie der Slug — sonst
 * wäre der Marktplatz die Hintertür, durch die ein abgeschalteter Landesverband
 * wieder auftaucht.
 */
describe('getLandesverbandHubById', () => {
  it('löst einen aktiven Landesverband auf', () => {
    expect(getLandesverbandHubById('berlin', 'production')?.slug).toBe('gruene-berlin');
    expect(getLandesverbandHubById('oesterreich', 'production')?.audience).toBe('de-AT');
  });

  it('verneint unbekannte und abgeschaltete Landesverbände', () => {
    expect(getLandesverbandHubById('atlantis', 'production')).toBeNull();
    expect(getLandesverbandHubById('hamburg', 'production')).toBeNull();
  });

  it('behält Reihenfolge und lässt nicht Auflösbares weg', () => {
    expect(
      getLandesverbandHubsByIds(['hessen', 'hamburg', 'berlin'], 'production').map((h) => h.lvId)
    ).toEqual(['hessen', 'berlin']);
  });
});
