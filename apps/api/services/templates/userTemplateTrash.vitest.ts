/**
 * Vorlagen im Papierkorb. Trash touches only `deleted_at` — the Qdrant point
 * and a Grünerator-Vorlage's snapshot canvas stay; the purge removes the row
 * first and only then, best-effort, the point, the snapshot and the likes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const effects: string[] = [];
const params: unknown[][] = [];
let deleted: unknown[] = [];
const reportBackgroundError = vi.fn();
const deleteTemplateVector = vi.fn(async (id: string) => {
  effects.push(`qdrant ${id}`);
});
const deleteCanvas = vi.fn(async (id: string, _owner: string) => {
  effects.push(`trash canvas ${id}`);
  return { kind: 'ok' as 'ok' | 'not_found' | 'forbidden' };
});
const deleteLikesForEntity = vi.fn(async (type: string, id: string) => {
  effects.push(`likes ${type} ${id}`);
});
const purgeCollaborativeDocument = vi.fn(async (_q: unknown, id: string) => {
  effects.push(`purge canvas ${id}`);
  return true;
});

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({
    query: vi.fn(async (sql: string, p: unknown[]) => {
      effects.push(sql.replace(/\s+/g, ' ').trim().split(' WHERE ')[0]);
      params.push(p);
      return sql.startsWith('DELETE') ? deleted : [{ id: 'kept' }];
    }),
  }),
}));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));
vi.mock('./templateEnrichment.js', () => ({ deleteTemplateVector }));
vi.mock('../canvas/canvasRepository.js', () => ({ deleteCanvas }));
vi.mock('../entityLikes/EntityLikesService.js', () => ({ deleteLikesForEntity }));
vi.mock('../docs/CollaborativeDocumentService.js', () => ({ purgeCollaborativeDocument }));

const { purgeUserTemplate, trashUserTemplates } = await import('./userTemplateTrash.js');

const USER = '11111111-1111-4111-8111-111111111111';
const ID = '33333333-3333-4333-8333-333333333333';
const CANVAS = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  effects.length = 0;
  params.length = 0;
  deleted = [];
  reportBackgroundError.mockClear();
  deleteTemplateVector.mockClear();
  deleteCanvas.mockClear();
});

describe('Vorlage Papierkorb', () => {
  it('trash only sets deleted_at on own Vorlagen — no vector, no snapshot touched', async () => {
    expect(await trashUserTemplates(USER, [ID, 'kaputt'])).toEqual(['kept']);
    expect(effects).toEqual(['UPDATE user_templates SET deleted_at = now()']);
    expect(params[0]).toEqual([USER, [ID]]);
    expect(deleteTemplateVector).not.toHaveBeenCalled();
    expect(deleteCanvas).not.toHaveBeenCalled();
  });

  it('purge: conditional DELETE, then the vector, the snapshot canvas, the likes', async () => {
    deleted = [
      { id: ID, user_id: USER, template_type: 'gruenerator', content_data: { canvasId: CANVAS } },
    ];
    const cutoff = new Date('2026-08-30T00:00:00Z');
    expect(await purgeUserTemplate(ID, cutoff)).toBe(true);
    expect(effects).toEqual([
      'DELETE FROM user_templates',
      `qdrant ${ID}`,
      `trash canvas ${CANVAS}`,
      `purge canvas ${CANVAS}`,
      `likes template ${ID}`,
    ]);
    expect(params[0]).toEqual([ID, cutoff]);
    expect(deleteCanvas).toHaveBeenCalledWith(CANVAS, USER);
  });

  it('a Canva-link Vorlage has no snapshot to purge', async () => {
    deleted = [{ id: ID, user_id: USER, template_type: 'canva', content_data: {} }];
    expect(await purgeUserTemplate(ID, null)).toBe(true);
    expect(effects).toEqual(['DELETE FROM user_templates', `qdrant ${ID}`, `likes template ${ID}`]);
  });

  it('touches no side store when the row was restored meanwhile (0 rows)', async () => {
    expect(await purgeUserTemplate(ID, null)).toBe(false);
    expect(effects).toEqual(['DELETE FROM user_templates']);
  });

  it('reports failing side stores and still purges the rest', async () => {
    deleted = [
      { id: ID, user_id: USER, template_type: 'gruenerator', content_data: { canvasId: CANVAS } },
    ];
    deleteTemplateVector.mockRejectedValueOnce(new Error('qdrant down'));
    deleteCanvas.mockResolvedValueOnce({ kind: 'forbidden' });

    expect(await purgeUserTemplate(ID, null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledTimes(2);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', kind: 'user_template', store: 'qdrant' })
    );
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ kind: 'user_template', store: 'snapshot_canvas' })
    );
    expect(effects).not.toContain(`purge canvas ${CANVAS}`);
  });
});
