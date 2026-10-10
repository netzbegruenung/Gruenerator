import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearBevState, loadBevState, saveBevMeta, saveBevVersions } from './bevPersistence';
import { type BevVersion } from './types';
import { useBildEditorV2 } from './useBildEditorV2';

vi.mock('./bevPersistence', () => ({
  loadBevState: vi.fn(),
  saveBevVersions: vi.fn(() => Promise.resolve()),
  saveBevMeta: vi.fn(() => Promise.resolve()),
  clearBevState: vi.fn(() => Promise.resolve()),
}));
vi.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({ createImageShare: () => Promise.resolve({}) }),
}));

function Wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

// Two full-size generated images: more than localStorage could ever hold together (#4365).
const BIG = 'x'.repeat(4_200_000);
const v1: BevVersion = {
  id: 'v1',
  parentId: null,
  prompt: 'Ein Radweg',
  image: `data:image/png;base64,${BIG}`,
  time: 1,
  num: 1,
  kind: 'create',
};
const v2: BevVersion = {
  ...v1,
  id: 'v2',
  parentId: 'v1',
  prompt: 'Mehr Bäume',
  num: 2,
  kind: 'edit',
};

beforeEach(() => {
  vi.mocked(loadBevState).mockReset();
  vi.mocked(saveBevVersions).mockClear();
  vi.mocked(saveBevMeta).mockClear();
  vi.mocked(clearBevState).mockClear();
});

describe('Bild-Editor persistence', () => {
  it('restores every saved version and the active one', async () => {
    vi.mocked(loadBevState).mockResolvedValue({ versions: [v1, v2], activeId: 'v2' });
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.restoring).toBe(false));
    expect(result.current.versions).toEqual([v1, v2]);
    expect(result.current.active?.id).toBe('v2');
    expect(result.current.mode).toBe('bearbeiten');
  });

  it('saves nothing until the saved state has loaded', async () => {
    let finish!: (v: Awaited<ReturnType<typeof loadBevState>>) => void;
    vi.mocked(loadBevState).mockReturnValue(new Promise((res) => (finish = res)));
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: Wrapper });

    expect(result.current.restoring).toBe(true);
    expect(saveBevVersions).not.toHaveBeenCalled();
    expect(saveBevMeta).not.toHaveBeenCalled();

    await act(async () => finish({ versions: [v1, v2], activeId: 'v2' }));
    expect(saveBevVersions).toHaveBeenLastCalledWith([v1, v2]);
  });

  it('switching versions rewrites only the meta, not the images', async () => {
    vi.mocked(loadBevState).mockResolvedValue({ versions: [v1, v2], activeId: 'v2' });
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.restoring).toBe(false));
    vi.mocked(saveBevVersions).mockClear();

    act(() => result.current.selectVersion('v1'));

    expect(saveBevMeta).toHaveBeenLastCalledWith(expect.objectContaining({ activeId: 'v1' }));
    expect(saveBevVersions).not.toHaveBeenCalled();
  });

  it('clears the stored state on reset', async () => {
    vi.mocked(loadBevState).mockResolvedValue({ versions: [v1], activeId: 'v1' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.restoring).toBe(false));

    act(() => result.current.resetAll());

    expect(clearBevState).toHaveBeenCalled();
    expect(result.current.versions).toEqual([]);
  });
});
