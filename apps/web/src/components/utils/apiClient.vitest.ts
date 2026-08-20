/**
 * Covers `probeSessionVerdict()`'s branching — the load-bearing logic behind
 * every 401-triggered logout decision. A wrong verdict here either logs an
 * active user out (see GRUENERATOR-DP: "session teardown via shared-401") or
 * lets a genuinely dead session sit unrecognized.
 *
 * Plus the severity grading of the teardown report itself (see the second
 * describe block).
 *
 * The module under test is re-imported fresh per test (`vi.resetModules()`)
 * because `lastProbe`/`probeInFlight`/`redirectInFlight` are private
 * module-level caches with no reset hook — reusing one module instance across
 * tests would leak the previous test's cached verdict, and the one-shot
 * redirect latch would swallow every teardown after the first.
 */
import { type AxiosStatic } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { REDIRECT_TIMESTAMPS } from '../../features/auth/storageKeys';

// The first test pays the cold import of `apiClient` + `@gruenerator/contracts`
// + `@gruenerator/shared` + axios for the whole file; the 13 re-imports after it
// cost ~40 ms each. Measured inside a full `apps/web` run on an idle machine:
// 1825 ms for that one test, 2235 ms for the file. The green master run
// 31979142491 needed 7796 ms for the file, i.e. the cold test alone sat just
// under the 5000 ms default and went over it twice under CI load.
vi.setConfig({ testTimeout: 20_000 });

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<{ default: AxiosStatic }>();
  return {
    ...actual,
    default: {
      ...actual.default,
      get: vi.fn(),
    },
  };
});

vi.mock('../../lib/observability/captureAuthIssue', () => ({
  captureAuthIssue: vi.fn(),
}));

const aliveResponse = { status: 200, data: { user: { id: 'u1' } } };
const noUserResponse = { status: 200, data: { user: null } };

function httpError(status: number) {
  return { response: { status } };
}

function networkError() {
  return { message: 'Network Error' };
}

async function loadProbeSessionVerdict() {
  vi.resetModules();
  const axios = (await import('axios')).default;
  const { probeSessionVerdict } = await import('./apiClient');
  return { probeSessionVerdict, get: vi.mocked(axios.get) };
}

