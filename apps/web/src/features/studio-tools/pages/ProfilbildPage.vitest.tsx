import { PRIDE_STRIPES } from '@gruenerator/shared/profilbild';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { axe } from '../../../test-utils';
import { downloadDataUrl } from '../../../utils/downloadFile';
import { removeImageBackground } from '../../image-studio/services/imageEditingService';
import { fileToDownscaledDataUrl } from '../../image-studio/utils/downscaleImage';
import { mintProfilbildCanvas } from '../profilbildCanvas';
import { setProfilbildHandoff, PROFILBILD_HANDOFF_STATE } from '../profilbildHandoff';
import {
  composeProfilbild,
  loadImage,
  renderProfilbildBackground,
} from '../utils/composeProfilbild';

import ProfilbildPage from './ProfilbildPage';

vi.mock('@gruenerator/ui', async () => {
  const actual = await vi.importActual('@gruenerator/ui');
  return {
    ...actual,
    UploadZone: ({ onFileSelected }: { onFileSelected: (f: File) => void }) => (
      <button
        type="button"
        onClick={() => onFileSelected(new File(['x'], 'a.png', { type: 'image/png' }))}
      >
        upload
      </button>
    ),
  };
});
vi.mock('../../image-studio/services/imageEditingService', () => ({
  removeImageBackground: vi.fn(),
}));
vi.mock('../../image-studio/utils/downscaleImage', () => ({
  fileToDownscaledDataUrl: vi.fn(),
}));
vi.mock('../profilbildCanvas', () => ({
  mintProfilbildCanvas: vi.fn(),
}));
vi.mock('../../image-studio/canvasQuery', () => ({ seedCanvasQuery: vi.fn() }));
interface SavedUpdate {
  shareToken: string;
  metadata: { profilbild: { background: unknown } };
}

const share = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn<(params: SavedUpdate) => Promise<{ shareToken: string }>>(),
  getMyShare: vi.fn(),
  apiGet: vi.fn(),
  upload: vi.fn(),
}));
vi.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({ createImageShare: share.create, updateImageShare: share.update }),
}));
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({ sharesRead: { getMyShare: share.getMyShare } }),
}));
vi.mock('../../../components/utils/apiClient', () => ({ default: { get: share.apiGet } }));
vi.mock('../../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaLibrary: share.upload,
}));
vi.mock('../../../utils/downloadFile', () => ({ downloadDataUrl: vi.fn() }));
vi.mock('../../../components/common/PageContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const hit = vi.hoisted(() => ({
  node: {
    width: () => 600,
    height: () => 800,
    cache: vi.fn(),
    drawHitFromCache: vi.fn(),
    clearCache: vi.fn(),
    getLayer: () => null,
  },
}));

vi.mock('react-konva', () => {
  const Node = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return {
    Stage: ({ children }: { children?: React.ReactNode }) => (
      <div data-testid="konva-stage">{children}</div>
    ),
    Layer: Node,
    Image: forwardRef((_props: unknown, ref) => {
      useImperativeHandle(ref, () => hit.node);
      return null;
    }),
    Rect: () => null,
    Line: () => null,
    Circle: () => null,
    Transformer: () => null,
  };
});
vi.mock('../utils/composeProfilbild', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  composeProfilbild: vi.fn(() => ({ toDataURL: () => 'data:image/png;base64,OUT' })),
  renderProfilbildBackground: vi.fn(() => ({})),
  trimCutout: vi.fn((image: unknown) => ({ image, dataUrl: 'data:image/png;base64,TRIM' })),
  loadImage: vi.fn((src: string) => Promise.resolve({ src, width: 600, height: 800 })),
}));

const mockRemove = vi.mocked(removeImageBackground);
const mockCompose = vi.mocked(composeProfilbild);
const mockBackground = vi.mocked(renderProfilbildBackground);
const CUTOUT = 'data:image/png;base64,CUT';

