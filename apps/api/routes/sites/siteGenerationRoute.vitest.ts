import { type SiteGenerationEvent } from '@gruenerator/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Emit = (event: SiteGenerationEvent) => void;
type RunInput = { source: unknown; email: string; locale: string; signal: AbortSignal };

const runSiteGeneration = vi.hoisted(() => vi.fn<(input: RunInput, emit: Emit) => Promise<void>>());
const multerUpload = vi.hoisted(() =>
  vi.fn<(req: unknown, res: unknown, cb: (err?: unknown) => void) => void>()
);

const countPdfPages = vi.hoisted(() => vi.fn<(pdf: Buffer) => Promise<number | null>>());

vi.mock('../../services/sites/generation/runSiteGeneration.js', () => ({ runSiteGeneration }));
vi.mock('../../services/sites/generation/flyer/countPdfPages.js', () => ({ countPdfPages }));

vi.mock('multer', () => {
  class MulterError extends Error {
    code: string;
    constructor(code: string) {
      super(`multer says ${code}`);
      this.code = code;
    }
  }
  const multer = Object.assign(() => ({ single: () => multerUpload }), {
    memoryStorage: () => ({}),
    MulterError,
  });
  return { default: multer };
});

const { default: multer } = await import('multer');
const { flyerUpload, generateSiteContentRoute } = await import('./siteGenerationRoute.js');

const PDF = Buffer.from('%PDF-1.7\n…');
const DESCRIPTION =
  'Ich bin Anna und kandidiere für den Gemeinderat in meiner schönen Heimatstadt.';

function fakeRes() {
  const listeners: Record<string, (() => void)[]> = {};
  const res = {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn((_chunk: unknown) => true),
    end: vi.fn(),
    json: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
    writableEnded: false,
    destroyed: false,
    on: vi.fn((event: string, fn: () => void) => {
      (listeners[event] ??= []).push(fn);
      return res;
    }),
    emit: (event: string) => (listeners[event] ?? []).forEach((fn) => fn()),
  };
  res.status.mockReturnValue(res);
  return res;
}

type Result = { status: number; body: unknown };
const handler = generateSiteContentRoute.handler as unknown as (args: unknown) => Promise<Result>;

function call(opts: {
  body?: { description?: string; email?: string };
  file?: { buffer: Buffer } | null;
  headers?: Record<string, string>;
  res?: ReturnType<typeof fakeRes>;
}) {
  const res = opts.res ?? fakeRes();
  const req = { user: { id: 'u1' }, headers: opts.headers ?? {}, file: opts.file ?? undefined };
  return { res, result: handler({ req, res, body: opts.body ?? {} }) };
}

const writes = (res: ReturnType<typeof fakeRes>) => res.write.mock.calls.map((c) => String(c[0]));

beforeEach(() => {
  runSiteGeneration.mockReset();
  countPdfPages.mockReset();
  countPdfPages.mockResolvedValue(3);
  multerUpload.mockReset();
});

