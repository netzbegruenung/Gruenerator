import { SHAREPIC_NEUTRAL_PHOTO_ANALYSIS } from '@gruenerator/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';
import { type FreitextHandoff } from '../freitext/freitextHandoff';
import { preparePhoto } from '../freitext/sharepicPhotos';

import { BevComposer } from './BevComposer';
import { type BevVersion } from './types';
import { useBildEditorV2 } from './useBildEditorV2';

vi.mock('../freitext/sharepicPhotos', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  preparePhoto: vi.fn(),
}));
vi.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({ createImageShare: () => Promise.resolve({}) }),
}));

const prepare = vi.mocked(preparePhoto);
const prepared = (file: File) => ({
  name: file.name,
  url: `/api/share/${file.name}/download`,
  analysis: { ...SHAREPIC_NEUTRAL_PHOTO_ANALYSIS },
});

// Everything the chat route was opened with; the last one is the current hand-over.
const arrivals: (FreitextHandoff | null)[] = [];
const handoff = () => arrivals.at(-1) ?? null;

function Chat() {
  arrivals.push(useLocation().state as FreitextHandoff);
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Zurück
    </button>
  );
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
const flush = () => act(async () => {});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  arrivals.length = 0;
  prepare.mockReset();
  prepare.mockImplementation((file) => Promise.resolve(prepared(file)));
});

const aiVersion: BevVersion = {
  id: 'v1',
  parentId: null,
  prompt: 'Ein Windrad',
  image: 'data:image/png;base64,KI',
  time: 1,
  num: 1,
  kind: 'create',
};

