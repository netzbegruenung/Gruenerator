import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

class ImportBlockedSpeechError extends Error {
  constructor(public readonly keys: string[]) {
    super('blocked');
  }
}
class ImportMissingUploadError extends Error {
  constructor(public readonly names: string[]) {
    super('missing');
  }
}
class ImportFileMismatchError extends Error {}

const m = vi.hoisted(() => ({
  requireInstanceAdmin: vi.fn(),
  deleteSpeech: vi.fn(),
  deleteConvention: vi.fn(),
  importConvention: vi.fn(),
  fileHashesForKey: vi.fn(),
  getConventionById: vi.fn(),
  getSpeech: vi.fn(),
  listAllConventions: vi.fn(),
  getDrizzleInstance: vi.fn(),
}));

vi.mock('../../utils/adminAuthz.js', () => ({ requireInstanceAdmin: m.requireInstanceAdmin }));
vi.mock('../../services/parteitage/deleteService.js', () => ({
  deleteSpeech: m.deleteSpeech,
  deleteConvention: m.deleteConvention,
}));
vi.mock('../../services/parteitage/importService.js', () => ({
  importConvention: m.importConvention,
  fileHashesForKey: m.fileHashesForKey,
  ImportBlockedSpeechError,
  ImportMissingUploadError,
  ImportFileMismatchError,
}));
vi.mock('../../services/parteitage/parteitageRepository.js', () => ({
  getConventionById: m.getConventionById,
  getSpeech: m.getSpeech,
  conventionSlug: () => 'ldk-abc123',
}));
vi.mock('../../services/parteitage/parteitageViews.js', () => ({
  listAllConventions: m.listAllConventions,
}));
vi.mock('../../database/services/DrizzleService.js', () => ({
  getDrizzleInstance: m.getDrizzleInstance,
}));

const { parteitageAdminContractRouter } = await import('./parteitageAdminContractRouter.js');

type Result = { status: number; body: Record<string, unknown> };
type Handler = (args: Record<string, unknown>) => Promise<Result>;
const call = (name: string, args: Record<string, unknown> = {}) =>
  (parteitageAdminContractRouter as unknown as Record<string, Handler>)[name]!({
    req: { user: { id: 'a1', email: 'a@x.de' }, headers: {} } as unknown as Request,
    ...args,
  });

const ALL: [string, Record<string, unknown>][] = [
  ['listAll', {}],
  ['fileHashes', { params: { key: 'k' } }],
  ['import', { body: { manifest: {}, uploads: {}, password: null } }],
  ['update', { params: { id: 'c1' }, body: { status: 'published' } }],
  ['setSpeechHidden', { params: { speechId: 's1' }, body: { hidden: true, reason: 'x' } }],
  ['deleteSpeech', { params: { speechId: 's1' } }],
  ['deleteConvention', { params: { id: 'c1' } }],
];

beforeEach(() => {
  vi.clearAllMocks();
  m.requireInstanceAdmin.mockResolvedValue(true);
  m.getSpeech.mockResolvedValue({ id: 's1' });
  m.getConventionById.mockResolvedValue({ id: 'c1', slug_name: 'x', slug_suffix: 'abc123' });
});

describe('non-admin', () => {
  it.each(ALL)('%s → 403 FORBIDDEN and nothing happens', async (name, args) => {
    m.requireInstanceAdmin.mockResolvedValue(false);
    const res = await call(name, args);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
    expect(m.deleteSpeech).not.toHaveBeenCalled();
    expect(m.deleteConvention).not.toHaveBeenCalled();
    expect(m.importConvention).not.toHaveBeenCalled();
  });
});

describe('admin', () => {
  it('deleteSpeech calls the delete service', async () => {
    const res = await call('deleteSpeech', { params: { speechId: 's1' } });
    expect(res).toEqual({ status: 200, body: { success: true } });
    expect(m.deleteSpeech).toHaveBeenCalledWith('s1');
  });

  it('deleteSpeech of an unknown speech is 404', async () => {
    m.getSpeech.mockResolvedValue(null);
    expect((await call('deleteSpeech', { params: { speechId: 'x' } })).status).toBe(404);
    expect(m.deleteSpeech).not.toHaveBeenCalled();
  });

  it('import maps ImportBlockedSpeechError → 409 with the keys', async () => {
    m.importConvention.mockRejectedValue(new ImportBlockedSpeechError(['k1', 'k2']));
    const res = await call('import', { body: { manifest: {}, uploads: {}, password: null } });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'BLOCKED_SPEECHES' });
    expect(String(res.body.message)).toContain('k1, k2');
  });

  it('import maps a schema error → 400', async () => {
    // The real manifest schema rejects the empty object inside importConvention.
    const { conventionManifestSchema } = await import('@gruenerator/contracts');
    m.importConvention.mockImplementation(async () => {
      conventionManifestSchema.parse({});
    });
    const res = await call('import', { body: { manifest: {}, uploads: {}, password: null } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'INVALID_MANIFEST' });
  });

  it('import returns id, slug and speech count', async () => {
    m.importConvention.mockResolvedValue({
      conventionId: 'c1',
      speeches: { added: 2, updated: 1, unchanged: 3 },
    });
    const res = await call('import', { body: { manifest: {}, uploads: {}, password: 'pw' } });
    expect(res).toEqual({
      status: 200,
      body: { success: true, id: 'c1', slug: 'ldk-abc123', speechCount: 6 },
    });
    expect(m.importConvention).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'pw', adminUserId: 'a1' })
    );
  });

  it('import maps missing uploads → 400 MISSING_UPLOADS with the file names', async () => {
    m.importConvention.mockRejectedValue(new ImportMissingUploadError(['a.mp4', 'b.jpg']));
    const res = await call('import', { body: { manifest: {}, uploads: {}, password: null } });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'MISSING_UPLOADS', files: ['a.mp4', 'b.jpg'] });
  });

  describe('update revokes unlock grants when the password is touched', () => {
    const setup = () => {
      const tx = {
        update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
        delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      };
      m.getDrizzleInstance.mockReturnValue({
        transaction: async (cb: (t: typeof tx) => Promise<void>) => cb(tx),
      });
      return tx;
    };

    it.each([['new-secret'], [null]])('password %s deletes convention_access', async (password) => {
      const tx = setup();
      const res = await call('update', { params: { id: 'c1' }, body: { password } });
      expect(res.status).toBe(200);
      expect(tx.update).toHaveBeenCalledTimes(1);
      expect(tx.delete).toHaveBeenCalledTimes(1);
    });

    it('a status-only change keeps the grants', async () => {
      const tx = setup();
      await call('update', { params: { id: 'c1' }, body: { status: 'published' } });
      expect(tx.update).toHaveBeenCalledTimes(1);
      expect(tx.delete).not.toHaveBeenCalled();
    });
  });

  it('fileHashes returns the stored map', async () => {
    m.fileHashesForKey.mockResolvedValue({ abc: 'k/abc.mp4' });
    const res = await call('fileHashes', { params: { key: 'k' } });
    expect(res).toEqual({ status: 200, body: { abc: 'k/abc.mp4' } });
  });
});
