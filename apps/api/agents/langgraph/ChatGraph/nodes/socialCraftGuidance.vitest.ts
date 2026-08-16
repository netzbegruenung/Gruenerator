/**
 * Welches Handwerk ein Social-Post-Turn bekommt — Rezept oder eingebaute Rubrik.
 *
 * Der Grund, warum das eine eigene Datei wert ist: bis Phase L gab es hier zwei
 * Schreiber für dieselbe Frage, und sie widersprachen sich messbar. Die Rubrik
 * im öffentlichen Repo nannte für Instagram 800–1500 Zeichen, das
 * korpusgestützte Rezept 350–750 mit Median 530; LinkedIn stand bei 600–1200
 * gegen maximal 600. Wer welchen Text bekam, hing daran, ob der Turn als
 * `social_post` oder als `produktion` klassifiziert wurde — für die*den
 * Nutzer*in ununterscheidbar.
 *
 * Der Rezepttext ist parteiintern und liegt nicht im Repo; hier wird deshalb
 * `getInternalSkillPrompt` gedoppelt. Geprüft wird die AUSWAHL, nie der Inhalt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInternalSkillPrompt = vi.fn<(mention: string) => string | null>();

vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: (mention: string) => getInternalSkillPrompt(mention),
}));

const { craftGuidanceForPlatform, rubricForPlatform } =
  await import('./socialMediaComposerNode.js');

const RECIPE = 'REZEPTTEXT-AUS-DEM-INTERNEN-REPO';

beforeEach(() => {
  getInternalSkillPrompt.mockReset();
  getInternalSkillPrompt.mockReturnValue(null);
});

describe('craftGuidanceForPlatform — das Rezept gewinnt', () => {
  it('nimmt das Rezept zur erkannten Plattform', () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'instagram' ? RECIPE : null));
    const guidance = craftGuidanceForPlatform('instagram', null);
    expect(guidance).toContain(RECIPE);
    // Und NICHT beides: ein zweiter Formatgeber im selben Prompt ist genau der
    // Fall, an dem die Zeichenbudgets auseinanderlaufen.
    expect(guidance).not.toContain('INSTAGRAM-HANDWERK');
  });

  // Die stille Fallgrube, die dieser Schnitt schliesst: `/instagram` im Composer
  // setzt `activeSkillMention`, aber der Social-Zweig baut seinen Systemtext
  // nicht in `buildSystemMessage` — er las das Feld nie. Dieselbe Wahl wirkte
  // auf einem `produktion`-Turn und fiel auf einem `social_post`-Turn weg.
  it('nimmt die ausdrücklich gewählte Textform, auch ohne erkannte Plattform', () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'insta-berlin' ? RECIPE : null));
    expect(craftGuidanceForPlatform(null, 'insta-berlin')).toContain(RECIPE);
  });

  it('die ausdrückliche Wahl schlägt die erkannte Plattform', () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'facebook' ? RECIPE : null));
    expect(craftGuidanceForPlatform('instagram', 'facebook')).toContain(RECIPE);
  });

  // Das Gitter: eine Textform aus einer anderen Familie darf einen Social-Turn
  // nicht umwidmen. Wer `/presse` gewählt hat und dann einen Post verlangt,
  // bekommt Social-Handwerk — nicht die Pressemitteilungs-Form.
  it('ignoriert eine Textform, die kein Social-Rezept ist', () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'presse' ? RECIPE : null));
    const guidance = craftGuidanceForPlatform('instagram', 'presse');
    expect(guidance).not.toContain(RECIPE);
    expect(guidance).toBe(rubricForPlatform('instagram'));
    // Kein Rückfall auf `presse` über einen zweiten Weg.
    expect(getInternalSkillPrompt).not.toHaveBeenCalledWith('presse');
  });

  // Der Auffang ist kein Schmuck: eine Instanz ohne ausgerolltes
  // INTERN_CONTENT_DIR hätte sonst gar keine Formvorgabe.
  it('fällt auf die eingebaute Rubrik zurück, wenn es kein Rezept gibt', () => {
    expect(craftGuidanceForPlatform('linkedin', null)).toBe(rubricForPlatform('linkedin'));
    expect(craftGuidanceForPlatform(null, null)).toBe(rubricForPlatform(null));
  });

  // Der Auffang muss die Familie der gewählten Textform mitnehmen, sonst
  // bekommt eine Instanz ohne ausgerolltes INTERN_CONTENT_DIR für
  // `/insta-berlin` ohne Plattformnennung die generische Rubrik — also
  // ausgerechnet die 800–1500-Zeichen-Ansage statt der Instagram-Form.
  it('leitet die Auffang-Rubrik aus der gewählten Textform ab', () => {
    expect(craftGuidanceForPlatform(null, 'insta-berlin')).toBe(rubricForPlatform('instagram'));
    expect(craftGuidanceForPlatform(null, 'linkedin')).toBe(rubricForPlatform('linkedin'));
    // Eine Textform aus einer anderen Familie färbt den Auffang nicht ein.
    expect(craftGuidanceForPlatform(null, 'presse')).toBe(rubricForPlatform(null));
  });

  // Und der Auffang hält dieselbe Reihenfolge wie der Rezept-Zweig darüber.
  // Kehrte er sie um, hinge die Priorität zwischen Wahl und Erkennung daran,
  // ob gerade ein Rezept ausgerollt ist — der unangenehmste Bug-Typ, weil er
  // sich zwischen Dev und Produktion unterschiedlich verhält.
  it('die ausdrückliche Wahl schlägt die erkannte Plattform auch im Auffang', () => {
    expect(craftGuidanceForPlatform('instagram', 'facebook')).toBe(rubricForPlatform('facebook'));
    expect(craftGuidanceForPlatform('linkedin', 'insta-berlin')).toBe(
      rubricForPlatform('instagram')
    );
  });
});
