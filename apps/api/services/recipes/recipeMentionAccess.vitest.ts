/**
 * Darf diese Person dieses Rezept an ihren Agenten binden?
 *
 * Geprüft wird die Antwort, nicht der Weg: dass die Katalog-Gatter (Audience,
 * Landesverbands-Rolle, Instanz) überhaupt greifen, steht in
 * `recipeCatalog.vitest.ts` — hier zählt, dass sie AUCH über diese Tür gelten
 * und dass die gepinnte Zeile ihren eigenen Sichtbarkeitstest bekommt.
 *
 * Run with: cd apps/api && npx vitest run services/recipes/recipeMentionAccess.vitest.ts
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const buildRecipeCatalog = vi.fn();
const getTextFormForInjectionById = vi.fn();

vi.mock('../../routes/chat/agents/recipeCatalog.js', () => ({
  buildRecipeCatalog: (...a: unknown[]) => buildRecipeCatalog(...a) as unknown,
}));
vi.mock('../user/textFormRepository.js', () => ({
  getTextFormForInjectionById: (...a: unknown[]) => getTextFormForInjectionById(...a) as unknown,
}));

const { isRecipeUsableForAgent } = await import('./recipeMentionAccess.js');

const CATALOG = [
  { mention: 'presse', title: 'Pressemitteilung', description: 'PM', source: 'system' },
  { mention: 'omveinladungen', title: 'Einladungen', description: 'Eigen', source: 'user' },
  { mention: 'kiez-briefe', title: 'Kiez-Briefe', description: 'Öffentlich', source: 'user' },
];

const BASE = { userId: 'u1', userLocale: 'de-DE', roles: null };

beforeEach(() => {
  vi.clearAllMocks();
  buildRecipeCatalog.mockResolvedValue(CATALOG);
  getTextFormForInjectionById.mockResolvedValue(null);
});

describe('isRecipeUsableForAgent — Mention', () => {
  it('nimmt ein sichtbares Systemrezept an', async () => {
    expect(await isRecipeUsableForAgent({ ...BASE, mention: 'presse' })).toBe(true);
    expect(buildRecipeCatalog).toHaveBeenCalledWith({
      userLocale: 'de-DE',
      userId: 'u1',
      roles: null,
    });
  });

  it('nimmt eine eigene Textform an', async () => {
    expect(await isRecipeUsableForAgent({ ...BASE, mention: 'omveinladungen' })).toBe(true);
  });

  it('nimmt ein öffentliches Rezept aus dem Katalog an', async () => {
    expect(await isRecipeUsableForAgent({ ...BASE, mention: 'kiez-briefe' })).toBe(true);
  });

  // Der Katalog filtert LV-Rezepte nach Rolle; wer die Rolle nicht hat, sieht
  // die Mention im Menü nicht und darf sie auch nicht binden.
  it('weist ein fremdes Landesverbands-Rezept ab', async () => {
    expect(await isRecipeUsableForAgent({ ...BASE, mention: 'presse-bayern-partei' })).toBe(false);
  });

  it('normalisiert die getippte Form (@, /, Grossschreibung)', async () => {
    expect(await isRecipeUsableForAgent({ ...BASE, mention: '@Presse' })).toBe(true);
    expect(await isRecipeUsableForAgent({ ...BASE, mention: '/presse ' })).toBe(true);
  });

  it('führt eine zurückgezogene Mention auf ihre Nachfolgerin', async () => {
    buildRecipeCatalog.mockResolvedValue([
      { mention: 'presse-bayern-partei', title: 'PM Bayern', description: '', source: 'system' },
    ]);
    expect(await isRecipeUsableForAgent({ ...BASE, mention: 'presse-bayern' })).toBe(true);
  });

  it('ohne Mention und ohne id gibt es nichts zu prüfen', async () => {
    expect(await isRecipeUsableForAgent({ ...BASE })).toBe(false);
    expect(buildRecipeCatalog).not.toHaveBeenCalled();
  });
});

describe('isRecipeUsableForAgent — id', () => {
  it('nimmt eine für die Person sichtbare Zeile an', async () => {
    getTextFormForInjectionById.mockResolvedValue({
      id: 'r1',
      kind: 'custom',
      textType: null,
      title: 'Eigen',
      styleBlock: 'Kurz.',
      access: 'group',
    });
    expect(await isRecipeUsableForAgent({ ...BASE, recipeId: 'r1' })).toBe(true);
    expect(getTextFormForInjectionById).toHaveBeenCalledWith('r1', 'u1');
  });

  it('weist eine unsichtbare Zeile ab', async () => {
    expect(await isRecipeUsableForAgent({ ...BASE, recipeId: 'r1' })).toBe(false);
  });

  // Die id ist die gepinnte Wahl und gewinnt auch hier über die Mention —
  // dieselbe Reihenfolge wie in `resolveRecipeBody`.
  it('prüft die id, wenn beide mitkommen', async () => {
    getTextFormForInjectionById.mockResolvedValue({
      id: 'r1',
      kind: 'custom',
      textType: null,
      title: 'Eigen',
      styleBlock: 'Kurz.',
      access: 'own',
    });
    expect(
      await isRecipeUsableForAgent({ ...BASE, recipeId: 'r1', mention: 'presse-bayern-partei' })
    ).toBe(true);
    expect(buildRecipeCatalog).not.toHaveBeenCalled();
  });
});
