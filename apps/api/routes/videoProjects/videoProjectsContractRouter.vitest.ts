import { createVideoProjectBodySchema } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listVideoProjects = vi.fn();
const createVideoProject = vi.fn();
const resolveVideoProject = vi.fn();
const updateVideoProject = vi.fn();
const deleteVideoProject = vi.fn();

vi.mock('../../services/videoProjects/videoProjectRepository.js', () => ({
  listVideoProjects,
  createVideoProject,
  resolveVideoProject,
  updateVideoProject,
  deleteVideoProject,
}));

const req = { user: { id: 'user-1', email: 'u@example.org' } } as never;

const PROJECT = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'neues-video-Ab3xK9',
  title: 'Neues Video',
  aspect_ratio: '9:16',
  created_at: '2026-11-21T10:00:00.000Z',
  updated_at: '2026-11-21T10:00:00.000Z',
  can_edit: true,
};

type Res = { status: number; body: unknown };

async function call(name: string, args: Record<string, unknown>): Promise<Res> {
  const { videoProjectsContractRouter } = await import('./videoProjectsContractRouter.js');
  const handlers = videoProjectsContractRouter as unknown as Record<
    string,
    (a: unknown) => Promise<Res>
  >;
  return handlers[name]({ req, ...args });
}

beforeEach(() => {
  for (const fn of [
    listVideoProjects,
    createVideoProject,
    resolveVideoProject,
    updateVideoProject,
    deleteVideoProject,
  ]) {
    fn.mockReset();
  }
});

describe('videoProjects contract router', () => {
  it('list returns the repository result', async () => {
    listVideoProjects.mockResolvedValue([PROJECT]);
    const res = await call('list', {});
    expect(res).toEqual({ status: 200, body: [PROJECT] });
    expect(listVideoProjects).toHaveBeenCalledWith('user-1');
  });

  it('create passes source_ref through and relays created: false', async () => {
    const source_ref = 'ki:22222222-2222-4222-8222-222222222222:2';
    createVideoProject.mockResolvedValue({ project: PROJECT, created: false });
    const res = await call('create', { body: { source_ref } });
    expect(res).toEqual({ status: 201, body: { project: PROJECT, created: false } });
    expect(createVideoProject).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ source_ref })
    );
  });

  it('create body schema rejects a foreign source_ref (400 at the contract layer)', () => {
    expect(createVideoProjectBodySchema.safeParse({ source_ref: 'parteitag:1' }).success).toBe(
      false
    );
    expect(
      createVideoProjectBodySchema.safeParse({
        source_ref: 'ki:22222222-2222-4222-8222-222222222222:2',
      }).success
    ).toBe(true);
  });

  it('get with an unknown ref is 404 with an error body', async () => {
    resolveVideoProject.mockResolvedValue(null);
    const res = await call('get', { params: { ref: 'nope-Zz9Zz9' } });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: expect.any(String) });
  });

  it('get returns the project', async () => {
    resolveVideoProject.mockResolvedValue(PROJECT);
    const res = await call('get', { params: { ref: 'neues-video-Ab3xK9' } });
    expect(res).toEqual({ status: 200, body: PROJECT });
    expect(resolveVideoProject).toHaveBeenCalledWith('neues-video-Ab3xK9', 'user-1');
  });

  it('update is 403 when the repository says forbidden', async () => {
    updateVideoProject.mockResolvedValue({ kind: 'forbidden' });
    const res = await call('update', { params: { id: PROJECT.id }, body: { title: 'x' } });
    expect(res.status).toBe(403);
  });

  it('update returns the refreshed project on ok', async () => {
    updateVideoProject.mockResolvedValue({ kind: 'ok' });
    resolveVideoProject.mockResolvedValue({ ...PROJECT, title: 'x' });
    const res = await call('update', { params: { id: PROJECT.id }, body: { title: 'x' } });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'x' });
  });

  it('delete is 404 on not_found and { trashed: true } on ok', async () => {
    deleteVideoProject.mockResolvedValueOnce({ kind: 'not_found' });
    expect((await call('delete', { params: { id: PROJECT.id } })).status).toBe(404);
    deleteVideoProject.mockResolvedValueOnce({ kind: 'ok' });
    expect(await call('delete', { params: { id: PROJECT.id } })).toEqual({
      status: 200,
      body: { trashed: true },
    });
  });
});
