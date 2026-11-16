/** Every door of a password-protected convention answers 403 LOCKED without a grant. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hashPassword } from '../../utils/passwordHash.js';

import type { Request } from 'express';

const m = vi.hoisted(() => ({
  viewerFromRequest: vi.fn(),
  getConventionBySlug: vi.fn(),
  getConventionById: vi.fn(),
  getSpeech: vi.fn(),
  listSpeeches: vi.fn(),
  listConventions: vi.fn(),
  hasGrant: vi.fn(),
  grant: vi.fn(),
  media: { width: 1080, height: 1920, storage_key: 'k/x.mp4' },
}));

vi.mock('../../services/parteitage/access.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/access.js')>()),
  viewerFromRequest: m.viewerFromRequest,
}));
vi.mock('../../services/parteitage/parteitageRepository.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/parteitageRepository.js')>()),
  getConventionBySlug: m.getConventionBySlug,
  getConventionById: m.getConventionById,
  getSpeech: m.getSpeech,
  listSpeeches: m.listSpeeches,
  listConventions: m.listConventions,
  hasGrant: m.hasGrant,
  grant: m.grant,
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [m.media] }) }) }),
  }),
}));

const { parteitageContractRouter } = await import('./parteitageContractRouter.js');

type Result = { status: number; body: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const call = (name: string, args: Record<string, unknown> = {}) =>
  (parteitageContractRouter as unknown as Record<string, Handler>)[name]!({
    req: { user: { id: 'u1' }, headers: {} } as unknown as Request,
    ...args,
  });

const viewer = { userId: 'u1', isAdmin: false, audience: 'de-DE' as const };
const convention = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  key: 'k',
  slug_name: 'LDK Essen',
  slug_suffix: 'abc123',
  title: 'LDK',
  short_title: 'LDK',
  organizer: 'GRÜNE NRW',
  audience: 'all',
  starts_on: '2026-01-01',
  ends_on: '2026-01-02',
  location: 'Essen',
  status: 'published',
  access_password_hash: hashPassword('geheim'),
  stats: { gesamt: { n: 1 } },
  source_links: [],
  report_media_id: 'rep',
  ...over,
});
const speech = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  convention_id: 'c1',
  speech_key: 'sk',
  slug_suffix: 'zzz999',
  day: '2026-01-01',
  day_label: 'Tag 1',
  list_place: 1,
  seat_type: 'offen',
  first_name: 'Jörg',
  last_name: 'Ölmüller',
  kv: 'Bochum',
  area: 'kreis',
  contested: false,
  elected: true,
  result_percent: '55.5',
  delivered_by: null,
  topic: 'Klima',
  duration_s: '60.5',
  word_count: 100,
  transcript: 'Hallo',
  words: [{ word: 'Hallo', start: 0, end: 1 }],
  analysis: {},
  reel_media_id: 'reel',
  poster_media_id: 'poster',
  moderation: 'ok',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.viewerFromRequest.mockResolvedValue(viewer);
  m.getConventionBySlug.mockResolvedValue(convention());
  m.getConventionById.mockResolvedValue(convention());
  m.getSpeech.mockResolvedValue(speech());
  m.listSpeeches.mockResolvedValue([speech(), speech({ id: 's2', moderation: 'hidden' })]);
  m.hasGrant.mockResolvedValue(false);
});

describe('without unlock', () => {
  it('list shows the convention as locked', async () => {
    m.listConventions.mockResolvedValue([{ id: 'c1', locked: true, speechCount: 3 }]);
    const res = await call('list');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ conventions: [{ id: 'c1', locked: true, speechCount: 3 }] });
  });

  it.each([
    ['get', { params: { slug: 'ldk-abc123' } }],
    ['getSpeech', { params: { speechId: 's1' } }],
    ['editorData', { params: { speechId: 's1' } }],
  ])('%s answers 403 LOCKED', async (name, args) => {
    const res = await call(name, args);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'LOCKED' });
    expect(JSON.stringify(res.body)).not.toContain('Hallo');
  });
});

describe('with grant', () => {
  beforeEach(() => m.hasGrant.mockResolvedValue(true));

  it('get hides moderated speeches from non-admins and builds media urls', async () => {
    const res = await call('get', { params: { slug: 'ldk-abc123' } });
    expect(res.status).toBe(200);
    const body = res.body as { speeches: { id: string; reelUrl: string }[]; reportUrl: string };
    expect(body.speeches.map((s) => s.id)).toEqual(['s1']);
    expect(body.speeches[0]!.reelUrl).toBe('/api/parteitage/media/reel');
    expect(body.reportUrl).toBe('/api/parteitage/media/rep');
    expect(res.body).toMatchObject({ locked: false, speechCount: 1 });
  });

  it('get gives admins moderation state and reason, non-admins never', async () => {
    m.listSpeeches.mockResolvedValue([
      speech(),
      speech({ id: 's2', moderation: 'hidden', hidden_reason: 'Persönlichkeitsrecht' }),
    ]);
    type Sp = { id: string; moderation?: string; hiddenReason?: string | null };
    const plain = await call('get', { params: { slug: 'ldk-abc123' } });
    const plainSp = (plain.body as { speeches: Sp[] }).speeches;
    expect(plainSp).toHaveLength(1);
    expect('moderation' in plainSp[0]!).toBe(false);
    expect('hiddenReason' in plainSp[0]!).toBe(false);

    m.viewerFromRequest.mockResolvedValue({ ...viewer, isAdmin: true });
    const admin = await call('get', { params: { slug: 'ldk-abc123' } });
    const adminSp = (admin.body as { speeches: Sp[] }).speeches;
    expect(adminSp.map((x) => [x.id, x.moderation, x.hiddenReason])).toEqual([
      ['s1', 'ok', undefined],
      ['s2', 'hidden', 'Persönlichkeitsrecht'],
    ]);
  });

  it('editorData hands off stream url, file name and words', async () => {
    const res = await call('editorData', { params: { speechId: 's1' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      speechId: 's1',
      streamUrl: '/api/parteitage/media/reel',
      fileName: 'Ölmüller-Jörg_KV-Bochum.mp4',
      width: 1080,
      height: 1920,
      durationS: 60.5,
    });
  });

  it('a hidden speech is 404 for non-admins', async () => {
    m.getSpeech.mockResolvedValue(speech({ moderation: 'hidden' }));
    expect((await call('getSpeech', { params: { speechId: 's1' } })).status).toBe(404);
  });
});

describe('invisible convention', () => {
  it('draft is 404, never 403', async () => {
    m.getConventionBySlug.mockResolvedValue(convention({ status: 'draft' }));
    expect((await call('get', { params: { slug: 'x' } })).status).toBe(404);
  });
});

describe('unlock', () => {
  it('wrong password → 401, no grant', async () => {
    const res = await call('unlock', { params: { slug: 'x' }, body: { password: 'falsch' } });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: 'WRONG_PASSWORD' });
    expect(m.grant).not.toHaveBeenCalled();
  });

  it('right password → 200 and grant', async () => {
    const res = await call('unlock', { params: { slug: 'x' }, body: { password: 'geheim' } });
    expect(res).toEqual({ status: 200, body: { success: true } });
    expect(m.grant).toHaveBeenCalledWith('u1', 'c1');
  });

  it('convention without password → 200, no grant row', async () => {
    m.getConventionBySlug.mockResolvedValue(convention({ access_password_hash: null }));
    const res = await call('unlock', { params: { slug: 'x' }, body: { password: 'egal' } });
    expect(res).toEqual({ status: 200, body: { success: true } });
    expect(m.grant).not.toHaveBeenCalled();
  });

  it('unknown or invisible convention → 404', async () => {
    m.getConventionBySlug.mockResolvedValue(convention({ status: 'draft' }));
    const res = await call('unlock', { params: { slug: 'x' }, body: { password: 'geheim' } });
    expect(res.status).toBe(404);
    expect(m.grant).not.toHaveBeenCalled();
  });
});
