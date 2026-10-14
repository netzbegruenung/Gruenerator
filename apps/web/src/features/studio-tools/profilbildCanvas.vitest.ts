import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderSharepicToImage } from '../image-studio/renderSharepicToImage';
import { updateCanvasThumbnail } from '../image-studio/services/canvasThumbnailService';
import { uploadBlobToMediaLibrary } from '../image-studio/services/mediaUploadService';

import { mintProfilbildCanvas } from './profilbildCanvas';

const create =
  vi.fn<(args: { body: Record<string, unknown> }) => Promise<{ status: number; body: unknown }>>();
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ canvas: { create } }),
}));
vi.mock('../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaLibrary: vi.fn(),
}));
vi.mock('../image-studio/renderSharepicToImage', () => ({ renderSharepicToImage: vi.fn() }));
vi.mock('../image-studio/services/canvasThumbnailService', () => ({
  updateCanvasThumbnail: vi.fn(),
}));

const upload = vi.mocked(uploadBlobToMediaLibrary);
const renderThumb = vi.mocked(renderSharepicToImage);
const updateThumb = vi.mocked(updateCanvasThumbnail);

const CUTOUT = 'data:image/png;base64,Q1VUT1VU';
const MEDIA_URL = '/api/share/media-1/download';
const THUMB = 'data:image/png;base64,VEhVTUI=';

beforeEach(() => {
  // MSW rejects every unhandled request; jsdom's Blob is not the one undici's Response accepts.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(
      Object.assign(new Response(null), {
        blob: () => Promise.resolve(new Blob(['x'], { type: 'image/png' })),
      })
    )
  );
  create.mockReset();
  create.mockResolvedValue({ status: 201, body: { id: 'canvas-1' } });
  upload.mockReset();
  upload.mockResolvedValue(MEDIA_URL);
  renderThumb.mockReset();
  renderThumb.mockResolvedValue(THUMB);
  updateThumb.mockReset();
  updateThumb.mockResolvedValue();
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

  it('carries a chosen background colour into the initial state', async () => {
    await mintProfilbildCanvas(CUTOUT, 'Profilbild', '#46962b');

    expect(create.mock.calls[0]?.[0].body.initial_state).toEqual({
      transparentImage: MEDIA_URL,
      backgroundColor: '#46962b',
    });
  });

  it('carries the avatar position and size into the initial state', async () => {
    const layout = { imagePosition: { x: 120, y: 80 }, imageSize: { w: 840, h: 1000 } };
    await mintProfilbildCanvas(CUTOUT, 'Profilbild', '#46962b', layout);

    expect(create.mock.calls[0]?.[0].body.initial_state).toEqual({
      transparentImage: MEDIA_URL,
      backgroundColor: '#46962b',
      ...layout,
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
