/**
 * The one seam every embeddable surface leaves through.
 *
 * `isEmbedded()` is a module constant read once at import (see
 * `utils/platform.ts` for why), so each case has to set the URL and then
 * re-import the module — mocking the hook's dependency would test the mock.
 */
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as ReactRouter from 'react-router-dom';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router-dom');
  return { ...actual, useNavigate: () => navigate };
});

async function loadHook(search: string) {
  window.history.replaceState({}, '', `/boards/1${search}`);
  vi.resetModules();
  const { useHostAwareBack } = await import('./useHostAwareBack');
  return useHostAwareBack;
}

afterEach(() => {
  navigate.mockReset();
  delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
});

describe('useHostAwareBack', () => {
  it('navigates to the fallback in a normal browser', async () => {
    const useHostAwareBack = await loadHook('');
    const { result } = renderHook(() => useHostAwareBack('/workplace'), { wrapper: MemoryRouter });

    act(() => result.current());

    expect(navigate).toHaveBeenCalledWith('/workplace');
  });

  it('asks the host to close instead when embedded', async () => {
    // The whole point: `/workplace` inside the pinned WebView is a page
    // without navigation (RouteComponent forces noChrome while embedded), so
    // navigating there strands the user.
    const posted: string[] = [];
    (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage: (m: string) => posted.push(m),
    };
    const useHostAwareBack = await loadHook('?embedded=1');
    const { result } = renderHook(() => useHostAwareBack('/workplace'), { wrapper: MemoryRouter });

    act(() => result.current());

    expect(navigate).not.toHaveBeenCalled();
    expect(posted.map((p) => JSON.parse(p) as { type: string })).toEqual([{ type: 'CLOSE' }]);
  });

  it('does not re-read the query string after the app navigates away from it', async () => {
    // React Router drops `?embedded=1` on the first client-side navigation.
    // If the flag were read per call, the second press would navigate and
    // drop the user into chrome-less app pages — which is the bug the module
    // constant in utils/platform.ts exists to prevent.
    const posted: string[] = [];
    (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
      postMessage: (m: string) => posted.push(m),
    };
    const useHostAwareBack = await loadHook('?embedded=1');
    const { result } = renderHook(() => useHostAwareBack('/workplace'), { wrapper: MemoryRouter });

    window.history.replaceState({}, '', '/boards/1');
    act(() => result.current());

    expect(navigate).not.toHaveBeenCalled();
    expect(posted).toHaveLength(1);
  });
});
