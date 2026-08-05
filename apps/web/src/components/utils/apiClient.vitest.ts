/**
 * Covers `probeSessionVerdict()`'s branching — the load-bearing logic behind
 * every 401-triggered logout decision. A wrong verdict here either logs an
 * active user out (see GRUENERATOR-DP: "session teardown via shared-401") or
 * lets a genuinely dead session sit unrecognized.
 *
 * The module under test is re-imported fresh per test (`vi.resetModules()`)
 * because `lastProbe`/`probeInFlight` are private module-level caches with no
 * reset hook — reusing one module instance across tests would leak the
 * previous test's cached verdict.
 */
import { type AxiosStatic } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
