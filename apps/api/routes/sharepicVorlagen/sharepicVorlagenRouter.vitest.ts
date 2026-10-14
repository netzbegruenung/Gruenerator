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
}));

vi.mock('../../utils/adminAuthz.js', () => ({ isInstanceAdmin: m.isInstanceAdmin }));
vi.mock('../../services/sharepicVorlagen/catalog.js', () => ({
  listSharepicVorlagen: m.listSharepicVorlagen,
  getSharepicVorlage: m.getSharepicVorlage,
  sharepicVorlageThumbFile: m.sharepicVorlageThumbFile,
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

function requestThumb(query: Record<string, string>) {
  m.getSharepicVorlage.mockReturnValue({ id: 'de-rad', thumbVersion: 'abc123abc123' });
  m.sharepicVorlageThumbFile.mockReturnValue(thumbFile);
  let handler: (req: unknown, res: unknown) => void = () => {};
  mountSharepicVorlagenRouter({
    get: (route: string, h: typeof handler) => {
      if (route.endsWith('/thumb')) handler = h;
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
