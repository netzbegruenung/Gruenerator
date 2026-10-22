import { type StudioAssetItem } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { type ReactNode, type Ref, useImperativeHandle } from 'react';
import { useLocation } from 'react-router-dom';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor, within } from '../../../test-utils';

import StickerCreatorPage from './StickerCreatorPage';

import type * as StickerEffects from './stickerEffects';

const { uploadShare, removeBackground, rendered, transparent } = vi.hoisted(() => ({
  uploadShare: vi.fn(),
  removeBackground: vi.fn(),
  rendered: new Blob(['png'], { type: 'image/png' }),
  transparent: vi.fn(),
}));

vi.mock('../../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaShare: uploadShare,
}));
vi.mock('../../image-studio/services/imageEditingService', () => ({
  removeImageBackground: removeBackground,
}));
vi.mock('../../image-studio/utils/downscaleImage', () => ({
  fileToDownscaledDataUrl: () => Promise.resolve('data:image/png;base64,cmF3'),
}));
// jsdom has no 2D canvas; the pixel maths is covered in packages/shared/src/stickers/creator.
vi.mock('./stickerEffects', async (importOriginal) => {
  const canvas = { width: 400, height: 300 };
  return {
    ...(await importOriginal<typeof StickerEffects>()),
    loadImage: vi.fn().mockResolvedValue({}),
    imageToCanvas: () => canvas,
    trimTransparent: () => canvas,
    canvasHasTransparency: transparent,
    renderSticker: () => ({ width: 512, height: 384 }),
    canvasToPngBlob: () => Promise.resolve(rendered),
  };
});
// The badge exports its content layer; stand in for it with a fixed PNG.
vi.mock('react-konva', () => ({
  Stage: ({ ref, children }: { ref?: Ref<unknown>; children?: ReactNode }) => {
    useImperativeHandle(ref, () => ({
      width: () => 320,
      height: () => 320,
      container: () => document.createElement('div'),
    }));
    return <>{children}</>;
  },
  Layer: ({ ref }: { ref?: Ref<unknown> }) => {
    useImperativeHandle(ref, () => ({ toBlob: () => Promise.resolve(rendered) }));
    return null;
  },
  Path: () => null,
  Image: () => null,
  Text: () => null,
  Line: () => null,
  Transformer: () => null,
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
  transparent.mockReset().mockReturnValue(true);
  removeBackground
    .mockReset()
    .mockResolvedValue({ base64: 'data:image/png;base64,Y3V0', objectUrl: 'blob:cutout' });
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

type User = ReturnType<typeof renderWithProviders>['user'];

async function designUpload(user: User) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  await user.upload(input!, new File(['raw'], 'Sonnenblume.png', { type: 'image/png' }));
}

/** The header button opens the save dialog once the design has a draft. */
async function openSave(user: User) {
  const open = screen.getByRole('button', { name: 'Sticker speichern' });
  await waitFor(() => expect(open).toBeEnabled());
  await user.click(open);
  return screen.findByRole('dialog', { name: 'Sticker speichern' });
}

async function save(user: User) {
  const dialog = await openSave(user);
  await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));
  return dialog;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function designCutout(user: User) {
  // The cutout path downscales through a data: URL fetch, which MSW would refuse.
  const realFetch = globalThis.fetch;
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) =>
    String(input).startsWith('data:')
      ? Promise.resolve({ blob: () => Promise.resolve(rendered) } as Response)
      : realFetch(input, init)
  );
  transparent.mockReturnValue(false);
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  await user.upload(input!, new File(['raw'], 'Portrait.jpg', { type: 'image/jpeg' }));
}

