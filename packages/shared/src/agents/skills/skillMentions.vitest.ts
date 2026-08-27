/**
 * The retired-mention map is the F1 escape hatch: `presse-hessen` and its four
 * siblings were split into a Partei and a Fraktion recipe, but released mobile
 * binaries, persisted sidebar favourites and old threads keep sending the old
 * mention. If that stops resolving, those users silently lose the recipe and
 * the turn falls back to the agent's base role — a failure that looks like
 * "the model got worse", not like a broken lookup.
 *
 * So the cases worth holding: every retired mention points at a recipe that
 * actually exists, and live mentions pass through untouched.
 */
import { textFormTypeSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  SKILLS,
  canonicalSkillMention,
  hasSystemRecipe,
  lvEbeneForSkillMention,
  resolveSkillMention,
} from './index.js';

const RETIRED = [
  'presse-hessen',
  'presse-mv',
  'presse-bayern',
  'presse-sachsen-anhalt',
  'presse-berlin',
] as const;

describe('canonicalSkillMention', () => {
  it.each(RETIRED)('maps the retired %s onto a recipe that exists', (retired) => {
    const canonical = canonicalSkillMention(retired);

    expect(canonical).not.toBe(retired);
    expect(SKILLS.map((s) => s.mention)).toContain(canonical);
  });

  it('points every retired mention at the Partei level', () => {
    // Die Ebene, die die Rollenzuteilung freischaltet: LV-Material bekommt
    // allein die Landesgeschäftsstelle. Dieselbe Wahl steht als
    // `defaultRecipeMention` an jedem der fünf PR-Agenten — beide zusammen
    // oder gar nicht, sonst widersprechen sich Alias und Vorwahl.
    for (const retired of RETIRED) {
      expect(canonicalSkillMention(retired)).toBe(`${retired}-partei`);
    }
  });

  it('leaves a live mention alone', () => {
    expect(canonicalSkillMention('presse-hessen-fraktion')).toBe('presse-hessen-fraktion');
    expect(canonicalSkillMention('instagram')).toBe('instagram');
  });

  it('passes an unknown mention through rather than returning null', () => {
    expect(canonicalSkillMention('omveinladungen')).toBe('omveinladungen');
  });

  it('resolves a retired mention to its owning agent', () => {
    expect(resolveSkillMention('presse-hessen')).toBe('gruenerator-oeffentlichkeitsarbeit-hessen');
  });
});

describe('the Partei/Fraktion split', () => {
  it.each(['hessen', 'mv', 'bayern', 'sachsen-anhalt', 'berlin'])(
    '%s ships both levels under one owning agent',
    (lv) => {
      const pair = SKILLS.filter((s) => s.mention.startsWith(`presse-${lv}-`));

      expect(pair.map((s) => s.mention).sort()).toEqual([
        `presse-${lv}-fraktion`,
        `presse-${lv}-partei`,
      ]);
      expect(new Set(pair.map((s) => s.identifier)).size).toBe(1);
      // Both appear in the composer and in the model's catalogue; identical
      // descriptions would make the choice unguessable.
      expect(pair[0]?.description).not.toBe(pair[1]?.description);
    }
  );

  /**
   * Ohne `lvEbene` schneidet die API die PM-Beispielsuche nicht zu, und ein
   * Partei-Rezept erdet sich im überwiegend fraktionären Korpus seines
   * Landesverbands. Das fällt nirgends auf — der Text kommt heraus, nur im
   * falschen Register.
   */
  it.each(['hessen', 'mv', 'bayern', 'sachsen-anhalt', 'berlin'])(
    '%s nennt seine Ebene an beiden Rezepten',
    (lv) => {
      expect(lvEbeneForSkillMention(`presse-${lv}-partei`)).toBe('partei');
      expect(lvEbeneForSkillMention(`presse-${lv}-fraktion`)).toBe('fraktion');
    }
  );

  it('gibt für alles ohne Ebenentrennung null zurück', () => {
    // Einstufige Landesverbände und generische Rezepte: der volle Ausschnitt
    // ist dort richtig, nicht bloß geduldet.
    expect(lvEbeneForSkillMention('presse-brandenburg')).toBeNull();
    expect(lvEbeneForSkillMention('presse')).toBeNull();
    expect(lvEbeneForSkillMention('gibtsnicht')).toBeNull();
  });

  it('führt eine zurückgezogene Kennung auf dieselbe Ebene wie ihren Nachfolger', () => {
    expect(lvEbeneForSkillMention('presse-hessen')).toBe('partei');
  });
});

/**
 * `hasSystemRecipe` beantwortet für eine angelernte Textform die Frage, ob sie
 * ein mitgeliefertes Rezept überschreibt oder für sich allein steht. Beide
 * Filter, die daran hängen — der Rezeptkatalog des Modells und das
 * Mention-Menü — filterten vorher hart auf `kind === 'custom'`, mit der
 * Begründung, ein Preset reite ohnehin auf der Mention seines Systemrezepts.
 * Für `antrag` stimmt das nicht: `textFormTypeSchema` kennt vier Presets,
 * `SKILLS` führt drei davon. Die vierte Zeile war auf keinem Pfad erreichbar
 * (#2937).
 */
describe('hasSystemRecipe', () => {
  it('bejaht die Presets, die es als Rezept gibt', () => {
    expect(hasSystemRecipe('presse')).toBe(true);
    expect(hasSystemRecipe('instagram')).toBe(true);
    expect(hasSystemRecipe('facebook')).toBe(true);
  });

  it('verneint „antrag" — ein Preset ohne mitgeliefertes Rezept', () => {
    expect(SKILLS.map((s) => s.mention)).not.toContain('antrag');
    expect(hasSystemRecipe('antrag')).toBe(false);
  });

  it('verneint eine selbst vergebene Mention', () => {
    expect(hasSystemRecipe('omveinladungen')).toBe(false);
  });

  it('bejaht eine zurückgezogene Mention über ihren Nachfolger', () => {
    // Sonst zählte `presse-hessen` aus einem alten Thread als eigenständig und
    // bekäme im Menü einen zweiten Eintrag neben dem lebenden Rezept.
    expect(hasSystemRecipe('presse-hessen')).toBe(true);
  });

  /**
   * Der Drift-Wächter: jeder Textyp gehört in genau einen der beiden Töpfe, und
   * welcher, steht hier. Kommt ein Preset dazu, dessen Rezept noch fehlt,
   * fällt das hier auf statt still in der Oberfläche.
   */
  it('ordnet jeden Preset-Textyp einem der beiden Töpfe zu', () => {
    const withRecipe = textFormTypeSchema.options.filter(hasSystemRecipe);
    const standalone = textFormTypeSchema.options.filter((t) => !hasSystemRecipe(t));

    expect(withRecipe).toEqual(['instagram', 'facebook', 'presse']);
    expect(standalone).toEqual(['antrag']);
  });
});
