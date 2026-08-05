/**
 * Covers `toastApiError`'s `source: 'query' | 'mutation'` branching for
 * unclassified errors — the exact case flagged in PR review as silently
 * dropping mutation feedback before `mutationFallbackErrorMessage` was added.
 * Also locks in the `defaultErrorMessage` identity comparison this branching
 * depends on, so a future `errorMessages.ts` refactor (e.g. spreading instead
 * of returning the shared reference) fails a test instead of silently
 * reintroducing the bug.
 */
import { toast } from '@gruenerator/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { toastApiError } from './toastError';

vi.mock('@gruenerator/ui', () => ({
  toast: { error: vi.fn() },
}));

const toastErrorMock = vi.mocked(toast.error);

describe('toastApiError', () => {
  beforeEach(() => {
    toastErrorMock.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stays silent for an unclassified query error (default source)', () => {
    toastApiError({ status: 422 });

    expect(toastErrorMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Unclassified API error (no toast shown):',
      expect.anything()
    );
  });

  it('stays silent for an unclassified error explicitly marked as a query', () => {
    toastApiError({ status: 422 }, { source: 'query' });

    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('shows the calm fallback toast for an unclassified mutation error', () => {
    toastApiError({ status: 422 }, { source: 'mutation' });

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith(
      'Aktion fehlgeschlagen',
      expect.objectContaining({ description: expect.stringContaining('nicht funktioniert') })
    );
  });

  it('still shows the specific toast for a classified status regardless of source', () => {
    toastApiError({ status: 500 }, { source: 'query' });

    expect(toastErrorMock).toHaveBeenCalledTimes(1);
    expect(toastErrorMock).toHaveBeenCalledWith('KI-Dienst nicht verfügbar', expect.anything());
  });
});
