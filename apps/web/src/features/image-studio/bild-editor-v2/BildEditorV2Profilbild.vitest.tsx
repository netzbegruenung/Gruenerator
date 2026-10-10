import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderSharepicToImage } from '../renderSharepicToImage';
import { updateCanvasThumbnail } from '../services/canvasThumbnailService';
import { removeImageBackground } from '../services/imageEditingService';
import { uploadBlobToMediaLibrary } from '../services/mediaUploadService';

import { mintProfilbildCanvas } from './canvasHandoff';
import { type BevVersion } from './types';
import { useBildEditorV2 } from './useBildEditorV2';

const create =
  vi.fn<(args: { body: Record<string, unknown> }) => Promise<{ status: number; body: unknown }>>();
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ canvas: { create } }),
}));
vi.mock('../services/mediaUploadService', () => ({ uploadBlobToMediaLibrary: vi.fn() }));
vi.mock('../renderSharepicToImage', () => ({ renderSharepicToImage: vi.fn() }));
vi.mock('../services/canvasThumbnailService', () => ({ updateCanvasThumbnail: vi.fn() }));
vi.mock('../services/imageEditingService', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  removeImageBackground: vi.fn(),
}));
// Seeding warms the canvas editor's chunk and assets, which is beside the point here.
vi.mock('../canvasQuery', () => ({ seedCanvasQuery: vi.fn() }));
vi.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({ createImageShare: () => Promise.resolve({}) }),
}));

const upload = vi.mocked(uploadBlobToMediaLibrary);
const removeBg = vi.mocked(removeImageBackground);
const renderThumb = vi.mocked(renderSharepicToImage);
const updateThumb = vi.mocked(updateCanvasThumbnail);

const PHOTO = 'data:image/jpeg;base64,UEhPVE8=';
const CUTOUT = 'data:image/png;base64,Q1VUT1VU';
const MEDIA_URL = '/api/share/media-1/download';
const THUMB = 'data:image/png;base64,VEhVTUI=';

const opened: string[] = [];
function CanvasRoute() {
  opened.push(useParams().id ?? '');
  return null;
}

function wrapper(state?: unknown) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[{ pathname: '/bild-editor', state }]}>
          <Routes>
            <Route path="/bild-editor" element={children} />
            <Route path="/studio/canvas/:id" element={<CanvasRoute />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function persist(version: BevVersion) {
  localStorage.setItem(
    'gruenerator-bildeditor-v2',
    JSON.stringify({ versions: [version], activeId: version.id })
  );
}

const photo: BevVersion = {
  id: 'v1',
  parentId: null,
  prompt: 'portrait.jpg',
  image: PHOTO,
  time: 1,
  num: 1,
  kind: 'upload',
};

beforeEach(() => {
  // The code reads its data-URLs back with fetch; MSW rejects every unhandled request.
  // jsdom's Blob is not the one undici's Response accepts, hence the hand-made body.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      Object.assign(new Response(null), {
        blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
      })
    )
  );
  localStorage.clear();
  opened.length = 0;
  create.mockReset();
  create.mockResolvedValue({ status: 201, body: { id: 'canvas-1' } });
  upload.mockReset();
  upload.mockResolvedValue(MEDIA_URL);
  renderThumb.mockReset();
  renderThumb.mockResolvedValue(THUMB);
  updateThumb.mockReset();
  updateThumb.mockResolvedValue();
  removeBg.mockReset();
  removeBg.mockResolvedValue({
    file: new File(['x'], 'v1-no-bg.png', { type: 'image/png' }),
    objectUrl: 'blob:cutout',
    base64: CUTOUT,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mintProfilbildCanvas', () => {
  it('uploads the cut-out photo and mints a profilbild canvas on its pinned format', async () => {
    await mintProfilbildCanvas(CUTOUT, 'Profilbild');

    expect(upload).toHaveBeenCalledWith(expect.any(Blob), { uploadSource: 'canvas-mint' });
    expect(create).toHaveBeenCalledWith({
      body: {
        title: 'Profilbild',
        template_type: 'profilbild',
        initial_state: { transparentImage: MEDIA_URL },
        format: 'profile-square',
        page_count: 1,
      },
    });
  });

  it('renders the minted canvas into its gallery thumbnail', async () => {
    await mintProfilbildCanvas(CUTOUT, 'Profilbild');

    expect(renderThumb).toHaveBeenCalledWith(
      'profilbild',
      { transparentImage: MEDIA_URL },
      { formatId: 'profile-square' }
    );
    await vi.waitFor(() =>
      expect(updateThumb).toHaveBeenCalledWith('canvas-1', THUMB, 'canvas-mint-thumbnail')
    );
  });

  it('still returns the canvas when the thumbnail render fails', async () => {
    renderThumb.mockRejectedValue(new Error('render failed'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(mintProfilbildCanvas(CUTOUT, 'Profilbild')).resolves.toEqual({ id: 'canvas-1' });
    expect(updateThumb).not.toHaveBeenCalled();
  });

  it('mints nothing when the upload yields no URL', async () => {
    upload.mockResolvedValue(null);
    await expect(mintProfilbildCanvas(CUTOUT, 'Profilbild')).rejects.toThrow(
      'Bild konnte nicht hochgeladen werden.'
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe('Bild-Editor „Profilbild" mode', () => {
  it('cuts the photo out, keeps the cut-out as a version and opens the canvas', async () => {
    persist(photo);
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('profilbild'));
    await act(async () => {
      await result.current.submit('');
    });

    expect(removeBg).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]?.[0].body.initial_state).toEqual({ transparentImage: MEDIA_URL });
    expect(opened).toEqual(['canvas-1']);
  });

  it('reuses an already cut-out version instead of removing the background again', async () => {
    persist({ ...photo, image: CUTOUT, kind: 'nobg' });
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('profilbild'));
    await act(async () => {
      await result.current.submit('');
    });

    expect(removeBg).not.toHaveBeenCalled();
    expect(opened).toEqual(['canvas-1']);
  });

  it('does nothing without a photo', async () => {
    const { result } = renderHook(() => useBildEditorV2(), { wrapper: wrapper() });
    act(() => result.current.setMode('profilbild'));
    let committed = true;
    await act(async () => {
      committed = await result.current.submit('');
    });

    expect(committed).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
