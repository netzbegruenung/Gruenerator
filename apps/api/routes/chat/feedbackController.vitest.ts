import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The controller registers its stack on import; capture it instead of serving. */
const stack: unknown[] = [];
vi.mock('../../utils/keycloak/index.js', () => ({
  createAuthenticatedRouter: () => ({
    post: (_path: string, ...rest: unknown[]) => stack.push(...rest),
  }),
}));

const query = vi.fn();
vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query }),
}));

const langfuseConfig = vi.fn();
vi.mock('../../services/telemetry/langfuseTelemetry.js', () => ({
  getLangfuseConfig: () => langfuseConfig(),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

await import('./feedbackController.js');

type Mw = (req: unknown, res: unknown, next: () => void) => void;
type Handler = (req: unknown, res: unknown) => Promise<void>;
const [validate, handler] = stack as [Mw, Handler];

const TRACE = 'a'.repeat(32);

function makeRes() {
  const out = { code: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      out.code = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
    end() {
      return res;
    },
  };
  return { res, out };
}

/** Runs the validation middleware and the handler the way express would. */
async function post(body: unknown, userId: string | undefined = 'user-1') {
  const req = { body, user: userId ? { id: userId } : undefined };
  const { res, out } = makeRes();
  let passed = false;
  validate(req, res, () => {
    passed = true;
  });
  if (passed) await handler(req, res);
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  langfuseConfig.mockReturnValue({
    publicKey: 'pk',
    secretKey: 'sk',
    baseUrl: 'https://langfuse.test/',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, text: async () => '' }))
  );
});

describe('POST /api/chat-service/feedback', () => {
  // The endpoint forwards this id into the Langfuse scores API, so it must be
  // an OTel trace id and nothing else.
  it.each([['not-a-trace'], ['A'.repeat(32)], ['a'.repeat(31)], ['a'.repeat(33)]])(
    'rejects %s as a trace id',
    async (traceId) => {
      const out = await post({ traceId, value: 'positive' });
      expect(out.code).toBe(400);
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('accepts a well-formed trace id', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    const out = await post({ traceId: TRACE, value: 'positive' });
    expect(out.code).toBe(204);
  });

  it('no-ops without touching the database when Langfuse is off', async () => {
    langfuseConfig.mockReturnValue(null);
    const out = await post({ traceId: TRACE, value: 'positive' });
    expect(out.code).toBe(204);
    expect(query).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  // The core of the ownership check: a valid-looking id from someone else's
  // conversation must not become a score.
  it('refuses a trace that belongs to nobody the caller is', async () => {
    query.mockResolvedValue([]);
    const out = await post({ traceId: TRACE, value: 'negative' });
    expect(out.code).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('scopes the ownership lookup to the caller', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await post({ traceId: TRACE, value: 'positive' }, 'user-42');
    expect(query.mock.calls[0][1]).toEqual(['user-42', TRACE]);
  });

  it('writes a BOOLEAN user-thumbs score', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    await post({ traceId: TRACE, value: 'negative', comment: 'daneben' });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://langfuse.test/api/public/scores');
    expect(JSON.parse((init as { body: string }).body)).toEqual({
      traceId: TRACE,
      name: 'user-thumbs',
      value: 0,
      dataType: 'BOOLEAN',
      comment: 'daneben',
    });
  });

  it('reports a failed Langfuse write as a bad gateway', async () => {
    query.mockResolvedValue([{ '?column?': 1 }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }))
    );
    const out = await post({ traceId: TRACE, value: 'positive' });
    expect(out.code).toBe(502);
  });
});
