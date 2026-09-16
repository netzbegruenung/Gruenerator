/**
 * A deleted share leaves a ghost tile: the image degrades to its placeholder,
 * but the card around it keeps standing until the list it came from refetches.
 * These cover the signal that removes it — and, just as importantly, that the
 * upload race does NOT trigger it, since both cases reach the same handler and
 * only the status tells them apart.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, renderWithProviders, screen, waitFor } from '../../test-utils';

import { SharedMediaImage } from './SharedMediaImage';

function mockPreviewStatus(status: number): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status })))
  );
}

describe('SharedMediaImage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refetches the shared-media lists once the backend says the share is gone', async () => {
    mockPreviewStatus(410);
    // A token of its own per test: the "already reported" guard is module-level
    // and deliberately outlives a single render.
    const { queryClient } = renderWithProviders(
      <SharedMediaImage shareToken="gone-token" alt="Ein gelöschtes Bild" />
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.error(screen.getByAltText('Ein gelöschtes Bild'));

    // The probe sits behind the first 500ms retry backoff.
    await waitFor(() => expect(invalidate).toHaveBeenCalled(), { timeout: 3000 });
    expect(invalidate.mock.calls.map(([arg]) => arg?.queryKey)).toEqual([
      ['recent-activity'],
      ['media-library'],
    ]);
  });

  it('leaves the lists alone while a fresh upload is still landing', async () => {
    // 404, not 410: the row exists and the bytes have not arrived. Refetching
    // here would drop a tile that is about to start working.
    mockPreviewStatus(404);
    const { queryClient } = renderWithProviders(
      <SharedMediaImage shareToken="racing-token" alt="Ein frisches Bild" />
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    fireEvent.error(screen.getByAltText('Ein frisches Bild'));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled(), { timeout: 3000 });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
