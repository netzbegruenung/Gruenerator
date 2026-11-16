import { PassThrough, Readable } from 'node:stream';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

const m = vi.hoisted(() => ({
  viewerFromRequest: vi.fn(),
  findOwnerOfMedia: vi.fn(),
  hasGrant: vi.fn(),
  getSpeech: vi.fn(),
  getConventionById: vi.fn(),
  getMedia: vi.fn(),
  stat: vi.fn(),
  openRead: vi.fn(),
}));

vi.mock('../../services/parteitage/access.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/access.js')>()),
  viewerFromRequest: m.viewerFromRequest,
}));
vi.mock('../../services/parteitage/parteitageRepository.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/parteitageRepository.js')>()),
  findOwnerOfMedia: m.findOwnerOfMedia,
  hasGrant: m.hasGrant,
  getSpeech: m.getSpeech,
  getConventionById: m.getConventionById,
}));
vi.mock('../../services/parteitage/parteitageViews.js', async (importActual) => ({
  ...(await importActual<typeof import('../../services/parteitage/parteitageViews.js')>()),
  getMedia: m.getMedia,
}));
vi.mock('../../services/systemMedia/storage.js', () => ({
  getSystemMediaStorage: () => ({ stat: m.stat, openRead: m.openRead }),
}));

const { parteitageMediaHandler, parteitageCaptionsHandler } =
  await import('./parteitageMediaRouter.js');

const convention = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  short_title: 'LDK Essen',
  status: 'published',
  audience: 'all',
  access_password_hash: null,
  ...over,
});
const speech = (over: Record<string, unknown> = {}) => ({
  first_name: 'Jörg',
  last_name: 'Ölmüller',
  kv: 'Bochum&Wattenscheid',
  moderation: 'ok',
  ...over,
});

function fakeRes() {
  const res = new PassThrough() as PassThrough & Record<string, unknown>;
  const headers: Record<string, unknown> = {};
  res.headersSent = false;
  res.statusCode = 200;
  res.setHeader = vi.fn((k: string, v: unknown) => {
    headers[k] = v;
  });
  res.writeHead = vi.fn((status: number, h: Record<string, unknown>) => {
    res.statusCode = status;
    Object.assign(headers, h);
  });
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn();
  return { res: res as unknown as Response, headers, raw: res };
}

const run = async (query: Record<string, string> = {}) => {
  const out = fakeRes();
  await parteitageMediaHandler(
    { params: { mediaId: 'm1' }, query, headers: {} } as unknown as Request,
    out.res
  );
  return out;
};

beforeEach(() => {
  vi.clearAllMocks();
  m.viewerFromRequest.mockResolvedValue({ userId: 'u', isAdmin: false, audience: 'de-DE' });
  m.findOwnerOfMedia.mockResolvedValue({ convention: convention(), speech: speech() });
  m.hasGrant.mockResolvedValue(false);
  m.getMedia.mockResolvedValue({ storage_key: 'k/abc.mp4', mime_type: 'video/mp4' });
  m.stat.mockResolvedValue({ size: 3 });
  m.openRead.mockReturnValue(Readable.from([Buffer.from('abc')]));
});

describe('media route', () => {
  it('returns 404 when storage.stat is null', async () => {
    m.stat.mockResolvedValue(null);
    const { raw } = await run();
    expect(raw.statusCode).toBe(404);
    expect(m.openRead).not.toHaveBeenCalled();
  });

  it('returns 404 for unknown media', async () => {
    m.findOwnerOfMedia.mockResolvedValue(null);
    expect((await run()).raw.statusCode).toBe(404);
  });

  it('locked convention answers 403 for reel, poster and report alike', async () => {
    const locked = convention({ access_password_hash: 'a:b' });
    for (const speechOrNull of [speech(), null]) {
      m.findOwnerOfMedia.mockResolvedValue({ convention: locked, speech: speechOrNull });
      const { raw } = await run();
      expect(raw.statusCode).toBe(403);
    }
    expect(m.openRead).not.toHaveBeenCalled();
  });

  it("a hidden speech's media is 404 for non-admins", async () => {
    m.findOwnerOfMedia.mockResolvedValue({
      convention: convention(),
      speech: speech({ moderation: 'hidden' }),
    });
    expect((await run()).raw.statusCode).toBe(404);
  });

  it('streams with content type and private cache', async () => {
    const { headers, raw } = await run();
    expect(raw.statusCode).toBe(200);
    expect(headers['Content-Type']).toBe('video/mp4');
    expect(headers['Cache-Control']).toBe('private, max-age=3600');
    expect(headers['Content-Disposition']).toBeUndefined();
  });

  it('media download sets RFC 5987 filename', async () => {
    const { headers } = await run({ download: '1' });
    const cd = String(headers['Content-Disposition']);
    expect(cd).toContain('attachment');
    expect(cd).toContain(
      `filename*=UTF-8''${encodeURIComponent('Ölmüller-Jörg_KV-Bochum&Wattenscheid.mp4')}`
    );
  });

  it('report download uses the convention short title', async () => {
    m.findOwnerOfMedia.mockResolvedValue({ convention: convention(), speech: null });
    m.getMedia.mockResolvedValue({ storage_key: 'k/r.pdf', mime_type: 'application/pdf' });
    const { headers } = await run({ download: '1' });
    expect(String(headers['Content-Disposition'])).toContain('LDK-Essen.pdf');
  });
});

describe('captions route', () => {
  const runCaptions = async () => {
    const out = fakeRes();
    const send = vi.fn();
    (out.res as unknown as Record<string, unknown>).type = vi.fn(() => ({ send }));
    await parteitageCaptionsHandler(
      { params: { speechId: 's1' }, headers: {} } as unknown as Request,
      out.res
    );
    return { ...out, send };
  };

  beforeEach(() => {
    m.getSpeech.mockResolvedValue(
      speech({ convention_id: 'c1', words: [{ word: 'Liebe', start: 0, end: 0.4 }] })
    );
    m.getConventionById.mockResolvedValue(convention());
  });

  it('serves WebVTT for an accessible speech', async () => {
    const { raw, send } = await runCaptions();
    expect(raw.statusCode).toBe(200);
    expect(send).toHaveBeenCalledWith(expect.stringMatching(/^WEBVTT\n\n00:00:00\.000 --> /));
  });

  it('locked convention → 403', async () => {
    m.getConventionById.mockResolvedValue(convention({ access_password_hash: 'a:b' }));
    const { raw, send } = await runCaptions();
    expect(raw.statusCode).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it('empty words → 404', async () => {
    m.getSpeech.mockResolvedValue(speech({ convention_id: 'c1', words: [] }));
    const { raw, send } = await runCaptions();
    expect(raw.statusCode).toBe(404);
    expect(send).not.toHaveBeenCalled();
  });
});