describe('StickerCreatorPage', () => {
  it('opens on the image upload with the badge one click away, without axe violations', async () => {
    const { container } = renderWithProviders(<StickerCreatorPage />);

    expect(screen.getByRole('radio', { name: 'Bild' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Text-Badge' })).not.toBeChecked();
    expect(screen.getByText('Bild hochladen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sticker speichern' })).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('leads back to where the person came from', () => {
    const { unmount } = renderWithProviders(<StickerCreatorPage />);
    expect(screen.getByRole('link', { name: 'Zurück zur Galerie' })).toHaveAttribute(
      'href',
      '/studio/sticker'
    );
    unmount();

    renderWithProviders(<StickerCreatorPage />, { route: '/studio/sticker/neu?return=profilbild' });
    expect(screen.getByRole('link', { name: 'Zurück zum Profilbild' })).toHaveAttribute(
      'href',
      '/studio/profilbild'
    );
  });

  it('saves an uploaded PNG as a private sticker', async () => {
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designUpload(user);
    expect(screen.queryByRole('switch', { name: 'Hintergrund entfernen' })).toBeNull();

    const dialog = await openSave(user);
    expect(within(dialog).getByLabelText('Titel')).toHaveValue('Sonnenblume');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));

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
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designUpload(user);
    const dialog = await openSave(user);

    expect(within(dialog).queryByText('Dein Name wird dabei angezeigt.')).toBeNull();
    await user.click(within(dialog).getByRole('checkbox', { name: /öffentlich teilen/ }));
    expect(within(dialog).getByText('Dein Name wird dabei angezeigt.')).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: 'Speichern' });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByRole('radio', { name: 'Deutschland' })).toBeChecked();
    await user.click(within(dialog).getByRole('checkbox', { name: /Rechte an diesem Bild/ }));
    expect(submit).toBeEnabled();
    expect(await axe(dialog)).toHaveNoViolations();

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
    await save(user);

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
    await save(user);

    expect(await screen.findByText(/in der Seitenleiste unter „Meine“/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Im Profilbild verwenden' })).toBeNull();
  });

  it('keeps the dialog open and explains when the upload fails', async () => {
    uploadShare.mockResolvedValue(null);
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designUpload(user);
    const dialog = await save(user);

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Das Hochladen hat nicht geklappt'
    );
    expect(body).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Speichern' })).toBeEnabled();
  });

  it('retries a failed save with the file it already uploaded', async () => {
    let attempts = 0;
    server.use(
      http.post(API, async ({ request }) => {
        attempts += 1;
        if (attempts === 1) return HttpResponse.json({ error: 'kaputt' }, { status: 500 });
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ error: 'egal' }, { status: 500 });
      })
    );
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designUpload(user);
    const dialog = await save(user);
    await waitFor(() => expect(attempts).toBe(1));
    const submit = within(dialog).getByRole('button', { name: 'Speichern' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    await waitFor(() => expect(attempts).toBe(2));
    expect(uploadShare).toHaveBeenCalledOnce();
    expect(body).toMatchObject({ shareToken: 'tok-1' });
  });

  it('cuts out a photo and previews it with the outline on', async () => {
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designCutout(user);

    expect(
      await screen.findByRole('img', { name: 'Vorschau deines Stickers' })
    ).toBeInTheDocument();
    expect(removeBackground).toHaveBeenCalledOnce();
    expect(screen.getByRole('switch', { name: 'Hintergrund entfernen' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Kontur' })).toBeChecked();
    expect(screen.getByRole('slider', { name: /Stärke/ })).toBeInTheDocument();
    await save(user);
    await waitFor(() => expect(body).toMatchObject({ source: 'cutout', title: 'Portrait' }));
  });

  it('keeps a photo whole when the cutout is switched off', async () => {
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designCutout(user);
    await screen.findByRole('img', { name: 'Vorschau deines Stickers' });

    await user.click(screen.getByRole('switch', { name: 'Hintergrund entfernen' }));
    await save(user);
    await waitFor(() => expect(body).toMatchObject({ source: 'upload' }));
  });

  it('explains a failed cutout and retries it', async () => {
    removeBackground.mockRejectedValueOnce(new Error('down'));
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await designCutout(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Freistellen ist gerade nicht');
    expect(screen.getByRole('button', { name: 'Sticker speichern' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(
      await screen.findByRole('img', { name: 'Vorschau deines Stickers' })
    ).toBeInTheDocument();
    expect(removeBackground).toHaveBeenCalledTimes(2);
  });

  it('designs a badge whose text moves and resizes on the stage', async () => {
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await user.click(screen.getByRole('radio', { name: 'Text-Badge' }));

    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Jetzt\nGrün wählen!');
    const stage = screen.getByRole('application', { name: /mit „Jetzt Grün wählen!“/ });
    const size = () => screen.getByRole('slider', { name: 'Textgröße' });
    expect(size()).toHaveAttribute('aria-valuenow', '100');

    stage.focus();
    await user.keyboard('+');
    expect(size()).toHaveAttribute('aria-valuenow', '110');
    await user.keyboard('{ArrowRight}');
    await user.click(screen.getByRole('button', { name: 'Text zurücksetzen' }));
    expect(size()).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('button', { name: 'Text zurücksetzen' })).toBeDisabled();

    const dialog = await openSave(user);
    expect(within(dialog).getByLabelText('Titel')).toHaveValue('Jetzt Grün wählen!');
    await user.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(body).toMatchObject({ source: 'badge' }));
  });

  it('keeps the badge controls in tabs: outline colour and a picture background', async () => {
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await user.click(screen.getByRole('radio', { name: 'Text-Badge' }));

    await user.click(screen.getByRole('radio', { name: 'Form' }));
    expect(screen.getByRole('switch', { name: 'Kontur' })).toBeChecked();
    expect(screen.getByRole('group', { name: 'Farbe der Kontur' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Farben' }));
    expect(screen.getByRole('button', { name: 'Bild als Hintergrund' })).toBeInTheDocument();
    expect(screen.getByLabelText('Hintergrundbild wählen')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp'
    );
  });

  it('adds an emoji to the badge and can remove it again', async () => {
    // jsdom loads no images; the stage only needs the load to finish.
    vi.stubGlobal(
      'Image',
      class {
        width = 128;
        height = 128;
        onload: (() => void) | null = null;
        set src(_: string) {
          queueMicrotask(() => this.onload?.());
        }
      }
    );
    const { user } = renderWithProviders(<StickerCreatorPage />);
    await user.click(screen.getByRole('radio', { name: 'Text-Badge' }));
    await user.click(screen.getByRole('radio', { name: 'Emojis' }));

    const [firstEmoji] = screen.getAllByRole('button', { name: /^Emoji .* hinzufügen$/ });
    const label = firstEmoji!.getAttribute('aria-label')!.replace(/^Emoji | hinzufügen$/g, '');
    await user.click(firstEmoji!);

    expect(
      screen.getByRole('application', { name: new RegExp(`, ${label}$`) })
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(screen.getByRole('application', { name: /Grün wählen!“$/ })).toBeInTheDocument();
  });
});
