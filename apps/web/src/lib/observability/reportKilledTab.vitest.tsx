import * as Sentry from '@sentry/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportKilledTab } from './reportKilledTab';

vi.mock('@sentry/react', () => ({ captureMessage: vi.fn() }));

function navigationType(type: string) {
  vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
    { type } as unknown as PerformanceEntry,
  ]);
}

describe('reportKilledTab', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.mocked(Sentry.captureMessage).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'wasDiscarded');
    Reflect.deleteProperty(document, 'visibilityState');
  });

  function hiddenAt(): unknown {
    return (JSON.parse(sessionStorage.getItem('gr:tab-alive') ?? '{}') as { hiddenAt?: unknown })
      .hiddenAt;
  }

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('reports a reload that finds the previous page never unloaded', () => {
    sessionStorage.setItem('gr:tab-alive', String(Date.now() - 5000));
    navigationType('reload');

    reportKilledTab();

    expect(Sentry.captureMessage).toHaveBeenCalledOnce();
    expect(vi.mocked(Sentry.captureMessage).mock.calls[0]?.[1]).toMatchObject({
      tags: { kind: 'tab-killed' },
      extra: { aliveForSeconds: 5 },
    });
  });

  it('stays quiet after a clean unload', () => {
    navigationType('navigate');
    reportKilledTab();
    window.dispatchEvent(new Event('pagehide'));

    navigationType('reload');
    reportKilledTab();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('ignores a duplicated or restored tab, which copies sessionStorage', () => {
    sessionStorage.setItem('gr:tab-alive', String(Date.now()));
    navigationType('back_forward');

    reportKilledTab();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('ignores a tab Chrome discarded to save memory', () => {
    sessionStorage.setItem('gr:tab-alive', String(Date.now()));
    navigationType('reload');
    Object.defineProperty(document, 'wasDiscarded', { value: true, configurable: true });

    reportKilledTab();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('reports a page killed while hidden as a background warning', () => {
    sessionStorage.setItem(
      'gr:tab-alive',
      JSON.stringify({ startedAt: Date.now() - 60000, hiddenAt: Date.now() - 20000 })
    );
    navigationType('reload');

    reportKilledTab();

    expect(vi.mocked(Sentry.captureMessage).mock.calls[0]?.[1]).toMatchObject({
      level: 'warning',
      tags: { kind: 'tab-killed', state: 'background' },
      extra: { aliveForSeconds: 60, hiddenForSeconds: 20 },
    });
  });

  it('records hiding in the marker and clears it on return', () => {
    navigationType('navigate');
    reportKilledTab();

    setVisibility('hidden');
    expect(hiddenAt()).toEqual(expect.any(Number));
    setVisibility('visible');
    expect(hiddenAt()).toBeNull();
  });

  it('does not bring the marker back when hiding follows pagehide', () => {
    navigationType('navigate');
    reportKilledTab();
    window.dispatchEvent(new Event('pagehide'));
    setVisibility('hidden');

    expect(sessionStorage.getItem('gr:tab-alive')).toBeNull();
  });

  it('leaves the marker to the top-level page when running in an iframe', () => {
    sessionStorage.setItem('gr:tab-alive', String(Date.now()));
    navigationType('reload');
    vi.spyOn(window, 'top', 'get').mockReturnValue({} as Window);

    reportKilledTab();

    expect(Sentry.captureMessage).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('gr:tab-alive')).not.toBeNull();
  });
});
