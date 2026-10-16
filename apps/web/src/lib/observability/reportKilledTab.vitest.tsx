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
  });

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
});
