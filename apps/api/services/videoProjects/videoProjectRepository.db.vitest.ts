/**
 * Video project repository against a real PostgreSQL. Runs only with
 * MIGRATIONS_TEST_DATABASE_URL (CI `Tests` job).
 */
import { randomUUID } from 'node:crypto';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { runMigrations } from '../../database/services/PostgresService/migrations.js';

const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
let pool: pg.Pool;

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
// Closing Hocuspocus rooms is a network call to another service.
vi.mock('../collab/hocuspocusInternal.js', () => ({ closeCollabRooms: async () => {} }));

const repo = await import('./videoProjectRepository.js');

const u1 = randomUUID();
const u2 = randomUUID();
const sourceRef = `ki:${randomUUID()}:2`;

describe.skipIf(!url)('videoProjectRepository (db)', () => {
  const dbName = `videoprojects_${randomUUID().replace(/-/g, '')}`;
  const adminPool = new pg.Pool({ connectionString: url });

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    const target = new URL(url!);
    target.pathname = `/${dbName}`;
    pool = new pg.Pool({ connectionString: target.toString() });
    expect(await runMigrations(pool)).toBe(true);
    for (const [id, name] of [
      [u1, 'U1'],
      [u2, 'U2'],
    ]) {
      await pool.query('INSERT INTO profiles (id, display_name) VALUES ($1, $2)', [id, name]);
    }
  });
  afterAll(async () => {
    await pool?.end();
    await adminPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
    await adminPool.end();
  });

  it('is idempotent per source_ref and re-creates after the project was trashed', async () => {
    const first = await repo.createVideoProject(u1, { source_ref: sourceRef });
    expect(first.created).toBe(true);
    const second = await repo.createVideoProject(u1, { source_ref: sourceRef });
    expect(second.created).toBe(false);
    expect(second.project.id).toBe(first.project.id);

    expect((await repo.deleteVideoProject(first.project.id, u1)).kind).toBe('ok');
    expect((await repo.listVideoProjects(u1)).map((p) => p.id)).not.toContain(first.project.id);

    const third = await repo.createVideoProject(u1, { source_ref: sourceRef });
    expect(third.created).toBe(true);
    expect(third.project.id).not.toBe(first.project.id);
  });

  it('hides a project from people without access and resolves by slug or id for the owner', async () => {
    const { project } = await repo.createVideoProject(u1, { title: 'Mein Reel' });
    expect(project.slug).toMatch(/^mein-reel-/);
    expect((await repo.resolveVideoProject(project.slug, u1))?.id).toBe(project.id);
    expect((await repo.resolveVideoProject(project.id, u1))?.can_edit).toBe(true);
    expect(await repo.resolveVideoProject(project.slug, u2)).toBeNull();
    expect(await repo.resolveVideoProject(project.id, u2)).toBeNull();
  });

  it('updates title and aspect ratio', async () => {
    const { project } = await repo.createVideoProject(u1, {});
    expect(project.title).toBe('Neues Video');
    expect(project.aspect_ratio).toBe('9:16');
    expect(
      (await repo.updateVideoProject(project.id, u1, { title: 'Neu', aspect_ratio: '16:9' })).kind
    ).toBe('ok');
    const after = await repo.resolveVideoProject(project.id, u1);
    expect(after).toMatchObject({ title: 'Neu', aspect_ratio: '16:9' });
    expect((await repo.updateVideoProject(project.id, u2, { title: 'x' })).kind).toBe('forbidden');
  });
});
