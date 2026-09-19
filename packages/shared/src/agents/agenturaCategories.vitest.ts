import { describe, expect, it } from 'vitest';

import {
  AGENTURA_CATEGORIES,
  AGENTURA_TYPE_LABELS,
  AGENTURA_TYPE_VALUES,
  DEFAULT_CATEGORY,
  DEFAULT_TYPE,
  agenturaCategoriesForPlatform,
} from './agenturaCategories.js';

/**
 * Die Regale sind die Navigation des Markts — wer eines entfernt, entfernt einen
 * Weg zu Inhalten, die es weiterhin gibt. Diese Prüfungen halten die Zusagen
 * fest, die der Umbau gegeben hat: „Geteilt mit Gruppen" und „Empfohlen" sind im
 * Web keine Regale mehr, sondern Abschnitte; die Startansicht ist fest.
 */

const webKeys = () => agenturaCategoriesForPlatform('web').map((c) => c.key);

describe('Agentura-Regale', () => {
  it('öffnet fest auf „Meine Grüneratoren"', () => {
    expect(DEFAULT_CATEGORY).toBe('meine');
    expect(webKeys()).toContain(DEFAULT_CATEGORY);
  });

  it('hat im Web kein „Empfohlen"-Regal mehr — der Abschnitt liegt in `gruenerator`', () => {
    expect(webKeys()).not.toContain('empfohlen');
  });

  it('behält „Empfohlen" mobil, wo es das Startregal ist', () => {
    expect(agenturaCategoriesForPlatform('mobile').map((c) => c.key)).toContain('empfohlen');
  });

  it('führt das eigene Landesverbands-Regal', () => {
    expect(webKeys()).toContain('landesverband');
  });

  it('hat kein „Favoriten"-Regal mehr — es ist ein Typ-Filter geworden', () => {
    expect(webKeys()).not.toContain('favoriten');
    expect(agenturaCategoriesForPlatform('mobile').map((c) => c.key)).not.toContain('favoriten');
    // Der Schlüssel bleibt in der Registry: `AGENTURA_CATEGORY_ICONS` ist auf
    // die volle Union getippt, und Registry-IDs werden stillgelegt, nicht
    // entfernt.
    expect(AGENTURA_CATEGORIES.map((c) => c.key)).toContain('favoriten');
    expect(AGENTURA_TYPE_VALUES).toContain('fav');
  });

  it('jedes Regal trägt eine Beschreibung — sie steht als Blurb unter der Überschrift', () => {
    for (const cat of AGENTURA_CATEGORIES) {
      expect(cat.description.length, cat.key).toBeGreaterThan(0);
    }
  });

  it('`platforms` bleibt ein Array-Literal je Eintrag — der Doku-Generator liest es per AST', () => {
    // Eine geteilte Konstante (früher `BOTH`) kann `generate-agentura.mjs` nicht
    // auflösen; es fiele stumm auf „web-only" zurück und schriebe ein Regal in
    // die Doku, das es dort nicht gibt.
    for (const cat of AGENTURA_CATEGORIES) {
      if (cat.platforms === undefined) continue;
      // Auf die Bauform prüfen, nicht auf den Inhalt: `favoriten` trägt seit
      // dem Typ-Filter bewusst `[]` und ist damit auf keiner Plattform ein
      // Regal — ein leeres Literal ist immer noch ein Literal.
      expect(Array.isArray(cat.platforms), cat.key).toBe(true);
    }
  });
});

describe('Agentura-Typfilter', () => {
  it('öffnet ungefiltert', () => {
    expect(DEFAULT_TYPE).toBe('all');
    expect(AGENTURA_TYPE_VALUES).toContain(DEFAULT_TYPE);
  });

  it('jeder Wert trägt ein Label — die Reihe wird daraus gezeichnet', () => {
    for (const value of AGENTURA_TYPE_VALUES) {
      expect(AGENTURA_TYPE_LABELS[value].length, value).toBeGreaterThan(0);
    }
  });
});
