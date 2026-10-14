import { type StudioAssetItem } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor, within } from '../../../test-utils';

import StickerCreatorPage from './StickerCreatorPage';

import type * as StickerEffects from './stickerEffects';

const { uploadShare, rendered } = vi.hoisted(() => ({
  uploadShare: vi.fn(),
  rendered: new Blob(['png'], { type: 'image/png' }),
}));

vi.mock('../../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaShare: uploadShare,
}));
// jsdom has no 2D canvas; the pixel work is covered by stickerEffects.vitest.ts.
vi.mock('./stickerEffects', async (importOriginal) => {
  const canvas = { width: 400, height: 300 };
  return {
    ...(await importOriginal<typeof StickerEffects>()),
    loadImage: vi.fn().mockResolvedValue({}),
    imageToCanvas: () => canvas,
    trimTransparent: () => canvas,
    canvasHasTransparency: () => true,
    renderSticker: () => ({ width: 512, height: 384 }),
    canvasToPngBlob: () => Promise.resolve(rendered),
  };
});
vi.mock('react-konva', () => ({
  Stage: () => null,
  Layer: () => null,
  Path: () => null,
  Text: () => null,
}));

const API = 'http://localhost/api/studio-assets';
const ID = '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10';
const SRC = '/api/share/0123456789abcdef0123456789abcdef/download';

let body: Record<string, unknown> | null = null;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
  URL.createObjectURL = () => 'blob:sticker';
  URL.revokeObjectURL = () => {};
});

afterAll(() => {
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

beforeEach(() => {
  body = null;
  uploadShare.mockReset().mockResolvedValue('tok-1');
  useAuthStore.setState({ locale: 'de-DE' });
  server.use(
    http.post(API, async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      const created: StudioAssetItem = {
        id: ID,
        kind: 'sticker',
        title: String(body.title),
        tags: [],
        src: SRC,
        thumbUrl: null,
        width: 512,
        height: 384,
        source: 'upload',
        visibility: 'private',
        audience: 'de-DE',
        moderation: 'ok',
        isOwn: true,
        authorName: null,
        likesCount: 0,
        liked: false,
        favorited: false,
        createdAt: '2026-10-14T00:00:00.000Z',
      };
      return HttpResponse.json(created, { status: 201 });
    })
  );
});

const Where = () => (
  <output data-testid="where">{useLocation().pathname + useLocation().search}</output>
);

async function designUpload(user: ReturnType<typeof renderWithProviders>['user']) {
  await user.click(screen.getByRole('button', { name: /Bild hochladen/ }));
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  await user.upload(input!, new File(['raw'], 'Sonnenblume.png', { type: 'image/png' }));
  const next = screen.getByRole('button', { name: 'Weiter' });
  await waitFor(() => expect(next).toBeEnabled());
  await user.click(next);
  await screen.findByRole('heading', { name: 'Speichern' });
}

describe('StickerCreatorPage', () => {
  it('offers three ways to start without axe violations', async () => {
    const { container } = renderWithProviders(<StickerCreatorPage />);

    for (const name of [/Bild hochladen/, /Foto freistellen/, /Text-Badge/])
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Art wählen');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('saves an uploaded PNG as a private sticker', async () => {
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designUpload(user);

    expect(screen.getByLabelText('Titel')).toHaveValue('Sonnenblume');
    await user.click(screen.getByRole('button', { name: 'Sticker speichern' }));

    expect(await screen.findByRole('heading', { name: 'Fertig!' })).toBeInTheDocument();
    expect(uploadShare).toHaveBeenCalledWith(rendered, {
      filename: 'sonnenblume.png',
      uploadSource: 'studio-asset',
    });
    expect(body).toEqual({
      shareToken: 'tok-1',
      kind: 'sticker',
      source: 'upload',
      title: 'Sonnenblume',
      tags: [],
      visibility: 'private',
      audience: 'de-DE',
      rightsConfirmed: false,
    });
    expect(screen.getByRole('link', { name: 'Im Profilbild verwenden' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/studio/profilbild?asset=${ID}`)
    );
  });

  it('only shares publicly once the rights are confirmed', async () => {
    const { user, container } = renderWithProviders(<StickerCreatorPage />);
    await designUpload(user);

    await user.click(screen.getByRole('checkbox', { name: /öffentlich teilen/ }));
    const submit = screen.getByRole('button', { name: 'Sticker speichern' });
    expect(submit).toBeDisabled();
    expect(within(container).getByRole('radio', { name: 'Deutschland' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: /Rechte an diesem Bild/ }));
    expect(submit).toBeEnabled();
    expect(await axe(container)).toHaveNoViolations();

    await user.click(submit);
    await waitFor(() =>
      expect(body).toMatchObject({ visibility: 'public', audience: 'de-DE', rightsConfirmed: true })
    );
  });

  it('goes straight back to the Profilbild with the new sticker', async () => {
    const { user } = renderWithProviders(
      <>
        <StickerCreatorPage />
        <Where />
      </>,
      { route: '/studio/sticker/neu?return=profilbild' }
    );
    await designUpload(user);
    await user.click(screen.getByRole('button', { name: 'Sticker speichern' }));

    await waitFor(() =>
      expect(screen.getByTestId('where').textContent).toMatch(/^\/studio\/profilbild\?/)
    );
    const params = new URLSearchParams(screen.getByTestId('where').textContent!.split('?')[1]);
    expect(Object.fromEntries(params)).toEqual({
      asset: ID,
      kind: 'sticker',
      src: SRC,
      w: '512',
      h: '384',
      title: 'Sonnenblume',
    });
  });

  it('points back to the canvas sidebar when opened from the canvas', async () => {
    const { user } = renderWithProviders(<StickerCreatorPage />, {
      route: '/studio/sticker/neu?return=canvas',
    });
    await designUpload(user);
    await user.click(screen.getByRole('button', { name: 'Sticker speichern' }));

    expect(await screen.findByText(/in der Seitenleiste unter „Meine“/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Im Profilbild verwenden' })).toBeNull();
  });

  it('keeps the form and explains when the upload fails', async () => {
    uploadShare.mockResolvedValue(null);
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designUpload(user);
    await user.click(screen.getByRole('button', { name: 'Sticker speichern' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Das Hochladen hat nicht geklappt');
    expect(body).toBeNull();
    expect(screen.getByRole('button', { name: 'Sticker speichern' })).toBeEnabled();
  });
});
