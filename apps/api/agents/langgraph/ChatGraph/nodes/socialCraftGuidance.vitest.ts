/**
 * Welches Handwerk ein Social-Post-Turn bekommt — angelernter Stil, Rezept oder
 * eingebaute Rubrik.
 *
 * Der Grund, warum das eine eigene Datei wert ist: bis Phase L gab es hier zwei
 * Schreiber für dieselbe Frage, und sie widersprachen sich messbar. Die Rubrik
 * im öffentlichen Repo nannte für Instagram 800–1500 Zeichen, das
 * korpusgestützte Rezept 350–750 mit Median 530; LinkedIn stand bei 600–1200
 * gegen maximal 600. Wer welchen Text bekam, hing daran, ob der Turn als
 * `social_post` oder als `produktion` klassifiziert wurde — für die*den
 * Nutzer*in ununterscheidbar.
 *
 * Dieselbe Sorte Ausfall traf danach die angelernten Stile (#2938): dieser
 * Knoten fragte gar nicht nach ihnen, während `respondNode` und `resolveRecipe`
 * das taten. Auch das war ein Unterschied, der nur am gewählten Knoten hing.
 *
 * Der Rezepttext ist parteiintern und liegt nicht im Repo; hier wird deshalb
 * `getInternalSkillPrompt` gedoppelt. Geprüft wird die AUSWAHL, nie der Inhalt.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInternalSkillPrompt = vi.fn<(mention: string) => string | null>();
const getTextFormForInjection =
  vi.fn<
    (userId: string, mention: string) => Promise<{ title: string; styleBlock: string } | null>
  >();

vi.mock('../../../../services/skills/internalPrompts.js', () => ({
  getInternalSkillPrompt: (mention: string) => getInternalSkillPrompt(mention),
}));

vi.mock('../../../../services/user/textFormRepository.js', () => ({
  getTextFormForInjection: (userId: string, mention: string) =>
    getTextFormForInjection(userId, mention),
}));

const { craftGuidanceForPlatform, rubricForPlatform } =
  await import('./socialMediaComposerNode.js');

const RECIPE = 'REZEPTTEXT-AUS-DEM-INTERNEN-REPO';
const STYLE = 'ANGELERNTER-STILBLOCK';
const USER = 'user-1';

beforeEach(() => {
  getInternalSkillPrompt.mockReset();
  getInternalSkillPrompt.mockReturnValue(null);
  getTextFormForInjection.mockReset();
  getTextFormForInjection.mockResolvedValue(null);
});

describe('craftGuidanceForPlatform — das Rezept gewinnt', () => {
  it('nimmt das Rezept zur erkannten Plattform', async () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'instagram' ? RECIPE : null));
    const guidance = await craftGuidanceForPlatform('instagram', null);
    expect(guidance).toContain(RECIPE);
    // Und NICHT beides: ein zweiter Formatgeber im selben Prompt ist genau der
    // Fall, an dem die Zeichenbudgets auseinanderlaufen.
    expect(guidance).not.toContain('INSTAGRAM-HANDWERK');
  });

  // Die stille Fallgrube, die dieser Schnitt schliesst: `/instagram` im Composer
  // setzt `activeSkillMention`, aber der Social-Zweig baut seinen Systemtext
  // nicht in `buildSystemMessage` — er las das Feld nie. Dieselbe Wahl wirkte
  // auf einem `produktion`-Turn und fiel auf einem `social_post`-Turn weg.
  it('nimmt die ausdrücklich gewählte Textform, auch ohne erkannte Plattform', async () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'insta-berlin' ? RECIPE : null));
    expect(await craftGuidanceForPlatform(null, 'insta-berlin')).toContain(RECIPE);
  });

  it('die ausdrückliche Wahl schlägt die erkannte Plattform', async () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'facebook' ? RECIPE : null));
    expect(await craftGuidanceForPlatform('instagram', 'facebook')).toContain(RECIPE);
  });

  // Das Gitter: eine Textform aus einer anderen Familie darf einen Social-Turn
  // nicht umwidmen. Wer `/presse` gewählt hat und dann einen Post verlangt,
  // bekommt Social-Handwerk — nicht die Pressemitteilungs-Form.
  it('ignoriert eine Textform, die kein Social-Rezept ist', async () => {
    getInternalSkillPrompt.mockImplementation((m) => (m === 'presse' ? RECIPE : null));
    const guidance = await craftGuidanceForPlatform('instagram', 'presse');
    expect(guidance).not.toContain(RECIPE);
    expect(guidance).toBe(rubricForPlatform('instagram'));
    // Kein Rückfall auf `presse` über einen zweiten Weg.
    expect(getInternalSkillPrompt).not.toHaveBeenCalledWith('presse');
  });

  // Der Auffang ist kein Schmuck: eine Instanz ohne ausgerolltes
  // INTERN_CONTENT_DIR hätte sonst gar keine Formvorgabe.
  it('fällt auf die eingebaute Rubrik zurück, wenn es kein Rezept gibt', async () => {
    expect(await craftGuidanceForPlatform('linkedin', null)).toBe(rubricForPlatform('linkedin'));
    expect(await craftGuidanceForPlatform(null, null)).toBe(rubricForPlatform(null));
  });

  // Der Auffang muss die Familie der gewählten Textform mitnehmen, sonst
  // bekommt eine Instanz ohne ausgerolltes INTERN_CONTENT_DIR für
  // `/insta-berlin` ohne Plattformnennung die generische Rubrik — also
  // ausgerechnet die 800–1500-Zeichen-Ansage statt der Instagram-Form.
  it('leitet die Auffang-Rubrik aus der gewählten Textform ab', async () => {
    expect(await craftGuidanceForPlatform(null, 'insta-berlin')).toBe(
      rubricForPlatform('instagram')
    );
    expect(await craftGuidanceForPlatform(null, 'linkedin')).toBe(rubricForPlatform('linkedin'));
    // Eine Textform aus einer anderen Familie färbt den Auffang nicht ein.
    expect(await craftGuidanceForPlatform(null, 'presse')).toBe(rubricForPlatform(null));
  });

  // Und der Auffang hält dieselbe Reihenfolge wie der Rezept-Zweig darüber.
  // Kehrte er sie um, hinge die Priorität zwischen Wahl und Erkennung daran,
  // ob gerade ein Rezept ausgerollt ist — der unangenehmste Bug-Typ, weil er
  // sich zwischen Dev und Produktion unterschiedlich verhält.
  it('die ausdrückliche Wahl schlägt die erkannte Plattform auch im Auffang', async () => {
    expect(await craftGuidanceForPlatform('instagram', 'facebook')).toBe(
      rubricForPlatform('facebook')
    );
    expect(await craftGuidanceForPlatform('linkedin', 'insta-berlin')).toBe(
      rubricForPlatform('instagram')
    );
  });
});

/**
 * #2938: derselbe Vorrang wie auf den beiden anderen Wegen — der angelernte Stil
 * ERSETZT den mitgelieferten Rezepttext, er ergänzt ihn nicht.
 */
