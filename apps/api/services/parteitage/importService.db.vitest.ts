/**
 * Parteitage import against a real PostgreSQL with a temp storage root.
 * Runs only with MIGRATIONS_TEST_DATABASE_URL.
 */
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';
import { verifyPassword } from '../../utils/passwordHash.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;
let tmp: string;

const adapter = {
  get pool() {
    return pool;
  },
  ensureInitialized: async () => {},
  query: async (text: string, params?: unknown[]): Promise<unknown[]> =>
    (await pool.query<Record<string, unknown>>(text, params)).rows,
};

vi.mock('../../database/services/PostgresService/PostgresService.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPostgresInstance: () => adapter,
}));

const uploadDir = path.join(os.tmpdir(), `parteitage-import-uploads-${process.pid}`);
vi.mock('../subtitler/tusService.js', () => ({
  getFilePathFromUploadId: (id: string) => path.join(uploadDir, id),
  markUploadAsPromoted: vi.fn(),
}));
vi.mock('../subtitler/videoMetadata.js', () => ({
  probeVideoMetadata: async () => ({ duration: 12.5, width: 1080, height: 1920 }),
}));

process.env.SYSTEM_MEDIA_DIR = path.join(os.tmpdir(), `parteitage-import-media-${process.pid}`);

const svc = await import('./importService.js');
const { getSystemMediaStorage } = await import('../systemMedia/storage.js');

const sha = (content: string) => createHash('sha256').update(content).digest('hex');

/** Writes a fake upload and returns its manifest entry (name = content-derived). */
function fakeFile(name: string, content: string) {
  fs.writeFileSync(path.join(uploadDir, name), content);
  return { name, sha256: sha(content), sizeBytes: content.length };
}

const stat = { n: 1, median: 90, mittel: 90, min: 90, max: 90 };
const stats = {
  gesamt: { n: 1, topWoerter: [], anrede: [] },
  wahl: {
    formel: 'f',
    gesamt: stat,
    platzart: {},
    block: {},
    thema: {},
    anrede: {},
    korrelation: {},
    korrelationP: {},
    kampf: [],
    extreme: { hoch: [], tief: [] },
    raum: {},
    raumPlatzMedian: {},
  },
  liste: { bloecke: [] },
  vergleichRaum: [],
  signaturRaum: {},
  motto: { gesamt: 0, sinngemaess: 0, reden: [] },
  methodik: [],
  grenzen: '',
};

function speech(place: number, reel: string, poster: string) {
  return {
    key: `${place}-muster`,
    day: '2026-11-13',
    dayLabel: 'Freitag',
    listPlace: place,
    seatType: 'offen' as const,
    firstName: 'Erika',
    lastName: 'Muster',
    kv: 'Essen',
    area: 'kreisfreie_stadt' as const,
    contested: false,
    elected: true,
    resultPercent: 91.2,
    deliveredBy: null,
    topic: 'klima',
    durationS: 120,
    wordCount: 300,
    transcript: 'Liebe Freundinnen und Freunde.',
    words: [{ word: 'Liebe', start: 0, end: 0.4 }],
    analysis: {
      anrede: null,
      schluss: [],
      nennungen: { a: 1, b: 2 },
      signatur: 's',
      wpm: 140,
      woerter: 300,
      vorgetragen: false,
    },
    files: {
      reel: fakeFile(`reel-${place}-${reel}.mp4`, `reel-${reel}`),
      poster: fakeFile(`poster-${place}-${poster}.jpg`, `poster-${poster}`),
    },
  };
}

function manifest(speeches: ReturnType<typeof speech>[]) {
  return {
    version: 1 as const,
    key: 'nrw-lv-2026-essen',
    slugName: 'lv-essen-2026',
    title: 'Landesversammlung Essen 2026',
    shortTitle: 'Essen 2026',
    organizer: 'Grüne NRW',
    audience: 'de-DE' as const,
    startsOn: '2026-11-13',
    endsOn: '2026-11-15',
    location: 'Essen',
    sourceLinks: [],
    report: null,
    statsVersion: 1 as const,
    stats,
    speeches,
  };
}

/** Upload ids are the file names in `uploadDir`. */
function uploadsFor(m: ReturnType<typeof manifest>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of m.speeches) {
    out[s.files.reel.name] = s.files.reel.name;
    out[s.files.poster.name] = s.files.poster.name;
  }
  return out;
}

const admin = randomUUID();

