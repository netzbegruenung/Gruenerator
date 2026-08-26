import { describe, expect, it } from 'vitest';

import { LV_HUBS, hasLandesverbandContentIn } from './landesverbandHubs.js';

/**
 * Die Frage, die eine ganze Fläche entscheidet: führt die Instanz überhaupt
 * Landesverbände? Der Admin-Bereich zeigt seinen Landesverbände-Reiter nur
 * dann — auf einer Instanz ohne LV gäbe es dort niemanden zu verwalten.
 */
describe('hasLandesverbandContentIn', () => {
  it('bejaht es, wo die Landesverbands-Notizbücher angeboten werden', () => {
    expect(hasLandesverbandContentIn('production')).toBe(true);
    expect(hasLandesverbandContentIn('beta')).toBe(true);
  });

  // bgst blendet `notebookCategories: ['landesebene', 'oesterreich']` aus —
  // damit fällt jedes LV-Notizbuch und mit ihm jeder Hub.
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