describe('probeSessionVerdict', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns alive when the first probe finds a user — no confirm call', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockResolvedValueOnce(aliveResponse);

    await expect(probeSessionVerdict()).resolves.toBe('alive');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns dead immediately on a 401 from the probe — no confirm call', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockRejectedValueOnce(httpError(401));

    await expect(probeSessionVerdict()).resolves.toBe('dead');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns dead immediately on a 403 from the probe — no confirm call', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockRejectedValueOnce(httpError(403));

    await expect(probeSessionVerdict()).resolves.toBe('dead');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('returns indeterminate on a network/5xx error — never a logout signal', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockRejectedValueOnce(networkError());

    await expect(probeSessionVerdict()).resolves.toBe('indeterminate');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('confirms a 200-no-user first probe as alive when the retry finds a user', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockResolvedValueOnce(noUserResponse).mockResolvedValueOnce(aliveResponse);

    const verdict = probeSessionVerdict();
    await vi.runAllTimersAsync();

    await expect(verdict).resolves.toBe('alive');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('confirms a 200-no-user first probe as dead when the retry also has no user', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockResolvedValueOnce(noUserResponse).mockResolvedValueOnce(noUserResponse);

    const verdict = probeSessionVerdict();
    await vi.runAllTimersAsync();

    await expect(verdict).resolves.toBe('dead');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('confirms a 200-no-user first probe as dead when the retry 401s', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockResolvedValueOnce(noUserResponse).mockRejectedValueOnce(httpError(401));

    const verdict = probeSessionVerdict();
    await vi.runAllTimersAsync();

    await expect(verdict).resolves.toBe('dead');
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not confirm death when the retry itself errors — stays indeterminate', async () => {
    const { probeSessionVerdict, get } = await loadProbeSessionVerdict();
    get.mockResolvedValueOnce(noUserResponse).mockRejectedValueOnce(networkError());

    const verdict = probeSessionVerdict();
    await vi.runAllTimersAsync();

    await expect(verdict).resolves.toBe('indeterminate');
    expect(get).toHaveBeenCalledTimes(2);
  });
});

/**
 * The teardown report's SEVERITY, which is the whole point of reporting every
 * teardown rather than only breaker trips: an expiry under a background poller
 * is the steady state and must not sit at `error` next to a redirect loop, or
 * both collapse into one undifferentiated GlitchTip issue again.
 *
 * These run in the `node` lane, so the browser globals the redirect path
 * touches are stubbed by hand — `window.location` above all, since the real
 * one would navigate.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

describe('session-teardown severity', () => {
  let sessionStore: Storage;

  beforeEach(() => {
    sessionStore = memoryStorage();
    vi.stubGlobal('sessionStorage', sessionStore);
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('window', {
      // Not a public page and not /login — both would short-circuit to 'stay'
      // before any redirect is fired.
      location: { pathname: '/chat', search: '', href: '', replace: vi.fn() },
      // sessionDebug installs visibility/focus listeners at import time as soon
      // as a `window` exists.
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('document', { visibilityState: 'visible' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  /** Fires exactly one teardown and returns the reported `session-teardown` call. */
  async function fireTeardown(priorRedirects: number[]) {
    if (priorRedirects.length > 0) {
      sessionStore.setItem(REDIRECT_TIMESTAMPS, JSON.stringify(priorRedirects));
    }
    vi.resetModules();
    const axios = (await import('axios')).default;
    // A 401 from the probe is a straight 'dead' verdict — no confirm round.
    vi.mocked(axios.get).mockRejectedValue(httpError(401));
    const { captureAuthIssue } = await import('../../lib/observability/captureAuthIssue');
    const { handleUnauthorized } = await import('./apiClient');

    await expect(handleUnauthorized('shared-401', 'session_not_found')).resolves.toBe('logout');

    const calls = vi.mocked(captureAuthIssue).mock.calls.map(([opts]) => opts);
    return {
      teardown: calls.find((o) => o.stage === 'session-teardown'),
      stages: calls.map((o) => o.stage),
    };
  }

  it('grades a single, non-repeating redirect as a warning', async () => {
    const { teardown, stages } = await fireTeardown([]);

    expect(teardown?.level).toBe('warning');
    // Nothing looped, so the breaker must not have reported alongside it.
    expect(stages).not.toContain('redirect-loop');
  });

  it('grades a second redirect inside the 10s window as an error', async () => {
    const { teardown } = await fireTeardown([Date.now() - 1_000]);

    expect(teardown?.level).toBe('error');
  });

  it('grades a breaker trip as an error and reports the loop too', async () => {
    const now = Date.now();
    const { teardown, stages } = await fireTeardown([now - 2_000, now - 1_000]);

    expect(teardown?.level).toBe('error');
    expect(stages).toContain('redirect-loop');
  });

  it('ignores redirects that fell out of the 10s window', async () => {
    // Two stale timestamps: without the window filter these would push the
    // count to 3 and trip the breaker on an ordinary expiry.
    const now = Date.now();
    const { teardown, stages } = await fireTeardown([now - 60_000, now - 30_000]);

    expect(teardown?.level).toBe('warning');
    expect(stages).not.toContain('redirect-loop');
  });

  it('ignores future-dated redirects left by a backward clock jump', async () => {
    // The GRUENERATOR-DA shape: two entries written before the wall clock
    // jumped backwards (laptop resume + NTP correction). `now - ts` is
    // negative for both, so the old `< WINDOW`-only filter kept them alive
    // forever and this single, ordinary expiry reported itself as a
    // 3-redirect loop.
    const now = Date.now();
    const { teardown, stages } = await fireTeardown([now + 30_000, now + 60_000]);

    expect(teardown?.level).toBe('warning');
    expect(stages).not.toContain('redirect-loop');
    expect(teardown?.extras?.redirectCount).toBe(1);
  });

  it('still trips on a genuine loop once the future-dated entries are gone', async () => {
    // Guards the fix against over-correcting: real, in-window redirects must
    // survive the tighter filter.
    const now = Date.now();
    const { stages } = await fireTeardown([now + 60_000, now - 2_000, now - 1_000]);

    expect(stages).toContain('redirect-loop');
  });

  it('tags the teardown by source, probe verdict and 401 code, and splits the fingerprint', async () => {
    const { teardown } = await fireTeardown([]);

    expect(teardown?.tags).toMatchObject({
      'auth.source': 'shared-401',
      'auth.401code': 'session_not_found',
    });
    // The probe dimension has to be present and concrete — an 'unknown' here
    // would mean the verdict never reached the report.
    expect(teardown?.tags?.['auth.probe']).toBeTruthy();
    expect(teardown?.fingerprintExtra).toEqual([
      'shared-401',
      teardown?.tags?.['auth.probe'],
      'session_not_found',
    ]);
  });

  it('falls back to an explicit unknown code rather than dropping the tag', async () => {
    vi.resetModules();
    const axios = (await import('axios')).default;
    vi.mocked(axios.get).mockRejectedValue(httpError(401));
    const { captureAuthIssue } = await import('../../lib/observability/captureAuthIssue');
    const { handleUnauthorized } = await import('./apiClient');

    await handleUnauthorized('legacy-401');

    const teardown = vi
      .mocked(captureAuthIssue)
      .mock.calls.map(([opts]) => opts)
      .find((o) => o.stage === 'session-teardown');

    expect(teardown?.tags?.['auth.401code']).toBe('unknown');
  });
});
