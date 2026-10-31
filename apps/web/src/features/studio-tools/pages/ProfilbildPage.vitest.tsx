import { PRIDE_STRIPES, type SavedProfilbild } from '@gruenerator/shared/profilbild';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { item as marketplaceItem } from '../../../test/marketplaceFixtures';
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
    UploadZone: ({
      onFileSelected,
      subtitle,
    }: {
      onFileSelected: (f: File) => void;
      subtitle?: string;
    }) => (
      <>
        <button
          type="button"
          onClick={() => onFileSelected(new File(['x'], 'a.png', { type: 'image/png' }))}
        >
          upload
        </button>
        <p>{subtitle}</p>
      </>
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
  recentShares: vi.fn(),
  apiGet: vi.fn(),
  upload: vi.fn(),
  uploadShare: vi.fn(),
  listAssets: vi.fn(),
  listMarketplace: vi.fn(),
  createAsset: vi.fn(),
  prepare: vi.fn(),
}));
vi.mock('@gruenerator/shared/share', () => ({
  useShareStore: () => ({ createImageShare: share.create, updateImageShare: share.update }),
}));
vi.mock('@gruenerator/shared/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getContractsClient: () => ({
    sharesRead: { getMyShare: share.getMyShare, recentShares: share.recentShares },
    studioAssets: { list: share.listAssets, create: share.createAsset },
    marketplace: { list: share.listMarketplace },
  }),
}));
vi.mock('../../../components/utils/apiClient', () => ({ default: { get: share.apiGet } }));
vi.mock('../../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaLibrary: share.upload,
  uploadBlobToMediaShare: share.uploadShare,
}));
vi.mock('../../studio-assets/backgroundImage', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  prepareBackgroundImage: share.prepare,
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
    // Only stickers carry a rotation: they show up as nodes the tests can count.
    Image: forwardRef((props: { rotation?: number }, ref) => {
      useImperativeHandle(ref, () => hit.node);
      return props.rotation === undefined ? null : <span data-testid="konva-sticker" />;
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
  renderProfilbildBackground: vi.fn(() => ({ toDataURL: () => 'data:image/jpeg;base64,BG' })),
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

const stickersOnStage = (count: number) =>
  waitFor(() => expect(screen.queryAllByTestId('konva-sticker')).toHaveLength(count));

/** What the stage last announced to screen readers. */
const live = () => document.querySelector('.sr-only[aria-live="polite"]')?.textContent;

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
    share.listAssets.mockResolvedValue({ status: 200, body: { items: [], hasMore: false } });
    share.recentShares.mockResolvedValue({ status: 200, body: { shares: [] } });
  });

  const recent = (token: string, createdAt: string) => ({
    shareToken: token,
    createdAt,
    thumbnailUrl: `/api/thumbs/media/${token}.webp`,
  });

  it('offers the last saved Profilbilder and reopens one', async () => {
    share.recentShares.mockResolvedValue({
      status: 200,
      body: {
        shares: [recent('tok-a', '2026-10-14T09:00:00Z'), recent('tok-b', '2026-10-02T09:00:00Z')],
      },
    });
    share.getMyShare.mockResolvedValue({ status: 404, body: { success: false } });
    renderPage();

    const nav = await screen.findByRole('navigation', { name: 'Deine Profilbilder' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([
      'Profilbild vom 14.10. öffnen',
      'Profilbild vom 02.10. öffnen',
    ]);
    expect(share.recentShares).toHaveBeenCalledWith({
      query: { editor: 'profilbild', limit: '3' },
    });

    fireEvent.click(links[0]);
    await waitFor(() =>
      expect(share.getMyShare).toHaveBeenCalledWith({ params: { shareToken: 'tok-a' } })
    );
    expect(screen.queryByRole('navigation', { name: 'Deine Profilbilder' })).toBeNull();
  });

  it('shows no row without saved Profilbilder or once a photo is in', async () => {
    renderPage();
    await waitFor(() => expect(share.recentShares).toHaveBeenCalled());
    expect(screen.queryByRole('navigation', { name: 'Deine Profilbilder' })).toBeNull();

    share.recentShares.mockResolvedValue({
      status: 200,
      body: { shares: [recent('tok-a', '2026-10-14T09:00:00Z')] },
    });
    renderHandoff();
    await screen.findByTestId('konva-stage');
    expect(screen.queryByRole('navigation', { name: 'Deine Profilbilder' })).toBeNull();
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
    await stickersOnStage(1);

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
    await stickersOnStage(2);
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

  it('keeps a shop sticker that failed to load in the saved Profilbild', async () => {
    const shopSrc = '/api/share/0123456789abcdef0123456789abcdef/download';
    const shop = {
      id: 'asset:0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
      src: shopSrc,
      x: 300,
      y: 400,
      width: 150,
      height: 150,
      rotation: 0,
    };
    const system = { id: 'vielfalt', x: 500, y: 600, width: 200, height: 100, rotation: 30 };
    share.apiGet.mockImplementation((path: string) =>
      path === shopSrc.replace(/^\/api/, '')
        ? Promise.reject(new Error('503'))
        : Promise.resolve({ data: new Blob(['x'], { type: 'image/png' }) })
    );
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
    // The shop sticker that failed to load is kept in the saved state, not drawn.
    await stickersOnStage(1);
    expect(await screen.findByRole('alert')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tanne' }));
    const opts = await downloadAndGetCompose();
    expect(opts?.stickers).toHaveLength(1);
    await waitFor(() => expect(share.update).toHaveBeenCalled());
    const saved = share.update.mock.calls.at(-1)?.[0].metadata.profilbild as unknown as {
      stickers: unknown[];
    };
    expect(saved.stickers).toEqual([system, shop]);
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

  it('opens straight into the editor, with the upload on the stage', async () => {
    renderPage();
    expect(screen.getByText('upload')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Klee' }));
    expect(lastBackground()).toEqual({ kind: 'color', color: '#46962b' });
    // Was ohne Foto nichts tut, steht noch nicht da.
    for (const name of ['Herunterladen', 'Anderes Foto', 'Rund', 'Sticker Teamgrün hinzufügen'])
      expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Grüne Sticker' })).toBeNull();
    expect(screen.queryByLabelText(/Größe der Person/)).toBeNull();
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
    expect(screen.queryByText(/als Ganzes/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    expect(
      screen.getByText(
        '„In Canvas bearbeiten“ übernimmt das Bild als Ganzes – Person und Sticker sind dort nicht mehr einzeln verschiebbar.'
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
    // Keine Reiter: Vorlagen, Farben und Deine stehen untereinander.
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Vorlagen',
      'Farben',
      'Deine',
    ]);
    expect(screen.getByRole('button', { name: 'Verlauf Tanne zu Klee' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Eigenen Hintergrund hochladen/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hintergründe entdecken' })).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: 'Verlauf Himmel zu Tanne' }));
    expect(lastBackground()).toMatchObject({ kind: 'gradient' });
  });

  it('offers one free colour picker that switches between colour and gradient', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    expect(screen.getAllByRole('button', { name: 'Eigene Farbe' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Eigene Farbe' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Verlauf' }));
    expect(lastBackground()).toMatchObject({ kind: 'gradient' });
    expect(screen.getByRole('group', { name: 'Richtung' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Farbe' }));
    expect(lastBackground()).toMatchObject({ kind: 'color' });
    expect(screen.queryByRole('group', { name: 'Richtung' })).toBeNull();
  });

  it('scales the person around its bottom centre with the size slider', async () => {
    renderHandoff();
    const slider = await screen.findByRole('slider', { name: 'Größe der Person' });
    await waitFor(() => expect(slider.getAttribute('aria-valuenow')).toBe('85'));
    for (let i = 0; i < 15; i++) fireEvent.keyDown(slider, { key: 'ArrowRight' });
    const opts = await downloadAndGetCompose();
    expect(opts?.scale).toBe(1);
    // 600×800 cut-out at 100 % → 810×1080; bottom stays at 1080. Each of the 15
    // steps rounds the left edge, so the centre may drift by a pixel.
    expect(opts?.position?.y).toBe(0);
    expect(Math.abs((opts?.position?.x ?? 0) - 136)).toBeLessThanOrEqual(1);
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
    await stickersOnStage(1);
    expect(screen.queryByText(/als Ganzes/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'In Canvas bearbeiten' }));
    expect(await screen.findByText('canvas page')).toBeTruthy();
    const [url, , color, , assets] = vi.mocked(mintProfilbildCanvas).mock.calls[0] ?? [];
    expect(url).toBe('data:image/png;base64,TRIM');
    // The default swatch, Tanne
    expect(color).toBe('#005538');
    // Vielfalt starts at 1080 × 0.25 × 1.1 wide, its image is portrait (600 × 800)
    const width = 1080 * 0.25 * 1.1;
    expect(assets).toEqual([
      expect.objectContaining({
        assetId: 'vielfalt',
        scale: (width * 800) / 600 / 150,
        rotation: 0,
        opacity: 1,
      }),
    ]);
  });

  it('switches between round, square and Instagram previews', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const pressed = (name: string) =>
      screen.getByRole('radio', { name }).getAttribute('aria-checked');
    expect([pressed('Rund'), pressed('Quadrat'), pressed('Instagram')]).toEqual([
      'true',
      'false',
      'false',
    ]);

    fireEvent.click(screen.getByRole('radio', { name: 'Quadrat' }));
    expect(pressed('Quadrat')).toBe('true');
    expect(pressed('Rund')).toBe('false');
    expect(screen.getByTestId('konva-stage')).toBeTruthy();
    expect(screen.queryByRole('img', { name: 'Vorschau als Instagram-Profilbild' })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Instagram' }));
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
    fireEvent.click(await screen.findByRole('radio', { name: 'Instagram' }));
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

  it('offers the big sunflower in several colours and keeps retired Vorlagen reopenable', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const offered = within(screen.getByRole('region', { name: 'Vorlagen' }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(offered).toContain('Klee mit großer Sonnenblume');
    expect(offered).not.toContain('Tanne mit Logo');
    expect(offered).not.toContain('Klee mit Sonnenblume in der Ecke');
  });

  it('reopens a Profilbild saved with a retired Vorlage', async () => {
    share.getMyShare.mockResolvedValue({
      status: 200,
      body: {
        share: {
          imageMetadata: {
            profilbild: {
              v: 1,
              person: { x: 100, y: 300, scale: 0.9 },
              background: { kind: 'id', id: 'logo' },
              stickers: [],
            },
          },
        },
      },
    });
    renderPage(null, '?share=tok9');
    await waitFor(() =>
      expect(lastBackground()).toMatchObject({
        kind: 'preset',
        overlays: [{ image: { src: '/gruene-de-logo-weiss.png' } }],
      })
    );
    expect(screen.getByText('Tanne mit Logo')).toBeTruthy();
  });

  it('lets a swatch click cancel a still-loading Vorlage', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    let release: (img: unknown) => void = () => {};
    vi.mocked(loadImage).mockImplementationOnce(
      () => new Promise((resolve) => (release = resolve)) as never
    );
    const tile = screen.getByRole('button', { name: 'Sand mit großer Sonnenblume' });
    fireEvent.click(tile);

    const klee = screen.getByRole('button', { name: 'Klee' });
    fireEvent.click(klee);
    await act(async () => release({ src: '/sonnenblume_gruen.png', width: 10, height: 10 }));

    expect(klee.getAttribute('aria-pressed')).toBe('true');
    expect(lastBackground()).toEqual({ kind: 'color', color: '#46962b' });
  });

  it('applies a Vorlage with its base colour and overlay', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const tile = screen.getByRole('button', { name: 'Klee mit großer Sonnenblume' });
    fireEvent.click(tile);
    await waitFor(() => expect(tile.getAttribute('aria-pressed')).toBe('true'));
    expect(lastBackground()).toMatchObject({
      kind: 'preset',
      base: { kind: 'color', color: '#46962b' },
      overlays: [
        {
          image: { src: '/sonnenblume_weiss.svg' },
          x: 0.8,
          y: 0.28,
          width: 1,
          opacity: 0.16,
        },
      ],
    });
    expect(screen.getByText(/als Ganzes/)).toBeTruthy();

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

  it('selects, scales, rotates and removes stickers by keyboard and announces it', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const mover = screen.getByRole('application', { name: 'Person verschieben – Pfeiltasten' });
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    await stickersOnStage(2);

    // Space walks Person → Vielfalt → Vielfalt 2; the new sticker starts selected.
    fireEvent.keyDown(mover, { key: ' ' });
    await waitFor(() => expect(live()).toBe('Person ausgewählt'));
    fireEvent.keyDown(mover, { key: ' ' });
    await waitFor(() => expect(live()).toBe('Vielfalt ausgewählt'));
    fireEvent.keyDown(mover, { key: ']' });
    await waitFor(() => expect(live()).toBe('Vielfalt gedreht: 15°'));
    fireEvent.keyDown(mover, { key: '[' });
    fireEvent.keyDown(mover, { key: '[' });
    fireEvent.keyDown(mover, { key: '+' });
    let opts = await downloadAndGetCompose();
    // 270 × 1.1 = 297 wide → × 1.1
    expect(opts?.stickers?.[0]).toMatchObject({ rotation: -15 });
    expect(opts?.stickers?.[0]?.width).toBeCloseTo(326.7);
    await waitFor(() => expect(live()).toBe('Vielfalt vergrößert: 327 px breit'));

    fireEvent.keyDown(mover, { key: 'Escape' });
    fireEvent.keyDown(mover, { key: '+' });
    opts = await downloadAndGetCompose();
    expect(opts?.scale).toBe(0.9);
    await waitFor(() => expect(live()).toBe('Person vergrößert: 90 %'));
    fireEvent.keyDown(mover, { key: ']' });
    expect((await downloadAndGetCompose())?.stickers?.[0]).toMatchObject({ rotation: -15 });

    fireEvent.keyDown(mover, { key: ' ' });
    fireEvent.keyDown(mover, { key: ' ' });
    await waitFor(() => expect(live()).toBe('Vielfalt 2 ausgewählt'));
    fireEvent.click(screen.getByRole('button', { name: 'Sticker entfernen' }));
    await stickersOnStage(1);
    await waitFor(() => expect(live()).toBe('Vielfalt 2 entfernt'));
  });

  it('announces arrow nudges and shows the shortcuts', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    const mover = screen.getByRole('application', { name: 'Person verschieben – Pfeiltasten' });
    expect(screen.getByText(/Leertaste wählt aus, Pfeiltasten bewegen/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    await screen.findByRole('button', { name: 'Sticker entfernen' });
    fireEvent.keyDown(mover, { key: 'ArrowRight' });
    expect(live()).toBe('Vielfalt nach rechts verschoben');
  });

  it('works with a bottom bar, sheets and a long-press preview on the phone', async () => {
    // The matchMedia stub reads the width when a query is asked.
    window.innerWidth = 390;
    try {
      renderHandoff();
      await screen.findByTestId('konva-stage');
      // Phone: no inspector, no shape toggle – the tools sit in the bottom bar.
      expect(screen.queryByRole('radio', { name: 'Rund' })).toBeNull();
      expect(screen.queryByRole('heading', { level: 2, name: 'Sticker' })).toBeNull();
      const tools = screen.getByRole('navigation', { name: 'Werkzeuge' });

      fireEvent.click(within(tools).getByRole('button', { name: 'Sticker' }));
      expect(screen.getByRole('region', { name: 'Sticker' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
      await stickersOnStage(1);
      fireEvent.click(screen.getByRole('button', { name: 'Fertig' }));
      expect(screen.queryByRole('region', { name: 'Sticker' })).toBeNull();

      fireEvent.click(within(tools).getByRole('button', { name: 'Mehr' }));
      expect(screen.getByRole('button', { name: 'Anderes Foto' })).toBeTruthy();
      fireEvent.click(within(tools).getByRole('button', { name: 'Mehr' }));

      const stage = screen.getByRole('application');
      fireEvent.pointerDown(stage, { clientX: 10, clientY: 10 });
      expect(
        await screen.findByRole('img', { name: 'Vorschau als Instagram-Profilbild' })
      ).toBeTruthy();
      fireEvent.pointerUp(stage);
      expect(screen.queryByRole('img', { name: 'Vorschau als Instagram-Profilbild' })).toBeNull();
    } finally {
      window.innerWidth = 1024;
    }
  });

  it('removes the selected sticker with the Entfernen button', async () => {
    renderHandoff();
    await screen.findByTestId('konva-stage');
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker Vielfalt hinzufügen' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sticker entfernen' }));
    expect((await downloadAndGetCompose())?.stickers).toEqual([]);
    expect(screen.getByRole('button', { name: 'Zentrieren' })).toBeTruthy();
  });

  it('has no axe violations with a sticker', async () => {
    const { container } = renderHandoff();
    await screen.findByTestId('konva-stage');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Sticker Regenbogen-Herz hinzufügen' })
    );
    await screen.findByRole('button', { name: 'Sticker entfernen' });
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('gallery', () => {
    const GALLERY_ID = '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10';
    const GALLERY_SRC = '/api/share/0123456789abcdef0123456789abcdef/download';
    const galleryItem = (over: Record<string, unknown> = {}) => ({
      id: GALLERY_ID,
      kind: 'sticker',
      title: 'Sonnenblume',
      tags: [],
      src: GALLERY_SRC,
      thumbUrl: null,
      width: 512,
      height: 256,
      source: 'upload',
      visibility: 'public',
      audience: 'all',
      moderation: 'ok',
      isOfficial: false,
      isOwn: false,
      authorName: 'Kim',
      likesCount: 0,
      liked: false,
      favorited: false,
      createdAt: '2026-10-01T00:00:00.000Z',
      ...over,
    });
    const createdProfilbild = () =>
      (share.create.mock.calls[0]?.[0] as { metadata: { profilbild: SavedProfilbild } } | undefined)
        ?.metadata.profilbild;
    const listOnly = (item: ReturnType<typeof galleryItem>) =>
      share.listAssets.mockImplementation(({ query }: { query: { kind: string } }) =>
        Promise.resolve({
          status: 200,
          body: { items: query.kind === item.kind ? [item] : [], hasMore: false },
        })
      );

    it('adds a sticker from „Entdecken“ and saves it with its share path', async () => {
      listOnly(galleryItem());
      share.listMarketplace.mockResolvedValue({
        status: 200,
        body: {
          sections: [
            { kind: 'sticker', items: [marketplaceItem('sticker', 'Sonnenblume')], hasMore: false },
          ],
        },
      });
      renderHandoff();
      await screen.findByTestId('konva-stage');
      fireEvent.click(screen.getByRole('button', { name: 'Sticker entdecken' }));
      const popup = await screen.findByRole('dialog', { name: 'Sticker entdecken' });
      await waitFor(() =>
        expect(share.listMarketplace).toHaveBeenCalledWith({
          query: expect.objectContaining({ kinds: 'sticker', scope: 'shop' }) as unknown,
        })
      );
      fireEvent.click(await within(popup).findByRole('button', { name: 'Sonnenblume' }));
      await stickersOnStage(1);
      expect(screen.queryByRole('dialog', { name: 'Sticker entdecken' })).toBeNull();
      expect(share.apiGet).toHaveBeenCalledWith(
        '/share/0123456789abcdef0123456789abcdef/download',
        {
          responseType: 'blob',
        }
      );

      expect((await downloadAndGetCompose())?.stickers).toEqual([
        expect.objectContaining({ width: 270, height: 135 }),
      ]);
      await waitFor(() => expect(share.create).toHaveBeenCalledTimes(1));
      expect(createdProfilbild()?.stickers).toEqual([
        expect.objectContaining({ id: `asset:${GALLERY_ID}`, src: GALLERY_SRC }),
      ]);
    });

    it('uses a gallery background as the custom background without uploading it again', async () => {
      listOnly(galleryItem({ kind: 'background', title: 'Wiese' }));
      renderHandoff();
      await screen.findByTestId('konva-stage');
      const tile = await screen.findByRole('button', { name: 'Wiese' });
      expect(tile.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(tile);
      await waitFor(() => expect(lastBackground()).toMatchObject({ kind: 'image' }));
      expect(tile.getAttribute('aria-pressed')).toBe('true');

      await downloadAndGetCompose();
      await waitFor(() => expect(share.create).toHaveBeenCalledTimes(1));
      expect(createdProfilbild()?.background).toEqual({
        kind: 'custom',
        url: GALLERY_SRC,
      });
      expect(share.upload).not.toHaveBeenCalled();
    });

    it('applies a deep-linked sticker once the photo is in', async () => {
      mockRemove.mockResolvedValue({
        file: new File([], 'x'),
        objectUrl: 'blob:x',
        base64: CUTOUT,
      });
      const search = new URLSearchParams({
        asset: GALLERY_ID,
        kind: 'sticker',
        src: GALLERY_SRC,
        w: '512',
        h: '256',
        title: 'Sonnenblume',
      });
      renderPage(null, `?${search.toString()}`);
      expect(
        screen.getByText('Lade zuerst ein Foto hoch – dann setzen wir „Sonnenblume“ ein.')
      ).toBeTruthy();
      expect(screen.queryAllByTestId('konva-sticker')).toHaveLength(0);

      fireEvent.click(screen.getByText('upload'));
      await waitFor(() => expect(screen.queryByText(/Lade zuerst ein Foto hoch/)).toBeNull());
      await stickersOnStage(1);
      expect(screen.queryByText(/Lade zuerst ein Foto hoch/)).toBeNull();
      expect((await downloadAndGetCompose())?.stickers).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'Anderes Foto' }));
      expect(await screen.findByText('upload')).toBeTruthy();
      expect(screen.queryByText(/Lade zuerst ein Foto hoch/)).toBeNull();
    });

    it('drops the deep-link hint while the photo is being cut out', async () => {
      mockRemove.mockReturnValue(new Promise(() => {}));
      renderPage(null, `?asset=${GALLERY_ID}&kind=background&src=${GALLERY_SRC}`);
      expect(screen.getByText(/dann setzen wir den Hintergrund ein/)).toBeTruthy();
      fireEvent.click(screen.getByText('upload'));
      expect(await screen.findByText('Person wird freigestellt …')).toBeTruthy();
      expect(screen.queryByText(/Lade zuerst ein Foto hoch/)).toBeNull();
    });

    it('places a collection sticker from its link once the photo is in', async () => {
      mockRemove.mockResolvedValue({
        file: new File([], 'x'),
        objectUrl: 'blob:x',
        base64: CUTOUT,
      });
      renderPage(null, '?sticker=gj-zackenstern');
      expect(
        screen.getByText(
          'Lade zuerst ein Foto hoch – dann setzen wir „Zackenstern „Ich bin dabei!““ ein.'
        )
      ).toBeTruthy();
      fireEvent.click(screen.getByText('upload'));
      await stickersOnStage(1);
    });

    it('ignores a catalogue link with an unknown id', async () => {
      renderPage(null, '?hintergrund=gibt-es-nicht');
      expect(await screen.findByText('upload')).toBeTruthy();
      expect(screen.queryByText(/Lade zuerst ein Foto hoch/)).toBeNull();
    });

    it('ignores a deep link whose src is not a share path', async () => {
      renderPage(null, `?asset=${GALLERY_ID}&kind=sticker&src=https://evil.example/x.png`);
      expect(await screen.findByText('upload')).toBeTruthy();
      expect(screen.queryByText(/Lade zuerst ein Foto hoch/)).toBeNull();
    });

    it('uploads an own background straight into „Deine“ as a private item and applies it', async () => {
      share.prepare.mockResolvedValue(new Blob(['w'], { type: 'image/webp' }));
      share.uploadShare.mockResolvedValue('tok-gallery');
      share.createAsset.mockResolvedValue({
        status: 201,
        body: galleryItem({ kind: 'background', title: 'wiese', isOwn: true }),
      });
      renderHandoff();
      await screen.findByTestId('konva-stage');
      const photo = new File(['p'], 'wiese.jpg', { type: 'image/jpeg' });
      // No dialog: picking the file is the whole step.
      fireEvent.change(screen.getByTestId('profilbild-background-input'), {
        target: { files: [photo] },
      });

      await waitFor(() => expect(share.createAsset).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(share.prepare).toHaveBeenCalledWith(photo);
      expect(share.createAsset.mock.calls[0]?.[0]).toEqual({
        body: {
          shareToken: 'tok-gallery',
          kind: 'background',
          source: 'upload',
          title: 'wiese',
          tags: [],
          // Private: nothing lands in „Entdecken" unasked.
          visibility: 'private',
          audience: 'de-DE',
          rightsConfirmed: false,
        },
      });
      await waitFor(() => expect(lastBackground()).toMatchObject({ kind: 'image' }));

      await downloadAndGetCompose();
      await waitFor(() => expect(share.create).toHaveBeenCalledTimes(1));
      expect(createdProfilbild()?.background).toEqual({ kind: 'custom', url: GALLERY_SRC });
      expect(share.upload).not.toHaveBeenCalled();
    });

    it('says so when the background upload fails', async () => {
      share.prepare.mockResolvedValue(new Blob(['w'], { type: 'image/webp' }));
      share.uploadShare.mockResolvedValue(null);
      renderHandoff();
      await screen.findByTestId('konva-stage');
      fireEvent.change(screen.getByTestId('profilbild-background-input'), {
        target: { files: [new File(['p'], 'wiese.jpg', { type: 'image/jpeg' })] },
      });
      expect(await screen.findByText(/Das Hochladen hat nicht geklappt/)).toBeTruthy();
      expect(share.createAsset).not.toHaveBeenCalled();
    });

    it('creates a sticker in a dialog without leaving the Profilbild', async () => {
      renderHandoff();
      await screen.findByTestId('konva-stage');
      fireEvent.click(screen.getByRole('button', { name: 'Sticker erstellen' }));
      const dialog = await screen.findByRole('dialog', { name: 'Sticker erstellen' });
      expect(within(dialog).getByRole('radio', { name: 'Text-Badge' })).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Schließen' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByTestId('konva-stage')).toBeTruthy();
    });
  });

  it('returns to the upload on "Anderes Foto"', async () => {
    renderHandoff();
    fireEvent.click(await screen.findByRole('button', { name: 'Anderes Foto' }));
    expect(await screen.findByText('upload')).toBeTruthy();
  });
});
