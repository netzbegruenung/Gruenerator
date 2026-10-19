/**
 * The notebook entry of the moderation registry: notebooks live in Qdrant, so
 * `hideIf` asks Postgres whether the report threshold holds and only then flips
 * the payload — and never for a notebook nobody else can reach.
 */
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const helper = vi.hoisted(() => ({
  getNotebookCollection: vi.fn(),
  getTrashedNotebookCollection: vi.fn(),
  setNotebookModeration: vi.fn(),
}));
vi.mock('../../database/services/NotebookQdrantHelper.js', () => ({
  NotebookQdrantHelper: function NotebookQdrantHelper() {
    return helper;
  },
}));

const { MODERATION_TARGETS } = await import('./moderationTargets.js');
const target = MODERATION_TARGETS.notebook;

const ID = '00000000-0000-4000-8000-0000000000aa';
const notebook = (over: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: 'owner',
  name: 'Klima',
  share_mode: 'authenticated',
  moderation: 'ok',
  slug_suffix: 'Ab3xK9',
  ...over,
});
const db = (hit: boolean) => ({ execute: vi.fn(async () => ({ rows: [{ hit }] })) });

beforeEach(() => {
  vi.clearAllMocks();
  helper.getNotebookCollection.mockResolvedValue(notebook());
  helper.setNotebookModeration.mockResolvedValue('hidden');
});

describe('notebook moderation target', () => {
  it('is reportable while every signed-in user can reach it', async () => {
    expect(await target.loadReportable(ID)).toEqual({ ownerId: 'owner' });
    helper.getNotebookCollection.mockResolvedValue(notebook({ share_mode: 'private' }));
    expect(await target.loadReportable(ID)).toBeNull();
    helper.getNotebookCollection.mockResolvedValue(notebook({ moderation: 'hidden' }));
    expect(await target.loadReportable(ID)).toBeNull();
    helper.getNotebookCollection.mockResolvedValue(notebook({ user_id: 'SYSTEM' }));
    expect(await target.loadReportable(ID)).toBeNull();
  });

  it('hides only once the threshold holds, and only from `ok`', async () => {
    const below = db(false);
    expect(await target.hideIf(below as never, ID, sql`false`)).toBe(false);
    expect(helper.setNotebookModeration).not.toHaveBeenCalled();

    const reached = db(true);
    expect(await target.hideIf(reached as never, ID, sql`true`)).toBe(true);
    expect(reached.execute).toHaveBeenCalledTimes(1);
    expect(helper.setNotebookModeration).toHaveBeenCalledWith(ID, 'hidden', 'ok');
  });

  it('does not ask Postgres for a notebook that is not reportable', async () => {
    helper.getNotebookCollection.mockResolvedValue(null);
    const reached = db(true);
    expect(await target.hideIf(reached as never, ID, sql`true`)).toBe(false);
    expect(reached.execute).not.toHaveBeenCalled();
  });

  it('previews trashed notebooks too, with their page', async () => {
    helper.getTrashedNotebookCollection.mockResolvedValue(notebook());
    const previews = await target.previews([ID]);
    expect(previews.get(ID)).toMatchObject({
      title: 'Klima',
      href: '/notebooks/klima-Ab3xK9',
      ownerId: 'owner',
      trashed: true,
    });
    expect(helper.getNotebookCollection).toHaveBeenCalledWith(ID, { includeTrashed: true });
  });
});
