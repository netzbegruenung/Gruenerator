import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type SignalModule = typeof import('./serverRestartSignal.js');
type ClientModule = typeof import('./client.js');

// The signal is module state; a fresh module per test keeps the cases independent.
let signal: SignalModule;
let clientModule: ClientModule;

beforeEach(async () => {
  vi.resetModules();
  signal = await import('./serverRestartSignal.js');
  clientModule = await import('./client.js');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isGatewayDownResponse', () => {
  it("recognizes nginx's HTML 502 as a restart", () => {
    expect(signal.isGatewayDownResponse(502, 'text/html')).toBe(true);
    expect(signal.isGatewayDownResponse(502, undefined)).toBe(true);
  });

  it("leaves the API's own JSON 502 (e.g. a failed AI provider) alone", () => {
    expect(signal.isGatewayDownResponse(502, 'application/json; charset=utf-8')).toBe(false);
  });

  it('ignores other statuses', () => {
    expect(signal.isGatewayDownResponse(500, 'text/html')).toBe(false);
    expect(signal.isGatewayDownResponse(503, 'text/html')).toBe(false);
  });
});

describe('restart state', () => {
  it('notifies once per transition, however many requests report it', () => {
    const listener = vi.fn();
    signal.subscribeServerRestart(listener);

    signal.reportGatewayDown();
    signal.reportGatewayDown();
    signal.reportServerBack();
    signal.reportServerBack();

    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('attributes late failures to the restart for a short while after the API is back', () => {
    vi.useFakeTimers();
    expect(signal.isServerRestarting()).toBe(false);

    signal.reportGatewayDown();
    expect(signal.isServerRestarting()).toBe(true);

    signal.reportServerBack();
    expect(signal.isServerRestarting()).toBe(true);

    vi.advanceTimersByTime(10_001);
    expect(signal.isServerRestarting()).toBe(false);
  });
});

describe('shared api client', () => {
  function adapter(status: number, contentType: string) {
    return () =>
      Promise.resolve({
        status,
        statusText: '',
        data: contentType.includes('json') ? { error: 'x' } : '<html>502 Bad Gateway</html>',
        headers: { 'content-type': contentType },
        config: {} as never,
      });
  }

  it("reports nginx's 502 also when the caller resolves 5xx (contracts client)", async () => {
    const client = clientModule.createApiClient({ baseURL: 'http://x/api', authMode: 'cookie' });
    await client.get('/user-agents', {
      adapter: adapter(502, 'text/html'),
      validateStatus: () => true,
    });
    expect(signal.isServerRestarting()).toBe(true);
  });

  it("reports nginx's 502 when it rejects", async () => {
    const client = clientModule.createApiClient({ baseURL: 'http://x/api', authMode: 'cookie' });
    await client.get('/user-agents', { adapter: adapter(502, 'text/html') }).catch(() => null);
    expect(signal.isServerRestarting()).toBe(true);
  });

  it("does not report the API's own JSON 502", async () => {
    const client = clientModule.createApiClient({ baseURL: 'http://x/api', authMode: 'cookie' });
    await client
      .get('/user-agents', { adapter: adapter(502, 'application/json') })
      .catch(() => null);
    expect(signal.isServerRestarting()).toBe(false);
  });
});
