import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { type FreitextHandoff } from '../freitext/freitextHandoff';

import { BevComposer } from './BevComposer';
import { useBildEditorV2 } from './useBildEditorV2';

vi.mock('../freitext/sharepicPhotos', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  preparePhoto: vi.fn((file: File) =>
    Promise.resolve({
      name: file.name,
      url: `/api/share/${file.name}/download`,
      analysis: { motiv: 'x', analysiert: true },
    })
  ),
}));
vi.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({ createImageShare: () => Promise.resolve({}) }),
}));

// Everything the chat route was opened with; the last one is the current hand-over.
const arrivals: (FreitextHandoff | null)[] = [];
const handoff = () => arrivals.at(-1) ?? null;

function Chat() {
  arrivals.push(useLocation().state as FreitextHandoff);
  return <p>Chat</p>;
}

function wrapper(state?: unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[{ pathname: '/bild-editor', state }]}>
          <Routes>
            <Route path="/bild-editor" element={children} />
            <Route path="/studio/freitext" element={<Chat />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

const jpg = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

beforeEach(() => {
  localStorage.clear();
  arrivals.length = 0;
});

describe('Bild-Editor „Sharepic" mode', () => {
  it('hands the prompt and the prepared photos to the chat page', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    act(() => result.current.addReferences([jpg('infostand.jpg')]));
    act(() => result.current.setPrompt('Sharepic zum Infostand'));
    await act(async () => {
      await result.current.submit();
    });
    // Durable URLs and descriptions travel, not the files.
    expect(handoff()).toEqual({
      prompt: 'Sharepic zum Infostand',
      photos: [
        {
          name: 'infostand.jpg',
          url: '/api/share/infostand.jpg/download',
          analysis: { motiv: 'x', analysiert: true },
        },
      ],
    });
  });

  it('hands over a text without photos', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    act(() => result.current.setPrompt('Mehr Busse auf dem Land'));
    await act(async () => {
      await result.current.submit();
    });
    expect(handoff()).toEqual({ prompt: 'Mehr Busse auf dem Land', photos: [] });
  });

  it('sends a photo alone, but nothing when there is neither text nor photo', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    await act(async () => {
      await result.current.submit();
    });
    expect(handoff()).toBeNull();
    act(() => result.current.addReferences([jpg('a.jpg')]));
    await act(async () => {
      await result.current.submit();
    });
    expect(handoff()?.prompt).toBe('');
    expect(handoff()?.photos).toHaveLength(1);
  });

  it('keeps an upload as a photo for the draft instead of switching to Bearbeiten', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    const file = jpg('infostand.jpg');
    await act(async () => {
      await result.current.handleUpload(file);
    });
    expect(result.current.mode).toBe('sharepic');
    expect(result.current.versions).toHaveLength(0);
    expect(result.current.references).toEqual([file]);
  });

  it('refuses a file that is no JPEG, PNG or WebP', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    await act(async () => {
      await result.current.handleUpload(new File(['x'], 'a.gif', { type: 'image/gif' }));
    });
    expect(result.current.references).toEqual([]);
    expect(result.current.error).toContain('kein JPEG, PNG oder WebP');
  });

  it('takes at most four photos', () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    act(() => result.current.addReferences(['1', '2', '3', '4', '5'].map((n) => jpg(`${n}.jpg`))));
    expect(result.current.references).toHaveLength(4);
  });

  it('does not carry references over between Sharepic and the image modes', () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.addReferences([jpg('ref.jpg')]));
    act(() => result.current.setMode('sharepic'));
    expect(result.current.references).toEqual([]);
  });

  it('opens in Sharepic mode when the router state asks for it', () => {
    const { result } = renderHook(() => useBildEditorV2(), {
      wrapper: wrapper({ mode: 'sharepic' }),
    });
    expect(result.current.mode).toBe('sharepic');
  });
});

describe('BevComposer in Sharepic mode', () => {
  function Harness() {
    const bev = useBildEditorV2();
    return (
      <>
        <button type="button" onClick={() => bev.addReferences([jpg('foto.jpg')])}>
          Foto anhängen
        </button>
        <BevComposer bev={bev} />
      </>
    );
  }

  it('shows the examples and the attached photos, accessibly', async () => {
    const { container } = render(<Harness />, { wrapper: wrapper({ mode: 'sharepic' }) });
    expect(screen.getByRole('button', { name: 'Mitglieder werben' })).toBeInTheDocument();
    await act(async () => screen.getByText('Foto anhängen').click());
    expect(screen.getByRole('button', { name: 'foto.jpg entfernen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eigenes Foto' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
