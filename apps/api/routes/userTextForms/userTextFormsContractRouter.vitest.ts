/**
 * Der Vertrag der Rezept-Routen (`/api/text-forms`), ohne HTTP-Schicht und ohne
 * Datenbank: Anlegen, reservierte Namen, fremde Rezepte, Löschen in den
 * Papierkorb und die Mention-Liste. Das Repository ist gemockt; was die Zeilen
 * wirklich tun (`deleted_at`, Filter), prüft `textFormRepository.recipes.db.vitest.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  deleteTextForm: vi.fn(),
  getTextFormSharing: vi.fn(),
  listMentionableTextForms: vi.fn(),
  listPublicTextForms: vi.fn(),
  listTextForms: vi.fn(),
  shareTextFormWithGroup: vi.fn(),
  unshareTextFormFromGroup: vi.fn(),
  updateTextFormSharing: vi.fn(),
  upsertTextForm: vi.fn(),
}));

vi.mock('../../services/user/textFormRepository.js', () => repo);
vi.mock('../../services/roles/userRoles.js', () => ({ loadUserRoles: vi.fn(async () => []) }));
vi.mock('../../services/user/textFormAnalysisService.js', () => ({
  analyzeTextForm: vi.fn(),
  textFormLabel: vi.fn(),
}));
vi.mock('../../services/user/textFormDraftService.js', () => ({ draftRecipeSpec: vi.fn() }));

const { userTextFormsContractRouter: router } = await import('./userTextFormsContractRouter.js');

const req = { user: { id: 'user-1', locale: 'de-DE' }, headers: {} } as never;

const body = { title: 'OV-Einladung', examples: [], styleBlock: 'Schreibe kurz.' };
const save = (mention: string, over: Record<string, unknown> = {}) =>
  router.save({ req, params: { mention }, body: { ...body, ...over } } as never);

beforeEach(() => {
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.listTextForms.mockResolvedValue([]);
});

describe('userTextFormsContract.save', () => {
  it('creates a recipe under a free mention', async () => {
    repo.upsertTextForm.mockImplementation(async (_userId: string, input: { mention: string }) => ({
      id: 'r1',
      mention: input.mention,
    }));

    const res = await save('ov-einladung', { category: 'social' });

    expect(res.status).toBe(200);
    expect(repo.upsertTextForm).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ kind: 'custom', mention: 'ov-einladung', category: 'social' })
    );
  });

  it.each(['neu', 'bearbeiten'])('rejects the reserved mention "%s" with 400', async (mention) => {
    const res = await save(mention);

    expect(res.status).toBe(400);
    expect(repo.upsertTextForm).not.toHaveBeenCalled();
  });
});

describe('userTextFormsContract.save: reserved names on update', () => {
  it('still saves an existing own row named "neu"', async () => {
    repo.listTextForms.mockResolvedValue([{ mention: 'neu', sharedFromGroup: null }]);
    repo.upsertTextForm.mockResolvedValue({ id: 'r1', mention: 'neu' });

    const res = await save('neu');

    expect(res.status).toBe(200);
  });
});

describe('userTextFormsContract.remove', () => {
  it("moves the caller's recipe to the Papierkorb through the owner-scoped delete", async () => {
    repo.deleteTextForm.mockResolvedValue(true);

    const res = await router.remove({ req, params: { mention: 'ov-einladung' } } as never);

    expect(res).toEqual({ status: 200, body: { success: true } });
    expect(repo.deleteTextForm).toHaveBeenCalledWith('user-1', 'ov-einladung');
  });

  it('answers 404 for a recipe the caller does not own', async () => {
    repo.deleteTextForm.mockResolvedValue(false);

    const res = await router.remove({ req, params: { mention: 'fremdes-rezept' } } as never);

    expect(res.status).toBe(404);
  });
});

describe('a recipe of someone else', () => {
  it('is not editable: the share settings answer 404', async () => {
    repo.getTextFormSharing.mockResolvedValue(null);

    const res = await router.setShareMode({
      req,
      params: { mention: 'fremdes-rezept' },
      body: { mode: 'authenticated' },
    } as never);

    expect(res.status).toBe(404);
    expect(repo.updateTextFormSharing).not.toHaveBeenCalled();
  });
});

describe('userTextFormsContract.listMentionable', () => {
  it("asks the repository for the caller, in the caller's country", async () => {
    repo.listMentionableTextForms.mockResolvedValue([{ id: 'r1', mention: 'ov-einladung' }]);

    const res = await router.listMentionable({ req } as never);

    expect(res.status).toBe(200);
    expect(repo.listMentionableTextForms).toHaveBeenCalledWith('user-1', undefined, {
      viewerLocale: 'de-DE',
    });
  });
});

describe('share', () => {
  const share = (groupId: string) =>
    router.share({
      req,
      params: { mention: 'ov-einladung' },
      body: { group_id: groupId },
    } as never);

  it('answers 200 with the list once the project is in it', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue([{ groupId: 'g1', groupName: 'KV' }]);
    expect(await share('g1')).toMatchObject({
      status: 200,
      body: { sharedWithGroups: [{ groupId: 'g1' }] },
    });
  });

  // Vorher kam hier still 200 mit der alten Liste zurück: der Dialog zeigte
  // nichts, und die Freigabe war trotzdem nicht da.
  it('answers 403 when the repository inserted nothing for that project', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue([{ groupId: 'other', groupName: 'LAG' }]);
    expect(await share('g1')).toMatchObject({
      status: 403,
      body: { success: false, message: 'Mit diesem Projekt darfst du nicht teilen.' },
    });
  });

  it('answers 404 for a recipe that is not the caller’s own', async () => {
    repo.shareTextFormWithGroup.mockResolvedValue(null);
    expect(await share('g1')).toMatchObject({ status: 404 });
  });
});
