/**
 * Wer darf ein mitgeliefertes Rezept mit einem eigenen Stil überschreiben?
 *
 * Die Mention steht im Pfad und `SKILLS` liegt in jedem Bundle — ohne diese
 * Prüfung wäre `PUT /api/text-forms/presse-bayern-partei` für jede*n offen.
 *
 * Run with: pnpm --filter @gruenerator/api test
 */

import { describe, it, expect } from 'vitest';

import { checkRecipeOverride } from './recipeOverrideAccess.js';

/** Die Kennungen aus der Landesverbands-Registry, nicht die Agenten-Identifier. */
const BAYERN = 'bayern';
const HESSEN = 'hessen';

describe('checkRecipeOverride', () => {
  it('lässt das Rezept des eigenen Landesverbands zu', () => {
    expect(checkRecipeOverride({ mention: 'presse-bayern-partei', lvIds: [BAYERN] })).toEqual({
      ok: true,
    });
  });

  it('weist das Rezept eines fremden Landesverbands mit 403 ab', () => {
    const verdict = checkRecipeOverride({ mention: 'presse-hessen-partei', lvIds: [BAYERN] });
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.status).toBe(403);
  });

  it('weist jemanden ohne Landesverbands-Rolle ab', () => {
    // Leere Liste heißt „keine Rolle" — der Server liest sie aus der
    // Profiltabelle und weiß es immer.
    const verdict = checkRecipeOverride({ mention: 'presse-hessen-partei', lvIds: [] });
    expect(verdict.ok === false && verdict.status).toBe(403);
  });

  it('weist ein generisches Rezept mit 400 ab — dafür gibt es das Preset', () => {
    const verdict = checkRecipeOverride({ mention: 'presse', lvIds: [HESSEN] });
    expect(verdict.ok === false && verdict.status).toBe(400);
  });

  it('weist ein Rezept ohne Landesverband ab', () => {
    // `wahlpruefstein` gehört `gruenerator-universal` — daran hinge keine
    // Berechtigung, also wäre die Überschreibung für alle offen.
    const verdict = checkRecipeOverride({ mention: 'wahlpruefstein', lvIds: [HESSEN] });
    expect(verdict.ok === false && verdict.status).toBe(400);
  });

  it('weist eine erfundene Mention ab', () => {
    const verdict = checkRecipeOverride({ mention: 'gibt-es-nicht', lvIds: [HESSEN] });
    expect(verdict.ok === false && verdict.status).toBe(400);
  });
});