describe('craftGuidanceForPlatform — der angelernte Stil gewinnt', () => {
  it('ersetzt das Rezept zur erkannten Plattform', async () => {
    getInternalSkillPrompt.mockReturnValue(RECIPE);
    getTextFormForInjection.mockResolvedValue({ title: 'Mein Insta', styleBlock: STYLE });

    const guidance = await craftGuidanceForPlatform('instagram', null, USER);

    expect(getTextFormForInjection).toHaveBeenCalledWith(USER, 'instagram');
    expect(guidance).toContain(STYLE);
    // Nicht beides — zwei Formatgeber im selben Prompt war der Ausfall, den die
    // Rubrik-Tests oben schon beschreiben.
    expect(guidance).not.toContain(RECIPE);
    expect(guidance).not.toContain('INSTAGRAM-HANDWERK');
  });

  it('ersetzt auch die eingebaute Rubrik, wenn kein Rezept ausgerollt ist', async () => {
    getTextFormForInjection.mockResolvedValue({ title: 'Mein Insta', styleBlock: STYLE });
    const guidance = await craftGuidanceForPlatform('instagram', null, USER);
    expect(guidance).toContain(STYLE);
    expect(guidance).not.toContain('INSTAGRAM-HANDWERK');
  });

  // Nutzertext, den die Person in DIESEM Turn nicht ausgewählt hat, ist Material
  // — dieselbe Grenze, die `respondNode` und `resolveRecipe` ziehen. Und die
  // Markierung braucht die Regelhierarchie, sonst steht sie unerklärt im Prompt.
  it('fasst den Stilblock als Material ein und erklärt die Markierung', async () => {
    getTextFormForInjection.mockResolvedValue({ title: 'Mein Insta', styleBlock: STYLE });
    const guidance = await craftGuidanceForPlatform('instagram', null, USER);
    expect(guidance).toContain('<untrusted_content');
    expect(guidance).toContain('REGELHIERARCHIE');
  });

  // Die Falle aus #2938: nachgeschlagen wird unter der Mention, die die Weiche
  // ERGEBEN hat — nicht unter `platform` und nicht unter `activeSkillMention`
  // für sich. Sonst nimmt dieser Knoten das Facebook-Rezept und den
  // Instagram-Stil, und es gäbe ein drittes Verhalten statt zweier.
  it('schlägt unter der Mention nach, die die Weiche ergeben hat', async () => {
    // Ausdrückliche Wahl schlägt Erkennung: `facebook`, nicht `instagram`.
    await craftGuidanceForPlatform('instagram', 'facebook', USER);
    expect(getTextFormForInjection).toHaveBeenLastCalledWith(USER, 'facebook');

    // Die LV-Variante ist ihr eigener Schlüssel — seit #2935 wird nicht mehr
    // auf `instagram` gefaltet.
    await craftGuidanceForPlatform('instagram', 'insta-berlin', USER);
    expect(getTextFormForInjection).toHaveBeenLastCalledWith(USER, 'insta-berlin');

    // Und eine Wahl aus einer anderen Familie fällt auch hier durchs Gitter.
    await craftGuidanceForPlatform('instagram', 'presse', USER);
    expect(getTextFormForInjection).toHaveBeenLastCalledWith(USER, 'instagram');
  });

  it('fragt gar nicht nach, wenn keine userId und keine Mention da ist', async () => {
    await craftGuidanceForPlatform('instagram', null, null);
    await craftGuidanceForPlatform(null, null, USER);
    expect(getTextFormForInjection).not.toHaveBeenCalled();
  });
});
