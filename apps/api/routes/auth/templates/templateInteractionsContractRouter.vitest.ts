/**
 * Likes/Merken prüfen, dass es die Vorlage gibt (404, nichts geschrieben);
 * Entfernen bleibt für veraltete ids möglich. Dazu Engagement und „Beliebt".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const m = vi.hoisted(() => ({
  templateExistsFor: vi.fn(),
  likeEntity: vi.fn(),
  unlikeEntity: vi.fn(),
  favoriteEntity: vi.fn(),
  unfavoriteEntity: vi.fn(),
  getTemplateEngagement: vi.fn(),
  listPopularVorlagen: vi.fn(),
  getFavoritedEntityIdsForUser: vi.fn(),
  buildGalleryTemplates: vi.fn(),
}));

vi.mock('../../../services/templateInteractions/templateTarget.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  templateExistsFor: m.templateExistsFor,
}));
vi.mock('../../../services/entityLikes/EntityLikesService.js', () => ({
  likeEntity: m.likeEntity,
  unlikeEntity: m.unlikeEntity,
  getLikedEntityIdsForUser: vi.fn(),
}));
vi.mock('../../../services/entityFavorites/EntityFavoritesService.js', () => ({
  favoriteEntity: m.favoriteEntity,
  unfavoriteEntity: m.unfavoriteEntity,
  getFavoritedEntityIdsForUser: m.getFavoritedEntityIdsForUser,
}));
vi.mock('../../../services/templateInteractions/templateEngagement.js', () => ({
  getTemplateEngagement: m.getTemplateEngagement,
}));
vi.mock('../../../services/templateInteractions/popularVorlagen.js', () => ({
  listPopularVorlagen: m.listPopularVorlagen,
}));
vi.mock('../../../services/notifications/NotificationService.js', () => ({
  createNotification: vi.fn(),
}));
vi.mock('../../../services/user/ProfileService.js', () => ({ getProfileService: vi.fn() }));
vi.mock('../../../database/services/PostgresService.js', () => ({ getPostgresInstance: vi.fn() }));
vi.mock('./templateGallery.js', () => ({
  attachLikeCounts: vi.fn(),
  buildGalleryTemplates: m.buildGalleryTemplates,
}));

const { templateInteractionsContractRouter } =
  await import('./templateInteractionsContractRouter.js');

type Result = { status: number; body: unknown };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const call = (name: string, args: Record<string, unknown> = {}) =>
  (templateInteractionsContractRouter as unknown as Record<string, Handler>)[name]!({
    req: { user: { id: 'viewer' }, headers: {} } as unknown as Request,
    ...args,
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.likeEntity.mockResolvedValue({ liked: true, count: 1, createdNew: false });
  m.unlikeEntity.mockResolvedValue({ liked: false, count: 0 });
});

describe.each([
  ['likeTemplate', m.likeEntity],
  ['favoriteTemplate', m.favoriteEntity],
] as const)('%s', (name, write) => {
  it('writes for an existing catalogue Vorlage', async () => {
    m.templateExistsFor.mockResolvedValue(true);
    const res = await call(name, { params: { id: 'alt-dreizeilen' } });
    expect(res.status).toBe(200);
    expect(m.templateExistsFor).toHaveBeenCalledWith('viewer', 'alt-dreizeilen');
    expect(write).toHaveBeenCalledWith({
      userId: 'viewer',
      entityType: 'template',
      entityId: 'alt-dreizeilen',
    });
  });

  it('404 for an unknown id, nothing written', async () => {
    m.templateExistsFor.mockResolvedValue(false);
    const res = await call(name, { params: { id: 'gibt-es-nicht' } });
    expect(res).toEqual({
      status: 404,
      body: { success: false, message: 'Vorlage nicht gefunden.' },
    });
    expect(write).not.toHaveBeenCalled();
  });
});

it('unlikeTemplate stays possible for an id that no longer exists', async () => {
  const res = await call('unlikeTemplate', { params: { id: 'entfernt' } });
  expect(res.status).toBe(200);
  expect(m.templateExistsFor).not.toHaveBeenCalled();
});

it('getTemplateEngagement splits, trims and de-blanks the id list', async () => {
  m.getTemplateEngagement.mockResolvedValue([]);
  const res = await call('getTemplateEngagement', { query: { ids: 'a, b,,c' } });
  expect(res).toEqual({ status: 200, body: { success: true, items: [] } });
  expect(m.getTemplateEngagement).toHaveBeenCalledWith(['a', 'b', 'c']);
});

it('listPopularVorlagen passes the viewer country and the limit', async () => {
  m.listPopularVorlagen.mockResolvedValue([]);
  const res = await call('listPopularVorlagen', {
    req: { user: { id: 'viewer', locale: 'de-AT' }, headers: {} },
    query: { limit: 4 },
  });
  expect(res.status).toBe(200);
  expect(m.listPopularVorlagen).toHaveBeenCalledWith(expect.any(String), 4);
});

it('listMyFavoriteTemplates resolves every bookmarked user template, not a capped page', async () => {
  const ids = Array.from(
    { length: 120 },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`
  );
  m.getFavoritedEntityIdsForUser.mockResolvedValue([...ids, 'alt-dreizeilen']);
  m.buildGalleryTemplates.mockResolvedValue([]);
  const res = await call('listMyFavoriteTemplates');
  expect(res.status).toBe(200);
  expect(m.buildGalleryTemplates).toHaveBeenCalledWith({ ids, limit: 120 });
});