describe('generateSiteContentRoute', () => {
  it('rejects a flyer over 100 pages before the stream opens', async () => {
    countPdfPages.mockResolvedValue(101);
    const { res, result } = call({ file: { buffer: PDF } });
    const out = await result;
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: 'Der Flyer hat 101 Seiten. Erlaubt sind höchstens 100.' });
    expect(runSiteGeneration).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });

  it('rejects a flyer pdf-lib cannot read', async () => {
    countPdfPages.mockResolvedValue(null);
    const { res, result } = call({ file: { buffer: PDF } });
    const out = await result;
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: 'Die PDF-Datei konnte nicht gelesen werden.' });
    expect(runSiteGeneration).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });

  it('lets a flyer with exactly 100 pages through', async () => {
    countPdfPages.mockResolvedValue(100);
    runSiteGeneration.mockResolvedValue(undefined);
    const { result } = call({ file: { buffer: PDF } });
    const out = await result;
    expect(out.status).toBe(200);
    expect(runSiteGeneration).toHaveBeenCalledTimes(1);
  });

  it('rejects a request with both a description and a file', async () => {
    const { res, result } = call({ body: { description: DESCRIPTION }, file: { buffer: PDF } });
    const out = await result;
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: expect.any(String) });
    expect(runSiteGeneration).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });

  it('rejects a request with neither', async () => {
    const { res, result } = call({ body: {} });
    const out = await result;
    expect(out.status).toBe(400);
    expect(out.body).toEqual({ error: expect.any(String) });
    expect(runSiteGeneration).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });

  it('rejects a non-PDF before opening the stream', async () => {
    const { res, result } = call({ file: { buffer: Buffer.from('\x89PNG') } });
    const out = await result;
    expect(out).toEqual({ status: 400, body: { error: 'Nur PDF-Dateien sind erlaubt.' } });
    expect(res.setHeader).not.toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(runSiteGeneration).not.toHaveBeenCalled();
  });

  it('streams every event as an SSE frame', async () => {
    runSiteGeneration.mockImplementation(async (_input, emit) => {
      emit({ type: 'start', steps: ['write', 'images'] });
      emit({ type: 'done', content: {} as never });
    });
    const { res, result } = call({ body: { description: DESCRIPTION } });
    const out = await result;

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    const frames = writes(res);
    expect(frames).toContain(
      `event: start\ndata: ${JSON.stringify({ type: 'start', steps: ['write', 'images'] })}\n\n`
    );
    expect(frames.some((f) => f.startsWith('event: done\n'))).toBe(true);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ status: 200, body: undefined });
  });

  it('passes the request locale and the e-mail through', async () => {
    runSiteGeneration.mockResolvedValue();
    const { result } = call({
      body: { description: DESCRIPTION, email: 'a@b.de' },
      headers: { 'x-user-locale': 'de-AT' },
    });
    await result;

    const input = runSiteGeneration.mock.calls[0][0];
    expect(input.locale).toBe('de-AT');
    expect(input.email).toBe('a@b.de');
    expect(input.source).toEqual({ kind: 'text', description: DESCRIPTION });
  });

  it('hands a flyer to the pipeline as a flyer source', async () => {
    runSiteGeneration.mockResolvedValue();
    await call({ file: { buffer: PDF } }).result;

    const input = runSiteGeneration.mock.calls[0][0];
    expect(input.source).toEqual({ kind: 'flyer', pdf: PDF });
    expect(input.email).toBe('');
  });

  it('aborts the pipeline when the client goes away', async () => {
    let release: () => void = () => {};
    runSiteGeneration.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );
    const { res, result } = call({ body: { description: DESCRIPTION } });
    await vi.waitFor(() => expect(runSiteGeneration).toHaveBeenCalled());
    const signal = runSiteGeneration.mock.calls[0][0].signal;
    expect(signal.aborted).toBe(false);

    res.emit('close');
    expect(signal.aborted).toBe(true);

    release();
    await result;
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('sends a heartbeat while the pipeline runs and stops it afterwards', async () => {
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      runSiteGeneration.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          })
      );
      const { res, result } = call({ body: { description: DESCRIPTION } });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(writes(res)).toContain('event: heartbeat\ndata: {"type":"heartbeat"}\n\n');

      release();
      await result;
      const count = res.write.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(res.write.mock.calls.length).toBe(count);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('flyerUpload', () => {
  function runUpload(err: unknown) {
    multerUpload.mockImplementation((_req, _res, cb) => cb(err));
    const res = fakeRes();
    const next = vi.fn();
    flyerUpload({} as never, res as never, next);
    return { res, next };
  }

  it('answers an oversized file with 413 and a fixed message', () => {
    const { res, next } = runUpload(new multer.MulterError('LIMIT_FILE_SIZE'));
    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Die Datei ist zu groß. Maximal 20 MB erlaubt.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('answers any other upload error with 400 and without the multer message', () => {
    const { res, next } = runUpload(new multer.MulterError('LIMIT_FILE_COUNT'));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Die Datei konnte nicht hochgeladen werden.' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('multer says');
    expect(next).not.toHaveBeenCalled();
  });

  it('answers a non-multer error with 400 too', () => {
    const { res } = runUpload(new Error('Unexpected end of form'));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('Unexpected end of form');
  });

  it('passes a clean upload on', () => {
    const { res, next } = runUpload(undefined);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