describe.skipIf(!url)('importConvention (postgres)', () => {
  const dbName = `parteitage_${randomUUID().replace(/-/g, '')}`;
  const admin = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await admin.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    tmp = process.env.SYSTEM_MEDIA_DIR!;
  });
  afterAll(async () => {
    await pool?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await admin.end();
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });
  beforeEach(async () => {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(uploadDir, { recursive: true, force: true });
    fs.mkdirSync(uploadDir, { recursive: true });
    await pool.query(
      'TRUNCATE convention_access, convention_deleted_speeches, convention_speeches, conventions, system_media CASCADE'
    );
  });

  it('first import creates convention as draft with all speeches', async () => {
    const m = manifest([speech(1, 'a', 'a'), { ...speech(2, 'b', 'b'), key: '2-zweite' }]);
    const r = await svc.importConvention({
      manifest: m,
      uploads: uploadsFor(m),
      password: null,
      adminUserId: admin,
    });
    expect(r).toMatchObject({
      created: true,
      speeches: { added: 2, updated: 0, unchanged: 0 },
      filesStored: 4,
      filesRemoved: 0,
    });
    const c = (await pool.query('SELECT status, slug_suffix, published_at FROM conventions')).rows;
    expect(c).toHaveLength(1);
    expect(c[0].status).toBe('draft');
    expect(c[0].published_at).toBeNull();
    expect((await pool.query('SELECT 1 FROM convention_speeches')).rowCount).toBe(2);
    const media = (await pool.query('SELECT storage_key, duration_s, mime_type FROM system_media'))
      .rows;
    expect(media).toHaveLength(4);
    for (const row of media)
      expect(await getSystemMediaStorage().stat(row.storage_key)).not.toBeNull();
    const reel = media.find((x) => x.mime_type === 'video/mp4');
    expect(Number(reel.duration_s)).toBe(12.5);
  });

  it('re-import with identical files uploads nothing and reports unchanged', async () => {
    const m = manifest([speech(1, 'a', 'a')]);
    await svc.importConvention({
      manifest: m,
      uploads: uploadsFor(m),
      password: null,
      adminUserId: admin,
    });
    await pool.query("UPDATE conventions SET status = 'published', published_at = now()");
    const before = (await pool.query('SELECT id, slug_suffix, published_at FROM conventions'))
      .rows[0];
    const speechBefore = (await pool.query('SELECT id, slug_suffix FROM convention_speeches'))
      .rows[0];

    const r = await svc.importConvention({
      manifest: m,
      uploads: {},
      password: null,
      adminUserId: admin,
    });
    expect(r).toMatchObject({
      created: false,
      speeches: { added: 0, updated: 0, unchanged: 1 },
      filesStored: 0,
      filesRemoved: 0,
    });
    const after = (
      await pool.query('SELECT id, slug_suffix, status, published_at FROM conventions')
    ).rows[0];
    expect(after.id).toBe(before.id);
    expect(after.slug_suffix).toBe(before.slug_suffix);
    expect(after.status).toBe('published');
    expect(after.published_at).toEqual(before.published_at);
    expect((await pool.query('SELECT id, slug_suffix FROM convention_speeches')).rows[0]).toEqual(
      speechBefore
    );
  });

  it('re-import with changed reel stores new file and removes old file and media row', async () => {
    const m1 = manifest([speech(1, 'a', 'a')]);
    await svc.importConvention({
      manifest: m1,
      uploads: uploadsFor(m1),
      password: null,
      adminUserId: admin,
    });
    const oldKey = `${m1.key}/${m1.speeches[0]!.files.reel.sha256}.mp4`;
    expect(await getSystemMediaStorage().stat(oldKey)).not.toBeNull();
    const speechId = (await pool.query('SELECT id FROM convention_speeches')).rows[0].id;

    const m2 = manifest([speech(1, 'changed', 'a')]);
    const r = await svc.importConvention({
      manifest: m2,
      uploads: { [m2.speeches[0]!.files.reel.name]: m2.speeches[0]!.files.reel.name },
      password: null,
      adminUserId: admin,
    });
    expect(r).toMatchObject({
      speeches: { updated: 1, unchanged: 0 },
      filesStored: 1,
      filesRemoved: 1,
    });
    expect(await getSystemMediaStorage().stat(oldKey)).toBeNull();
    expect(
      (await pool.query('SELECT 1 FROM system_media WHERE storage_key = $1', [oldKey])).rowCount
    ).toBe(0);
    expect((await pool.query('SELECT 1 FROM system_media')).rowCount).toBe(2);
    expect((await pool.query('SELECT id FROM convention_speeches')).rows[0].id).toBe(speechId);
  });

  it('removes speeches absent from a re-import with their media, without blocking them', async () => {
    const m1 = manifest([speech(1, 'a', 'a'), { ...speech(2, 'b', 'b'), key: '2-zweite' }]);
    await svc.importConvention({
      manifest: m1,
      uploads: uploadsFor(m1),
      password: null,
      adminUserId: admin,
    });
    const m2 = manifest([m1.speeches[0]!]);
    const r = await svc.importConvention({
      manifest: m2,
      uploads: {},
      password: null,
      adminUserId: admin,
    });
    expect(r.filesRemoved).toBe(2);
    expect((await pool.query('SELECT 1 FROM convention_speeches')).rowCount).toBe(1);
    expect((await pool.query('SELECT 1 FROM system_media')).rowCount).toBe(2);
    expect((await pool.query('SELECT 1 FROM convention_deleted_speeches')).rowCount).toBe(0);
  });

  it('blocked speech key aborts import', async () => {
    const m = manifest([speech(1, 'a', 'a')]);
    await svc.importConvention({
      manifest: m,
      uploads: uploadsFor(m),
      password: null,
      adminUserId: admin,
    });
    const id = (await pool.query('SELECT id FROM conventions')).rows[0].id;
    await pool.query(
      'INSERT INTO convention_deleted_speeches (convention_id, speech_key) VALUES ($1, $2)',
      [id, m.speeches[0]!.key]
    );
    const m2 = manifest([speech(1, 'changed', 'a')]);
    await expect(
      svc.importConvention({
        manifest: m2,
        uploads: uploadsFor(m2),
        password: null,
        adminUserId: admin,
      })
    ).rejects.toBeInstanceOf(svc.ImportBlockedSpeechError);
    expect((await pool.query('SELECT 1 FROM system_media')).rowCount).toBe(2);
    expect((await pool.query('SELECT transcript FROM convention_speeches')).rowCount).toBe(1);
  });

  it('missing upload aborts and stores nothing', async () => {
    const m = manifest([speech(1, 'a', 'a')]);
    await expect(
      svc.importConvention({ manifest: m, uploads: {}, password: null, adminUserId: admin })
    ).rejects.toBeInstanceOf(svc.ImportMissingUploadError);
    expect((await pool.query('SELECT 1 FROM conventions')).rowCount).toBe(0);
  });

  it('sha mismatch aborts', async () => {
    const m = manifest([speech(1, 'a', 'a')]);
    fs.writeFileSync(path.join(uploadDir, m.speeches[0]!.files.reel.name), 'tampered');
    await expect(
      svc.importConvention({
        manifest: m,
        uploads: uploadsFor(m),
        password: null,
        adminUserId: admin,
      })
    ).rejects.toBeInstanceOf(svc.ImportFileMismatchError);
    expect((await pool.query('SELECT 1 FROM conventions')).rowCount).toBe(0);
    expect((await pool.query('SELECT 1 FROM system_media')).rowCount).toBe(0);
  });

  it('failed transaction removes newly stored files', async () => {
    const bad = { ...manifest([speech(1, 'a', 'a')]), startsOn: 'not-a-date' };
    await expect(
      svc.importConvention({
        manifest: bad,
        uploads: uploadsFor(bad),
        password: null,
        adminUserId: admin,
      })
    ).rejects.toThrow();
    const key = `${bad.key}/${bad.speeches[0]!.files.reel.sha256}.mp4`;
    expect(await getSystemMediaStorage().stat(key)).toBeNull();
    expect((await pool.query('SELECT 1 FROM system_media')).rowCount).toBe(0);
  });

  it('password is stored hashed', async () => {
    const m = manifest([speech(1, 'a', 'a')]);
    await svc.importConvention({
      manifest: m,
      uploads: uploadsFor(m),
      password: 'geheim',
      adminUserId: admin,
    });
    const hash = (await pool.query('SELECT access_password_hash AS h FROM conventions')).rows[0].h;
    expect(hash).not.toContain('geheim');
    expect(verifyPassword('geheim', hash)).toBe(true);
    // null keeps the hash
    await svc.importConvention({ manifest: m, uploads: {}, password: null, adminUserId: admin });
    expect((await pool.query('SELECT access_password_hash AS h FROM conventions')).rows[0].h).toBe(
      hash
    );
  });

  it('fileHashesForKey maps sha to storage key', async () => {
    const m = manifest([speech(1, 'a', 'a')]);
    await svc.importConvention({
      manifest: m,
      uploads: uploadsFor(m),
      password: null,
      adminUserId: admin,
    });
    const map = await svc.fileHashesForKey(m.key);
    expect(map[m.speeches[0]!.files.reel.sha256]).toBe(
      `${m.key}/${m.speeches[0]!.files.reel.sha256}.mp4`
    );
  });
});