const renderPage = (state: unknown = null, search = '') =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[{ pathname: '/studio/profilbild', search, state }]}>
        <Routes>
          <Route path="/studio/profilbild" element={<ProfilbildPage />} />
          <Route path="/studio/canvas/:id" element={<div>canvas page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

const renderHandoff = () => {
  setProfilbildHandoff(CUTOUT);
  return renderPage(PROFILBILD_HANDOFF_STATE);
};

const lastBackground = () => mockBackground.mock.calls.at(-1)?.[0];

// Radix Tabs switch on mousedown, not click
const openTab = (name: string) => {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
  fireEvent.click(tab);
  return tab;
};

const downloadAndGetCompose = async () => {
  const button = await screen.findByRole('button', { name: 'Herunterladen' });
  await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
  mockCompose.mockClear();
  fireEvent.click(button);
  return mockCompose.mock.calls.at(-1)?.[0];
};

describe('ProfilbildPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fileToDownscaledDataUrl).mockResolvedValue('data:image/jpeg;base64,SMALL');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }))
    );
    URL.createObjectURL = vi.fn(() => 'blob:orig');
    URL.revokeObjectURL = vi.fn();
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,OUT');
    useAuthStore.setState({ locale: 'de-DE' });
    share.create.mockResolvedValue({ shareToken: 'tok1' });
    share.update.mockResolvedValue({ shareToken: 'tok1' });
    share.apiGet.mockResolvedValue({ data: new Blob(['x'], { type: 'image/png' }) });
    share.upload.mockResolvedValue('/api/share/bg1/download');
  });

  it('saves a download under „Zuletzt“ and updates it on the next one', async () => {
    renderHandoff();
    await downloadAndGetCompose();
    await waitFor(() => expect(share.create).toHaveBeenCalledTimes(1));
    expect(share.create).toHaveBeenCalledWith({
      imageData: 'data:image/png;base64,OUT',
      title: 'Profilbild',
      imageType: 'profilbild',
      contentOrigin: 'sharepic',
      originalImage: 'data:image/png;base64,TRIM',
      status: 'ready',
      metadata: {
        source: 'profilbild',
        profilbild: {
          v: 1,
          person: { x: 196, y: 162, scale: 0.85 },
          background: { kind: 'id', id: 'tanne' },
          stickers: [],
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Klee' }));
    await downloadAndGetCompose();
    await waitFor(() => expect(share.update).toHaveBeenCalledTimes(1));
    expect(share.create).toHaveBeenCalledTimes(1);
    expect(share.update.mock.calls[0]?.[0]).toMatchObject({
      shareToken: 'tok1',
      metadata: { profilbild: { background: { kind: 'id', id: 'klee' } } },
    });
    expect(share.update.mock.calls[0]?.[0]).not.toHaveProperty('originalImage');
  });

  describe('autosave', () => {
    const SETTLE = { timeout: 4000 };
    const savedKlee = {
      status: 200,
      body: {
        share: {
          imageMetadata: {
            profilbild: {
              v: 1,
              person: { x: 100, y: 300, scale: 0.9 },
              background: { kind: 'id', id: 'klee' },
              stickers: [],
            },
          },
        },
      },
    };

    it('saves a new Profilbild after a pause and updates it on the next change', async () => {
      renderHandoff();
      await screen.findByTestId('konva-stage');
      await waitFor(() => expect(share.create).toHaveBeenCalledTimes(1), SETTLE);
      expect(downloadDataUrl).not.toHaveBeenCalled();
      expect(await screen.findByText('Unter „Zuletzt“ gespeichert')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Klee' }));
      await waitFor(() => expect(share.update).toHaveBeenCalledTimes(1), SETTLE);
      expect(share.create).toHaveBeenCalledTimes(1);
      expect(share.update.mock.calls[0]?.[0]).toMatchObject({
        shareToken: 'tok1',
        metadata: { profilbild: { background: { kind: 'id', id: 'klee' } } },
      });
    });

    it('does not save a reopened Profilbild until it is changed', async () => {
      share.getMyShare.mockResolvedValue(savedKlee);
      renderPage(null, '?share=tok9');
      const klee = await screen.findByRole('button', { name: 'Klee' });
      await new Promise((resolve) => setTimeout(resolve, 2200));
      expect(share.update).not.toHaveBeenCalled();
      expect(share.create).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Tanne' }));
      expect(klee.getAttribute('aria-pressed')).toBe('false');
      await waitFor(() => expect(share.update).toHaveBeenCalledTimes(1), SETTLE);
      expect(share.update.mock.calls[0]?.[0].shareToken).toBe('tok9');
    });

    it('keeps a change made just before leaving', async () => {
      share.getMyShare.mockResolvedValue(savedKlee);
      const view = renderPage(null, '?share=tok9');
      await screen.findByRole('button', { name: 'Klee' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      fireEvent.click(screen.getByRole('button', { name: 'Tanne' }));
      view.unmount();
      await waitFor(() => expect(share.update).toHaveBeenCalledTimes(1));
    });

    it('says so when saving fails', async () => {
      share.create.mockRejectedValue(new Error('offline'));
      renderHandoff();
      expect(await screen.findByText(/Nicht gespeichert/, undefined, SETTLE)).toBeTruthy();
    });
  });

  it('stores an own background photo once and saves its URL', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    fireEvent.change(screen.getByTestId('profilbild-background-input'), {
      target: { files: [new File(['p'], 'wiese.jpg', { type: 'image/jpeg' })] },
    });
    await waitFor(() =>
      expect(lastBackground()).toMatchObject({ kind: 'image', image: { src: 'blob:orig' } })
    );
    await downloadAndGetCompose();
    await waitFor(() => expect(share.create).toHaveBeenCalledTimes(1));
    await downloadAndGetCompose();
    await waitFor(() => expect(share.update).toHaveBeenCalledTimes(1));
    expect(share.upload).toHaveBeenCalledTimes(1);
    expect(share.upload.mock.calls[0]?.[1]).toMatchObject({
      uploadSource: 'profilbild-background',
    });
    expect(share.update.mock.calls[0]?.[0].metadata.profilbild.background).toEqual({
      kind: 'custom',
      url: '/api/share/bg1/download',
    });
  });

  it('tells the person when the download worked but saving did not', async () => {
    share.create.mockRejectedValue(new Error('offline'));
    renderHandoff();
    await downloadAndGetCompose();
    expect(
      await screen.findByText(/nicht unter „Zuletzt“|gespeichert werden konnte es aber nicht/)
    ).toBeTruthy();
    expect(downloadDataUrl).toHaveBeenCalled();
  });

  it('reopens a saved Profilbild with its placement, background and stickers', async () => {
    share.getMyShare.mockResolvedValue({
      status: 200,
      body: {
        share: {
          imageMetadata: {
            profilbild: {
              v: 1,
              person: { x: 100, y: 300, scale: 0.9 },
              background: { kind: 'id', id: 'klee' },
              stickers: [{ id: 'vielfalt', x: 500, y: 600, width: 200, height: 100, rotation: 30 }],
            },
          },
        },
      },
    });
    renderPage(null, '?share=tok9');
    const klee = await screen.findByRole('button', { name: 'Klee' });
    expect(klee.getAttribute('aria-pressed')).toBe('true');
    expect(share.getMyShare).toHaveBeenCalledWith({ params: { shareToken: 'tok9' } });
    expect(share.apiGet).toHaveBeenCalledWith('/share/tok9/original', { responseType: 'blob' });
    await screen.findByRole('button', { name: 'Vielfalt entfernen' });

    const opts = await downloadAndGetCompose();
    expect(opts?.position).toEqual({ x: 100, y: 300 });
    expect(opts?.scale).toBe(0.9);
    expect(opts?.stickers).toMatchObject([{ x: 500, y: 600, width: 200, rotation: 30 }]);
    await waitFor(() => expect(share.update).toHaveBeenCalledTimes(1));
    expect(share.update.mock.calls[0]?.[0].shareToken).toBe('tok9');
    expect(share.create).not.toHaveBeenCalled();
  });

  it('reopens a shop sticker from its share path and saves it with that path', async () => {
    const shop = {
      id: 'asset:0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
      src: '/api/share/0123456789abcdef0123456789abcdef/download',
      x: 300,
      y: 400,
      width: 150,
      height: 150,
      rotation: 0,
    };
    const system = { id: 'vielfalt', x: 500, y: 600, width: 200, height: 100, rotation: 30 };
    share.getMyShare.mockResolvedValue({
      status: 200,
      body: {
        share: {
          imageMetadata: {
            profilbild: {
              v: 1,
              person: { x: 100, y: 300, scale: 0.9 },
              background: { kind: 'id', id: 'klee' },
              stickers: [shop, system],
            },
          },
        },
      },
    });
    renderPage(null, '?share=tok9');
    await screen.findByRole('button', { name: 'Sticker entfernen' });
    expect(share.apiGet).toHaveBeenCalledWith('/share/0123456789abcdef0123456789abcdef/download', {
      responseType: 'blob',
    });

    await downloadAndGetCompose();
    await waitFor(() => expect(share.update).toHaveBeenCalledTimes(1));
    const saved = share.update.mock.calls[0]?.[0].metadata.profilbild as unknown as {
      stickers: unknown[];
    };
    expect(saved.stickers).toEqual([shop, system]);
  });

  it('says so when a saved Profilbild cannot be reopened', async () => {
    share.getMyShare.mockResolvedValue({ status: 404, body: { success: false } });
    renderPage(null, '?share=gone');
    expect(await screen.findByText('Dieses Profilbild konnte nicht geöffnet werden.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Neues Profilbild' }));
    expect(await screen.findByText('upload')).toBeTruthy();
  });

  it('starts directly with a handed-over cut-out', async () => {
    renderHandoff();
    expect(await screen.findByRole('button', { name: 'Tanne' })).toBeTruthy();
    expect(screen.queryByText('upload')).toBeNull();
    expect(mockRemove).not.toHaveBeenCalled();
    expect(await screen.findByTestId('konva-stage')).toBeTruthy();
    expect(lastBackground()).toEqual({ kind: 'color', color: '#005538' });
  });

  it('falls back to the upload when the handoff slot is empty (reload)', async () => {
    renderPage(PROFILBILD_HANDOFF_STATE);
    expect(await screen.findByText('upload')).toBeTruthy();
  });

  it('takes the handoff only once', async () => {
    setProfilbildHandoff(CUTOUT);
    const first = renderPage(PROFILBILD_HANDOFF_STATE);
    await screen.findByRole('button', { name: 'Tanne' });
    first.unmount();
    renderPage(PROFILBILD_HANDOFF_STATE);
    expect(await screen.findByText('upload')).toBeTruthy();
  });

  it('downscales the photo before removing the background', async () => {
    mockRemove.mockResolvedValue({ file: new File([], 'x'), objectUrl: 'blob:x', base64: CUTOUT });
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    await screen.findByRole('button', { name: 'Klee' });
    expect(fileToDownscaledDataUrl).toHaveBeenCalledTimes(1);
    expect(mockRemove.mock.calls[0]?.[0].name).toBe('a.png');
  });

  it('hints that a gradient reaches the canvas flattened', async () => {
    renderHandoff();
    await screen.findByRole('button', { name: 'Tanne' });
    expect(screen.queryByText(/als Ganzes übernommen/)).toBeNull();
    openTab('Verläufe');
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    expect(
      screen.getByText(
        'Im Canvas wird das Bild als Ganzes übernommen – Person und Sticker sind dort nicht mehr einzeln verschiebbar.'
      )
    ).toBeTruthy();
  });

  it('restricts the person hit area to visible pixels', async () => {
    hit.node.cache.mockClear();
    hit.node.drawHitFromCache.mockClear();
    renderHandoff();
    await screen.findByTestId('konva-stage');
    expect(hit.node.cache).toHaveBeenCalled();
    expect(hit.node.drawHitFromCache).toHaveBeenCalled();
  });

  it('has no axe violations in the editor', async () => {
    const { container } = renderHandoff();
    await screen.findByTestId('konva-stage');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('uploads, removes the background and shows the swatches', async () => {
    mockRemove.mockResolvedValue({
      file: new File([], 'x'),
      objectUrl: 'blob:x',
      base64: CUTOUT,
    });
    renderPage();
    fireEvent.click(screen.getByText('upload'));
    expect(await screen.findByRole('button', { name: 'Klee' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Vollfarben',
      'Verläufe',
      'Vorlagen',
      'Eigenes Bild',
    ]);
    openTab('Verläufe');
    expect(screen.getByRole('button', { name: 'Verlauf Tanne zu Klee' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Klee' })).toBeNull();
    openTab('Eigenes Bild');
    expect(screen.getByRole('button', { name: 'Bild hochladen' })).toBeTruthy();
  });

  it('re-renders with the clicked swatch and marks it pressed', async () => {
    renderHandoff();
    const klee = await screen.findByRole('button', { name: 'Klee' });
    await waitFor(() => expect(mockBackground).toHaveBeenCalled());
    fireEvent.click(klee);
    expect(klee.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Tanne' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
    expect(lastBackground()).toEqual({ kind: 'color', color: '#46962b' });

    openTab('Verläufe');
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    expect(lastBackground()).toMatchObject({ kind: 'gradient' });
  });

  it('scales the person around its bottom centre with the size slider', async () => {
    renderHandoff();
    const slider = await screen.findByLabelText(/Größe/);
    await waitFor(() => expect(slider.hasAttribute('disabled')).toBe(false));
    fireEvent.change(slider, { target: { value: '100' } });
    const opts = await downloadAndGetCompose();
    expect(opts?.scale).toBe(1);
    // 600×800 cut-out at 100 % → 810×1080; bottom stays at 1080, centre within half a pixel
    expect(opts?.position).toEqual({ x: 136, y: 0 });
  });

  it('downloads the composed 1080 image as profilbild.png', async () => {
    renderHandoff();
    const opts = await downloadAndGetCompose();
    expect(opts?.position).toEqual({ x: 196, y: 162 });
    expect(opts?.size).toBeUndefined();
    expect(downloadDataUrl).toHaveBeenCalledWith('data:image/png;base64,OUT', 'profilbild.png');
  });

  it('nudges the person with the arrow keys and re-centres it', async () => {
    renderHandoff();
    const mover = await screen.findByRole('application', {
      name: 'Person verschieben – Pfeiltasten',
    });
    await screen.findByTestId('konva-stage');
    fireEvent.keyDown(mover, { key: 'ArrowLeft' });
    fireEvent.keyDown(mover, { key: 'ArrowUp', shiftKey: true });
    // Shift = 10 × the step; the left nudge leaves the centre guide instead of snapping back
    expect((await downloadAndGetCompose())?.position).toEqual({ x: 186, y: 62 });

    fireEvent.click(screen.getByRole('button', { name: 'Zentrieren' }));
    expect((await downloadAndGetCompose())?.position).toEqual({ x: 196, y: 162 });
  });

  it('hands the chosen colour to the canvas', async () => {
    vi.mocked(mintProfilbildCanvas).mockResolvedValue({ id: 'c1' } as never);
    renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Himmel' }));
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    expect(await screen.findByText('canvas page')).toBeTruthy();
    const [url, title, color, layout] = vi.mocked(mintProfilbildCanvas).mock.calls[0] ?? [];
    expect([url, title, color]).toEqual(['data:image/png;base64,TRIM', 'Profilbild', '#0088cc']);
    expect(layout?.imageSize.w).toBeGreaterThan(0);
    expect(layout?.imagePosition.y).toBeGreaterThanOrEqual(0);
  });

  const FULL_SHEET = { imagePosition: { x: 0, y: 0 }, imageSize: { w: 1080, h: 1080 } };

  it('hands a gradient to the canvas as the composed image', async () => {
    vi.mocked(mintProfilbildCanvas).mockResolvedValue({ id: 'c2' } as never);
    renderHandoff();
    await screen.findByTestId('konva-stage');
    openTab('Verläufe');
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    mockCompose.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    expect(await screen.findByText('canvas page')).toBeTruthy();
    expect(mintProfilbildCanvas).toHaveBeenCalledWith(
      'data:image/png;base64,OUT',
      'Profilbild',
      undefined,
      FULL_SHEET
    );
    expect(mockCompose.mock.calls.at(-1)?.[0].background).toMatchObject({ kind: 'gradient' });
  });

  it('hands a plain colour with stickers to the canvas as movable elements', async () => {
    vi.mocked(mintProfilbildCanvas).mockResolvedValue({ id: 'c3' } as never);
    renderHandoff();
    await screen.findByTestId('konva-stage');
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    await screen.findByRole('button', { name: 'Vielfalt entfernen' });
    expect(screen.queryByText(/als Ganzes übernommen/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    expect(await screen.findByText('canvas page')).toBeTruthy();
    const [url, , color, , assets] = vi.mocked(mintProfilbildCanvas).mock.calls[0] ?? [];
    expect(url).toBe('data:image/png;base64,TRIM');
    expect(color).toBeTruthy();
    expect(assets).toHaveLength(1);
    expect(assets?.[0]).toMatchObject({ assetId: 'vielfalt', rotation: 0, opacity: 1 });
    expect(assets?.[0]?.scale).toBeGreaterThan(0);
  });

  it('switches between round, square and Instagram previews', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const pressed = (name: string) =>
      screen.getByRole('button', { name }).getAttribute('aria-pressed');
    expect([pressed('Rund'), pressed('Quadrat'), pressed('Instagram')]).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(screen.getByText(/Vorschau rund wie in sozialen Netzwerken/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Quadrat' }));
    expect(pressed('Quadrat')).toBe('true');
    expect(pressed('Rund')).toBe('false');
    expect(screen.getByText(/Der Download bleibt quadratisch/)).toBeTruthy();
    expect(screen.getByTestId('konva-stage')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Vorschau als Instagram-Profilbild' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(pressed('Instagram')).toBe('true');
    const mock = screen.getByRole('img', { name: 'Vorschau als Instagram-Profilbild' });
    expect(mock.textContent).toContain('So sieht es auf Instagram aus');
    expect(mock.textContent).toContain('dein.name');
    expect(screen.queryByTestId('konva-stage')).toBeNull();
    expect(
      screen.queryByRole('application', { name: 'Person verschieben – Pfeiltasten' })
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Herunterladen' })).toBeTruthy();
  });

  it('has no axe violations in the Instagram preview', async () => {
    const { container } = renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Instagram' }));
    await screen.findByRole('img', { name: 'Vorschau als Instagram-Profilbild' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('offers Austrian colours to de-AT users', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    renderHandoff();
    const dunkel = await screen.findByRole('button', { name: 'Dunkelgrün' });
    expect(dunkel.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Tanne' })).toBeNull();
    await waitFor(() => expect(lastBackground()).toEqual({ kind: 'color', color: '#257639' }));
  });

  it('offers no German sunflower stickers to de-AT users', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    renderHandoff();
    await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' });
    expect(screen.queryByRole('button', { name: /^Sticker Sonnenblume/ })).toBeNull();
  });

  it('falls back to the first colour of the new palette when the locale switches', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    expect(screen.getByRole('button', { name: 'Tanne' }).getAttribute('aria-pressed')).toBe('true');
    act(() => useAuthStore.setState({ locale: 'de-AT' }));
    const dunkel = await screen.findByRole('button', { name: 'Dunkelgrün' });
    expect(dunkel.getAttribute('aria-pressed')).toBe('true');
    expect(lastBackground()).toEqual({ kind: 'color', color: '#257639' });
    expect(screen.getByTestId('konva-stage')).toBeTruthy();
  });

  it('re-resolves a locale-specific Vorlage when the locale switches', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    openTab('Vorlagen');
    fireEvent.click(screen.getByRole('button', { name: 'Tanne mit Logo' }));
    await waitFor(() =>
      expect(lastBackground()).toMatchObject({
        overlays: [{ image: { src: '/gruene-de-logo-weiss.png' } }],
      })
    );
    act(() => useAuthStore.setState({ locale: 'de-AT' }));
    await waitFor(() =>
      expect(lastBackground()).toMatchObject({
        base: { kind: 'color', color: '#257639' },
        overlays: [{ image: { src: '/gruene-at-logo-weiss.png' } }],
      })
    );
    expect(
      screen.getByRole('button', { name: 'Dunkelgrün mit Logo' }).getAttribute('aria-pressed')
    ).toBe('true');
  });

  it('lets a swatch click cancel a still-loading Vorlage', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    let release: (img: unknown) => void = () => {};
    vi.mocked(loadImage).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)) as never
    );
    openTab('Vorlagen');
    const tile = screen.getByRole('button', { name: 'Sand mit grüner Sonnenblume' });
    fireEvent.click(tile);

    openTab('Vollfarben');
    const klee = screen.getByRole('button', { name: 'Klee' });
    fireEvent.click(klee);
    await act(async () => release({ src: '/sonnenblume_gruen.png', width: 10, height: 10 }));

    expect(klee.getAttribute('aria-pressed')).toBe('true');
    expect(lastBackground()).toEqual({ kind: 'color', color: '#46962b' });
  });

  it('applies a Vorlage with its base colour and overlay', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    openTab('Vorlagen');
    const tile = screen.getByRole('button', { name: 'Klee mit Sonnenblume in der Ecke' });
    fireEvent.click(tile);
    await waitFor(() => expect(tile.getAttribute('aria-pressed')).toBe('true'));
    expect(lastBackground()).toMatchObject({
      kind: 'preset',
      base: { kind: 'color', color: '#46962b' },
      overlays: [
        {
          image: { src: '/images/Sonnenblume_RGB_gelb.png' },
          x: 0.88,
          y: 0.12,
          width: 0.3,
          opacity: 1,
        },
      ],
    });
    expect(screen.getByText(/als Ganzes übernommen/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pride' }));
    await waitFor(() =>
      expect(lastBackground()).toEqual({
        kind: 'preset',
        base: { kind: 'stripes', colors: PRIDE_STRIPES },
        overlays: [],
      })
    );
    expect((await downloadAndGetCompose())?.background).toMatchObject({ kind: 'preset' });
  });

  it('adds, nudges, selects and removes stickers', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker #teamgrün hinzufügen' }));
    const mover = await screen.findByRole('application', {
      name: 'Sticker verschieben – Pfeiltasten, Entf löscht',
    });
    // 270 × 1.6 = 432 wide on a 600×800 mocked image → 576 tall; starts low right, clear of the face
    let opts = await downloadAndGetCompose();
    expect(opts?.stickers).toEqual([
      expect.objectContaining({ width: 432, height: 576, rotation: 0 }),
    ]);
    expect(opts?.stickers?.[0]?.x).toBeCloseTo(734.4);
    expect(opts?.stickers?.[0]?.y).toBeCloseTo(777.6);

    fireEvent.keyDown(mover, { key: 'ArrowRight', shiftKey: true });
    fireEvent.click(screen.getByRole('button', { name: 'Sticker Regenbogen hinzufügen' }));
    await waitFor(() => expect(mockBackground).toHaveBeenCalled());
    await screen.findByRole('application', {
      name: 'Sticker verschieben – Pfeiltasten, Entf löscht',
    });
    opts = await downloadAndGetCompose();
    expect(opts?.stickers?.map((s) => [Math.round(s.x), Math.round(s.y)])).toEqual([
      [834, 778],
      [694, 738],
    ]);

    fireEvent.keyDown(mover, { key: 'Delete' });
    await waitFor(async () => expect((await downloadAndGetCompose())?.stickers).toHaveLength(1));

    fireEvent.keyDown(mover, { key: 'Escape' });
    expect(
      screen.getByRole('application', { name: 'Person verschieben – Pfeiltasten' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sticker entfernen' })).toBeNull();
  });

  it('selects, scales, rotates and removes layers by keyboard and announces it', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const mover = screen.getByRole('application', { name: 'Person verschieben – Pfeiltasten' });
    const live = () => mover.parentElement?.querySelector('[aria-live="polite"]')?.textContent;
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    const person = screen.getByRole('button', { name: 'Person' });
    const second = await screen.findByRole('button', { name: 'Vielfalt 2' });
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(person.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Vielfalt' }));
    expect(screen.getByRole('button', { name: 'Vielfalt' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    fireEvent.keyDown(mover, { key: ']' });
    expect(live()).toBe('Vielfalt gedreht: 15°');
    fireEvent.keyDown(mover, { key: '[' });
    fireEvent.keyDown(mover, { key: '[' });
    fireEvent.keyDown(mover, { key: '+' });
    let opts = await downloadAndGetCompose();
    // 270 × 1.1 = 297 wide → × 1.1
    expect(opts?.stickers?.[0]).toMatchObject({ rotation: -15 });
    expect(opts?.stickers?.[0]?.width).toBeCloseTo(326.7);
    await waitFor(() => expect(live()).toBe('Vielfalt vergrößert: 327 px breit'));

    fireEvent.click(person);
    expect(person.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(mover, { key: '+' });
    opts = await downloadAndGetCompose();
    expect(opts?.scale).toBe(0.9);
    await waitFor(() => expect(live()).toBe('Person vergrößert: 90 %'));
    fireEvent.keyDown(mover, { key: ']' });
    expect((await downloadAndGetCompose())?.stickers?.[0]).toMatchObject({ rotation: -15 });

    fireEvent.click(screen.getByRole('button', { name: 'Vielfalt 2 entfernen' }));
    opts = await downloadAndGetCompose();
    expect(opts?.stickers).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Vielfalt 2' })).toBeNull();
    await waitFor(() => expect(live()).toBe('Vielfalt 2 entfernt'));
  });

  it('announces arrow nudges and shows the shortcuts', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const mover = screen.getByRole('application', { name: 'Person verschieben – Pfeiltasten' });
    expect(screen.getByText(/Tastatur: Pfeile verschieben/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    await screen.findByRole('button', { name: 'Vielfalt entfernen' });
    fireEvent.keyDown(mover, { key: 'ArrowRight' });
    expect(mover.parentElement?.querySelector('[aria-live="polite"]')?.textContent).toBe(
      'Vielfalt nach rechts verschoben'
    );
  });

  it('removes the selected sticker with the Entfernen button', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker entfernen' }));
    expect((await downloadAndGetCompose())?.stickers).toEqual([]);
    expect(screen.getByRole('button', { name: 'Zentrieren' })).toBeTruthy();
  });

  it('has no axe violations with the Vorlagen tab and a sticker', async () => {
    const { container } = renderHandoff();
    await screen.findByTestId('konva-stage');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sticker Regenbogen-Herz hinzufügen' })
    );
    await screen.findByRole('button', { name: 'Sticker entfernen' });
    openTab('Vorlagen');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('returns to the upload on "Anderes Foto"', async () => {
    renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Anderes Foto' }));
    expect(await screen.findByText('upload')).toBeTruthy();
  });
});
