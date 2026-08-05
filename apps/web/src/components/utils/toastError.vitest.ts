/**
 * Covers `toastApiError`'s `source: 'query' | 'mutation'` branching for
 * unclassified errors — the exact case flagged in PR review as silently
 * dropping mutation feedback before `mutationFallbackErrorMessage` was added.
 * Also locks in the `defaultErrorMessage` identity comparison this branching
 * depends on, so a future `errorMessages.ts` refactor (e.g. spreading instead
 * of returning the shared reference) fails a test instead of silently
 * reintroducing the bug, and confirms unclassified errors reach Sentry —
 * `console.error` alone isn't captured in production (no captureConsole
 * integration in `index.tsx`).
 */
import { toast } from '@gruenerator/ui';
import * as Sentry from '@sentry/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toastApiError } from './toastError';

vi.mock('@gruenerator/ui', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

const toastErrorMock = vi.mocked(toast.error);
const captureExceptionMock = vi.mocked(Sentry.captureException);

describe('toastApiError', () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
    captureExceptionMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stays silent for an unclassified query error (default source), but reports it to Sentry', () => {
    const error = { status: 422 };
    toastApiError(error);

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Unclassified API error (no toast shown):',
      expect.anything()
    );
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { toastSource: 'query', toastSkipped: true } })
    );
  });

  it('stays silent for an unclassified error explicitly marked as a query', () => {
    toastApiError({ status: 422 }, { source: 'query' });

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('shows the calm fallback toast for an unclassified mutation error, and reports it to Sentry', () => {
    const error = { status: 422 };
    toastApiError(error, { source: 'mutation' });

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith(
      'Aktion fehlgeschlagen',
      expect.objectContaining({ description: expect.stringContaining('nicht funktioniert') })
    );
    expect(captureExceptionMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { toastSource: 'mutation', toastSkipped: false } })
    );
  });

  it('still shows the specific toast for a classified status regardless of source, without reporting to Sentry', () => {
    toastApiError({ status: 500 }, { source: 'query' });

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('KI-Dienst nicht verfügbar', expect.anything());
    expect(captureExceptionMock).not.toHaveBeenCalled();
  });

  it('throttles repeated Sentry reports for the same unclassified error signature (e.g. a persistently failing poll)', () => {
    // Distinct status (418) so this test's report-key never collides with
    // another test's — the throttle map is module state, not reset per test.
    const error = { status: 418 };
    const nowSpy = vi.spyOn(Date, 'now');

    nowSpy.mockReturnValue(1_000_000);
    toastApiError(error, { source: 'query' });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);

    // Next poll tick, same failure, still well inside the cooldown window.
    nowSpy.mockReturnValue(1_000_000 + 60_000);
    toastApiError(error, { source: 'query' });
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);

    // Cooldown elapsed — the recurring issue is reported again.
    nowSpy.mockReturnValue(1_000_000 + 11 * 60 * 1000);
    toastApiError(error, { source: 'query' });
    expect(captureExceptionMock).toHaveBeenCalledTimes(2);

    nowSpy.mockRestore();
  });
});
