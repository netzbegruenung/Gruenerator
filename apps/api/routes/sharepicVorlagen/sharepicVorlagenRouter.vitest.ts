/**
 * Die Katalogliste zeigt das eigene Land; `land` wechselt es nur für
 * Instanz-Admins, für alle anderen bleibt die Antwort dieselbe.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  isInstanceAdmin: vi.fn(),
  getSharepicVorlage: vi.fn(),
  sharepicVorlageThumbFile: vi.fn(),
  listSharepicVorlagen: vi.fn((locale: string) => [{ id: `vorlage-${locale}` }]),
  listSharepicSeiten: vi.fn((locale: string) => [{ id: `seite-${locale}` }]),
  getSharepicSeite: vi.fn(),
  sharepicSeiteThumbFile: vi.fn(),
  listCanvasVorlagen: vi.fn((locale: string) => [{ id: `canvas-${locale}` }]),
  getCanvasVorlage: vi.fn(),
  canvasVorlageThumbFile: vi.fn(),
}));

vi.mock('../../utils/adminAuthz.js', () => ({ isInstanceAdmin: m.isInstanceAdmin }));
vi.mock('../../services/sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: m.listSharepicVorlagen,
  getSharepicVorlage: m.getSharepicVorlage,
  sharepicVorlageThumbFile: m.sharepicVorlageThumbFile,
  listSharepicSeiten: m.listSharepicSeiten,
  getSharepicSeite: m.getSharepicSeite,
  sharepicSeiteThumbFile: m.sharepicSeiteThumbFile,
  listCanvasVorlagen: m.listCanvasVorlagen,
  getCanvasVorlage: m.getCanvasVorlage,
  canvasVorlageThumbFile: m.canvasVorlageThumbFile,
}));

const { sharepicVorlagenContractRouter, mountSharepicVorlagenRouter } =
  await import('./sharepicVorlagenRouter.js');

type Result = { status: number; body: { vorlagen: Array<{ id: string }> } };
const list = (land?: 'de-DE' | 'de-AT') =>
  (sharepicVorlagenContractRouter.list as unknown as (args: unknown) => Promise<Result>)({
    req: { user: { id: 'viewer', locale: 'de-DE' }, headers: {} },
    query: land ? { land } : {},
  });

beforeEach(() => m.isInstanceAdmin.mockReset());

it('lists the viewer country by default', async () => {
  const res = await list();
  expect(res.body.vorlagen).toEqual([{ id: 'vorlage-de-DE' }]);
});

it('lists the other country for an instance admin', async () => {
  m.isInstanceAdmin.mockResolvedValue(true);
  const res = await list('de-AT');
  expect(res.body.vorlagen).toEqual([{ id: 'vorlage-de-AT' }]);
});

it('ignores `land` for a non-admin', async () => {
  m.isInstanceAdmin.mockResolvedValue(false);
  const res = await list('de-AT');
  expect(res.status).toBe(200);
  expect(res.body.vorlagen).toEqual([{ id: 'vorlage-de-DE' }]);
});

const thumbFile = path.join(mkdtempSync(path.join(tmpdir(), 'thumb-')), 'de-rad.webp');
writeFileSync(thumbFile, 'bild');

function requestThumb(query: Record<string, string>, route = '/api/sharepic-vorlagen/:id/thumb') {
  m.getSharepicVorlage.mockReturnValue({ id: 'de-rad', thumbVersion: 'abc123abc123' });
  m.sharepicVorlageThumbFile.mockReturnValue(thumbFile);
  m.getSharepicSeite.mockReturnValue({ id: 'de-rad', thumbVersion: 'abc123abc123' });
  m.sharepicSeiteThumbFile.mockReturnValue(thumbFile);
  m.getCanvasVorlage.mockReturnValue({ id: 'de-rad', thumbVersion: 'abc123abc123' });
  m.canvasVorlageThumbFile.mockReturnValue(thumbFile);
  let handler: (req: unknown, res: unknown) => void = () => {};
  mountSharepicVorlagenRouter({
    get: (path: string, h: typeof handler) => {
      if (path === route) handler = h;
    },
    use: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  } as never);
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (k: string, v: string) => (headers[k] = v),
    type: () => res,
    sendFile: vi.fn(),
    status: () => res,
    json: vi.fn(),
  };
  handler({ params: { id: 'de-rad' }, query }, res);
  return headers['Cache-Control'];
}

it('serves a thumbnail with the current version as immutable', () => {
  expect(requestThumb({ v: 'abc123abc123' })).toBe('private, max-age=31536000, immutable');
});

it('makes a thumbnail with a stale or missing version revalidate', () => {
  expect(requestThumb({ v: 'old' })).toBe('private, no-cache');
  expect(requestThumb({})).toBe('private, no-cache');
});

it('serves a Seite preview by format, immutable with the current version', () => {
  const route = '/api/sharepic-vorlagen/seiten/:id/thumb';
  expect(requestThumb({ format: 'post-portrait', v: 'abc123abc123' }, route)).toBe(
    'private, max-age=31536000, immutable'
  );
  expect(m.sharepicSeiteThumbFile).toHaveBeenLastCalledWith('de-rad', 'post-portrait');
  expect(requestThumb({ format: 'post-portrait' }, route)).toBe('private, no-cache');
});

it('lists the Seiten of the viewer country, the other one only for an admin', async () => {
  const seiten = (land?: 'de-AT') =>
    (
      sharepicVorlagenContractRouter.seiten as unknown as (
        args: unknown
      ) => Promise<{ body: { seiten: Array<{ id: string }> } }>
    )({
      req: { user: { id: 'viewer', locale: 'de-DE' }, headers: {} },
      query: land ? { land } : {},
    });
  expect((await seiten()).body.seiten).toEqual([{ id: 'seite-de-DE' }]);
  m.isInstanceAdmin.mockResolvedValue(true);
  expect((await seiten('de-AT')).body.seiten).toEqual([{ id: 'seite-de-AT' }]);
});

it('routes /seiten to the Seiten list, not to the Vorlage with id "seiten"', async () => {
  const { default: express } = await import('express');
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 'viewer', locale: 'de-DE' };
    next();
  });
  mountSharepicVorlagenRouter(app);
  const server = app.listen(0);
  try {
    const { port } = server.address() as { port: number };
    const res = await fetch(`http://127.0.0.1:${port}/api/sharepic-vorlagen/seiten`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ seiten: [{ id: 'seite-de-DE' }] });
    expect(m.getSharepicVorlage).not.toHaveBeenCalledWith('seiten');
  } finally {
    server.close();
  }
});

it('lists the canvas Vorlagen of the viewer country, the other one only for an admin', async () => {
  const canvas = (land?: 'de-AT') =>
    (
      sharepicVorlagenContractRouter.canvas as unknown as (
        args: unknown
      ) => Promise<{ body: { vorlagen: Array<{ id: string }> } }>
    )({
      req: { user: { id: 'viewer', locale: 'de-DE' }, headers: {} },
      query: land ? { land } : {},
    });
  m.isInstanceAdmin.mockResolvedValue(false);
  expect((await canvas('de-AT')).body.vorlagen).toEqual([{ id: 'canvas-de-DE' }]);
  m.isInstanceAdmin.mockResolvedValue(true);
  expect((await canvas('de-AT')).body.vorlagen).toEqual([{ id: 'canvas-de-AT' }]);
});

it('serves a canvas Vorlage preview, immutable with the current version', () => {
  const route = '/api/sharepic-vorlagen/canvas/:id/thumb';
  expect(requestThumb({ v: 'abc123abc123' }, route)).toBe('private, max-age=31536000, immutable');
  expect(m.canvasVorlageThumbFile).toHaveBeenLastCalledWith('de-rad');
  expect(requestThumb({}, route)).toBe('private, no-cache');
});
