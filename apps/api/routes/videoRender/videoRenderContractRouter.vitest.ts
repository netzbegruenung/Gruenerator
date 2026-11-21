import { videoRenderBodySchema } from '@gruenerator/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3041,
    VIDEO_RENDER_URL: 'http://render.test:3050',
    VIDEO_RENDER_TOKEN: 'secret',
  },
}));

const BODY = {
  overlays: [{ id: 1, type: 'video', src: '/api/share/abc/stream' }],
  durationInFrames: 546,
  fps: 30,
  width: 1080,
  height: 1920,
};

const reqOf = (id: string) => ({ user: { id, email: `${id}@example.org` } }) as never;

type Res = { status: number; body: unknown };

async function call(name: string, user: string, args: Record<string, unknown> = {}): Promise<Res> {
  const { videoRenderContractRouter } = await import('./videoRenderContractRouter.js');
  const handlers = videoRenderContractRouter as unknown as Record<
    string,
    (a: unknown) => Promise<Res>
  >;
  return handlers[name]({ req: reqOf(user), res: { setHeader: vi.fn() }, ...args });
}

const fetchMock = vi.fn();
const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

beforeEach(async () => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  (await import('../../services/videoRender/videoRenderService.js')).resetVideoRenderJobs();
});
afterEach(() => vi.unstubAllGlobals());

describe('videoRenderBodySchema', () => {
  it('accepts relative media and refuses foreign hosts and oversized frames', () => {
    expect(videoRenderBodySchema.safeParse(BODY).success).toBe(true);
    const evil = { ...BODY, overlays: [{ type: 'video', src: 'https://evil.example/a.mp4' }] };
    expect(videoRenderBodySchema.safeParse(evil).success).toBe(false);
    const protocolRelative = { ...BODY, overlays: [{ src: '//evil.example/a.mp4' }] };
    expect(videoRenderBodySchema.safeParse(protocolRelative).success).toBe(false);
    // Addresses a browser resolves to another host than the base.
    for (const src of [
      '/\\169.254.169.254/latest/meta-data',
      '/\t/evil.example/x',
      '\\\\evil.example/x',
      ' http://169.254.169.254/x',
      'http:evil.example/x',
      'file:///etc/passwd',
    ]) {
      expect(videoRenderBodySchema.safeParse({ ...BODY, overlays: [{ src }] }).success, src).toBe(
        false
      );
    }
    const unsplash = { ...BODY, overlays: [{ src: 'https://images.unsplash.com/p.jpg' }] };
    expect(videoRenderBodySchema.safeParse(unsplash).success).toBe(true);
    expect(videoRenderBodySchema.safeParse({ ...BODY, durationInFrames: 10_000_000 }).success).toBe(
      false
    );
  });
});

describe('videoRender contract router', () => {
  it('start forwards the project with the media base URL and the token', async () => {
    fetchMock.mockResolvedValue(jsonRes(202, { jobId: 'up-1' }));
    const res = await call('start', 'u1', { body: BODY });
    expect(res.status).toBe(202);
    expect((res.body as { jobId: string }).jobId).toMatch(/^[0-9a-f-]{36}$/);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://render.test:3050/render');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer secret');
    expect(JSON.parse(init.body)).toMatchObject({ ...BODY, mediaBaseUrl: 'http://127.0.0.1:3041' });
  });

  it('answers 503 in German when the render service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = await call('start', 'u1', { body: BODY });
    expect(res.status).toBe(503);
    expect((res.body as { message: string }).message).toMatch(/Server-Export/);
  });

  it('keeps a job private to the person who started it', async () => {
    fetchMock.mockResolvedValue(jsonRes(202, { jobId: 'up-1' }));
    const { body } = await call('start', 'u1', { body: BODY });
    const { jobId } = body as { jobId: string };

    fetchMock.mockResolvedValue(jsonRes(200, { status: 'rendering', progress: 0.4 }));
    expect(await call('status', 'u1', { params: { id: jobId } })).toEqual({
      status: 200,
      body: { status: 'rendering', progress: 0.4 },
    });
    fetchMock.mockClear();
    expect((await call('status', 'u2', { params: { id: jobId } })).status).toBe(404);
    expect((await call('file', 'u2', { params: { id: jobId } })).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('limits renders in flight per person', async () => {
    fetchMock.mockImplementation(async () => jsonRes(202, { jobId: 'up' }));
    expect((await call('start', 'u1', { body: BODY })).status).toBe(202);
    expect((await call('start', 'u1', { body: BODY })).status).toBe(202);
    expect((await call('start', 'u1', { body: BODY })).status).toBe(429);
    expect((await call('start', 'u2', { body: BODY })).status).toBe(202);
  });

  it('file is 409 until the render is done, then streams the MP4', async () => {
    fetchMock.mockResolvedValue(jsonRes(202, { jobId: 'up-1' }));
    const { jobId } = (await call('start', 'u1', { body: BODY })).body as { jobId: string };

    fetchMock.mockResolvedValue(jsonRes(409, { error: 'not ready' }));
    expect((await call('file', 'u1', { params: { id: jobId } })).status).toBe(409);

    fetchMock.mockResolvedValue(new Response(new Uint8Array([0, 0, 0, 24]), { status: 200 }));
    const res = await call('file', 'u1', { params: { id: jobId } });
    expect(res.status).toBe(200);
    const chunks: Buffer[] = [];
    for await (const chunk of res.body as AsyncIterable<Buffer>) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 0, 0, 24]));
  });

  it('reports a job the render service forgot as an error', async () => {
    fetchMock.mockResolvedValue(jsonRes(202, { jobId: 'up-1' }));
    const { jobId } = (await call('start', 'u1', { body: BODY })).body as { jobId: string };
    fetchMock.mockResolvedValue(jsonRes(404, { error: 'unknown job' }));
    const res = await call('status', 'u1', { params: { id: jobId } });
    expect(res).toMatchObject({ status: 200, body: { status: 'error' } });
  });
});