describe('Bild-Editor „Sharepic" mode', () => {
  it('hands the prompt and the prepared photos to the chat page', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    act(() => result.current.addReferences([jpg('infostand.jpg')]));
    act(() => result.current.setPrompt('Sharepic zum Infostand'));
    await flush();
    await act(async () => {
      await result.current.submit();
    });
    // Durable URLs and descriptions travel, not the files.
    expect(handoff()).toEqual({
      prompt: 'Sharepic zum Infostand',
      photos: [prepared(jpg('infostand.jpg'))],
    });
    expect(prepare).toHaveBeenCalledTimes(1);
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
    await act(async () => {
      await result.current.handleUpload(jpg('infostand.jpg'));
    });
    expect(result.current.mode).toBe('sharepic');
    expect(result.current.versions).toHaveLength(0);
    expect(result.current.photos.map((p) => p.name)).toEqual(['infostand.jpg']);
    expect(result.current.references).toEqual([]);
  });

  it('refuses a file that is no JPEG, PNG or WebP, and clears the notice on the next good one', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    act(() => result.current.addReferences([new File(['x'], 'a.gif', { type: 'image/gif' })]));
    expect(result.current.photos).toEqual([]);
    expect(result.current.error).toContain('kein JPEG, PNG oder WebP');
    act(() => result.current.addReferences([jpg('ok.jpg')]));
    expect(result.current.error).toBeNull();
    await flush();
  });

  it('takes at most four photos and says so', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('sharepic'));
    act(() => result.current.addReferences(['1', '2', '3', '4', '5'].map((n) => jpg(`${n}.jpg`))));
    expect(result.current.photos).toHaveLength(4);
    expect(result.current.error).toContain('Mehr als 4 Fotos');
    await flush();
  });

  it('does not carry photos or references over between Sharepic and the image modes', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.addReferences([jpg('ref.jpg')]));
    act(() => result.current.setMode('sharepic'));
    expect(result.current.references).toEqual([]);
    act(() => result.current.addReferences([jpg('foto.jpg')]));
    expect(result.current.photos).toHaveLength(1);
    act(() => result.current.setMode('bearbeiten'));
    expect(result.current.photos).toEqual([]);
    await flush();
  });

  it('opens in Sharepic mode when the router state asks for it', () => {
    const { result } = renderHook(() => useBildEditorV2(), {
      wrapper: wrapper({ mode: 'sharepic' }),
    });
    expect(result.current.mode).toBe('sharepic');
  });

  describe('preparing photos', () => {
    it('starts preparing when a photo is picked and shows progress', async () => {
      const job = deferred<ReturnType<typeof prepared>>();
      prepare.mockReturnValueOnce(job.promise);
      const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
      act(() => result.current.setMode('sharepic'));
      act(() => result.current.addReferences([jpg('a.jpg')]));
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(result.current.photos[0]!.state).toBe('working');
      await act(async () => job.resolve(prepared(jpg('a.jpg'))));
      expect(result.current.photos[0]!.state).toBe('ready');
    });

    it('waits for a photo that is still working before it hands over', async () => {
      const job = deferred<ReturnType<typeof prepared>>();
      prepare.mockReturnValueOnce(job.promise);
      const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
      act(() => result.current.setMode('sharepic'));
      act(() => result.current.addReferences([jpg('a.jpg')]));
      act(() => result.current.setPrompt('Sharepic zum Infostand'));
      let submitted!: Promise<void>;
      act(() => {
        submitted = result.current.submit();
      });
      await flush();
      expect(handoff()).toBeNull();
      await act(async () => {
        job.resolve(prepared(jpg('a.jpg')));
        await submitted;
      });
      expect(handoff()?.photos).toHaveLength(1);
    });

    it('keeps the photos that worked when a sibling failed, and never prepares one twice', async () => {
      prepare.mockImplementation((file) =>
        file.name === 'bad.jpg'
          ? Promise.reject(new Error('„bad.jpg“ konnte nicht hochgeladen werden.'))
          : Promise.resolve(prepared(file))
      );
      const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
      act(() => result.current.setMode('sharepic'));
      act(() => result.current.addReferences([jpg('good.jpg'), jpg('bad.jpg')]));
      act(() => result.current.setPrompt('Sharepic zum Infostand'));
      await flush();
      expect(result.current.photos.map((p) => p.state)).toEqual(['ready', 'failed']);
      await act(async () => {
        await result.current.submit();
      });
      expect(handoff()).toBeNull();
      expect(result.current.error).toContain('bad.jpg');
      expect(result.current.photos[0]!.state).toBe('ready');
      // Take the failed one off and go again.
      act(() => result.current.removePhoto(result.current.photos[1]!.id));
      await act(async () => {
        await result.current.submit();
      });
      expect(handoff()?.photos.map((p) => p.name)).toEqual(['good.jpg']);
      expect(prepare).toHaveBeenCalledTimes(2);
    });
  });

  describe('leaving and coming back', () => {
    it('does not navigate when the person left during the upload', async () => {
      const job = deferred<ReturnType<typeof prepared>>();
      prepare.mockReturnValueOnce(job.promise);
      const { result, unmount } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
      act(() => result.current.setMode('sharepic'));
      act(() => result.current.addReferences([jpg('a.jpg')]));
      act(() => result.current.setPrompt('Sharepic zum Infostand'));
      let submitted!: Promise<void>;
      act(() => {
        submitted = result.current.submit();
      });
      unmount();
      await act(async () => {
        job.resolve(prepared(jpg('a.jpg')));
        await submitted;
      });
      expect(arrivals).toEqual([]);
    });

    it('comes back in Sharepic mode on Back from the chat', async () => {
      function Host() {
        const bev = useBildEditorV2();
        return (
          <>
            <p data-testid="mode">{bev.mode}</p>
            <button type="button" onClick={() => bev.setMode('sharepic')}>
              zu Sharepic
            </button>
            <button type="button" onClick={() => bev.setPrompt('Mehr Busse auf dem Land')}>
              Text
            </button>
            <button type="button" onClick={() => void bev.submit()}>
              Senden
            </button>
          </>
        );
      }
      const W = wrapper();
      render(<Host />, { wrapper: W });
      await act(async () => screen.getByText('zu Sharepic').click());
      await act(async () => screen.getByText('Text').click());
      await act(async () => screen.getByText('Senden').click());
      expect(handoff()?.prompt).toBe('Mehr Busse auf dem Land');
      await act(async () => screen.getByText('Zurück').click());
      expect(screen.getByTestId('mode')).toHaveTextContent('sharepic');
    });
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
        <BevComposer bev={bev} examples />
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

  it("disables a photo's remove button while it uploads", async () => {
    prepare.mockReturnValue(new Promise(() => {}));
    render(<Harness />, { wrapper: wrapper({ mode: 'sharepic' }) });
    await act(async () => screen.getByText('Foto anhängen').click());
    expect(screen.getByRole('button', { name: 'foto.jpg entfernen' })).toBeDisabled();
    expect(screen.getByText(/wird vorbereitet/)).toBeInTheDocument();
  });

  it('says the image on stage is not used, and announces photo problems', async () => {
    localStorage.setItem(
      'gruenerator-bildeditor-v2',
      JSON.stringify({ versions: [aiVersion], activeId: 'v1' })
    );
    prepare.mockRejectedValue(new Error('„foto.jpg“ konnte nicht hochgeladen werden.'));
    const { container } = render(<Harness />, { wrapper: wrapper({ mode: 'sharepic' }) });
    expect(screen.getAllByText(/wird für das Sharepic nicht verwendet/).length).toBeGreaterThan(0);
    await act(async () => screen.getByText('Foto anhängen').click());
    expect((await screen.findAllByRole('alert'))[0]).toHaveTextContent('konnte nicht hochgeladen');
    expect(await axe(container)).toHaveNoViolations();
  });
});
