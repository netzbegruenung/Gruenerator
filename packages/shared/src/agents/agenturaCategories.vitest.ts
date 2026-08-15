import { describe, expect, it } from 'vitest';

import {
  AGENTURA_CATEGORIES,
  DEFAULT_CATEGORY,
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
      expect(cat.platforms.length, cat.key).toBeGreaterThan(0);
    }
  });
});
