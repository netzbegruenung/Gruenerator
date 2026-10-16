import { type CanvasEditorExportApi } from '@gruenerator/canvas-editor';
import { type StudioAssetItem } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { type ReactNode, type Ref, useImperativeHandle } from 'react';
import { useLocation } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { server } from '../../../test/msw-server';
import { renderWithProviders, screen, waitFor, within } from '../../../test-utils';

import StickerCanvasPage from './StickerCanvasPage';

import type * as StickerEffects from './stickerEffects';

const { uploadShare, capture, renderSticker, rendered } = vi.hoisted(() => ({
  uploadShare: vi.fn(),
  capture: vi.fn(),
  renderSticker: vi.fn(),
  rendered: new Blob(['png'], { type: 'image/png' }),
}));

vi.mock('../../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaShare: uploadShare,
}));
vi.mock('../../image-studio/WebCanvasEditorProvider', () => ({
  WebCanvasEditorProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
// The editor itself is covered in packages/canvas-editor; here only its host slots and export API.
vi.mock('@gruenerator/canvas-editor', () => ({
  MasterCanvasEditor: ({
    chromeRight,
    exportApiRef,
  }: {
    chromeRight: ReactNode;
    exportApiRef: Ref<CanvasEditorExportApi>;
  }) => {
    useImperativeHandle(exportApiRef, () => ({
      captureActivePage: capture,
      getPages: () => [{ configId: 'sticker', state: { additionalTexts: [] } }],
    }));
    return <div>{chromeRight}</div>;
  },
}));
// jsdom has no 2D canvas; the pixel maths is covered in packages/shared/src/stickers/creator.
vi.mock('./stickerEffects', async (importOriginal) => ({
  ...(await importOriginal<typeof StickerEffects>()),
  loadImage: vi.fn().mockResolvedValue({}),
  imageToCanvas: () => ({ width: 400, height: 300 }),
  trimTransparent: () => ({ width: 400, height: 300 }),
  renderSticker,
  canvasToPngBlob: () => Promise.resolve(rendered),
}));

let body: Record<string, unknown> | null = null;
const originalCreate = URL.createObjectURL;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
  URL.createObjectURL = () => 'blob:sticker';
});

afterAll(() => {
  URL.createObjectURL = originalCreate;
});

beforeEach(() => {
  body = null;
  uploadShare.mockReset().mockResolvedValue('tok-1');
  capture.mockReset().mockResolvedValue('data:image/png;base64,c3RpY2tlcg==');
  renderSticker.mockReset().mockReturnValue({ width: 512, height: 384 });
  useAuthStore.setState({ locale: 'de-DE', user: null });
  server.use(
    http.post('http://localhost/api/studio-assets', async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: 'a1', title: body.title } as StudioAssetItem, {
        status: 201,
      });
    })
  );
});

const Where = () => <output data-testid="where">{useLocation().pathname}</output>;

describe('StickerCanvasPage', () => {
  it('captures the page without background and saves it as a sticker', async () => {
    const { user } = renderWithProviders(
      <>
        <StickerCanvasPage />
        <Where />
      </>,
      { route: '/studio/sticker/gestalten' }
    );
    await user.click(screen.getByRole('button', { name: 'Als Sticker speichern' }));

    const dialog = await screen.findByRole('dialog', { name: 'Sticker speichern' });
    expect(capture).toHaveBeenCalledWith({ pixelRatio: 2, transparent: true });
    await waitFor(() => expect(within(dialog).getByLabelText('Titel')).toHaveValue('Mein Sticker'));
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));

    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/studio/sticker'));
    expect(body).toMatchObject({ shareToken: 'tok-1', kind: 'sticker', source: 'badge' });
  });

  it('renders the outline round the whole motif and drops it on request', async () => {
    const { user } = renderWithProviders(<StickerCanvasPage />);
    await user.click(screen.getByRole('button', { name: 'Als Sticker speichern' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sticker speichern' });
    await waitFor(() =>
      expect(renderSticker).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ outline: expect.objectContaining({ color: expect.any(String) }) })
      )
    );

    await user.click(within(dialog).getByRole('switch', { name: 'Kontur' }));
    await waitFor(() =>
      expect(renderSticker).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ outline: null })
      )
    );
  });

  it('opens no save dialog when the capture fails', async () => {
    capture.mockResolvedValue(null);
    const { user } = renderWithProviders(<StickerCanvasPage />);
    const button = screen.getByRole('button', { name: 'Als Sticker speichern' });
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers the Vorlage export to instance admins only', () => {
    const { unmount } = renderWithProviders(<StickerCanvasPage />);
    expect(screen.queryByRole('button', { name: 'Als Grünerator-Vorlage exportieren' })).toBeNull();
    unmount();

    useAuthStore.setState({ user: { id: 'u1', is_admin: true } as never });
    renderWithProviders(<StickerCanvasPage />);
    expect(
      screen.getByRole('button', { name: 'Als Grünerator-Vorlage exportieren' })
    ).toBeInTheDocument();
  });
});
