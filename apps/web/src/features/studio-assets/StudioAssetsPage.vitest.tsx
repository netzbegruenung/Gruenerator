import { type StudioAssetItem } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { TooltipProvider } from '@gruenerator/ui';
import { http, HttpResponse } from 'msw';
import { useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { item } from '../../test/marketplaceFixtures';
import { server } from '../../test/msw-server';
import { axe, render, renderWithProviders, screen, waitFor, within } from '../../test-utils';

import { StudioAssetCard } from './StudioAssetCard';
import StudioAssetsPage from './StudioAssetsPage';

import type * as BackgroundImage from './backgroundImage';

const { prepare, uploadShare } = vi.hoisted(() => ({
  prepare: vi.fn(),
  uploadShare: vi.fn(),
}));
vi.mock('./backgroundImage', async (importOriginal) => ({
  ...(await importOriginal<typeof BackgroundImage>()),
  prepareBackgroundImage: prepare,
}));
vi.mock('../image-studio/services/mediaUploadService', () => ({
  uploadBlobToMediaShare: uploadShare,
}));

const API = 'http://localhost/api/studio-assets';

const asset = (over: Partial<StudioAssetItem>): StudioAssetItem => ({
  id: 'a-1',
  kind: 'sticker',
  title: 'Sonnenblume',
  tags: [],
  src: 'http://localhost/s/a-1.png',
  thumbUrl: null,
  width: 512,
  height: 512,
  source: 'upload',
  visibility: 'public',
  audience: 'all',
  moderation: 'ok',
  isOwn: false,
  authorName: 'Kim',
  likesCount: 2,
  liked: false,
  favorited: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

let store: StudioAssetItem[] = [];
let listQueries: URLSearchParams[] = [];

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  store = [
    asset({}),
    asset({
      id: 'own-1',
      title: 'Mein Herz',
      isOwn: true,
      visibility: 'private',
      authorName: null,
    }),
  ];
  listQueries = [];
  server.use(
    http.get(API, ({ request }) => {
      const params = new URL(request.url).searchParams;
      listQueries.push(params);
      const scope = params.get('scope');
      const items = store.filter(
        (i) =>
          i.kind === params.get('kind') &&
          (scope === 'mine' ? i.isOwn : scope === 'saved' ? i.favorited : i.visibility === 'public')
      );
      return HttpResponse.json({ items, hasMore: false });
    })
  );
});

const ROUTE = '/studio/sticker';
/** Sonnenblume is someone else's sticker; gemerkt, it shows in the own collection. */
const savedSonnenblume = () => asset({ favorited: true });
const renderOverview = () => renderWithProviders(<StudioAssetsPage />, { route: ROUTE });
/**
 * Wartet, bis die ersten `n` Listenabfragen raus sind — danach zählt jede weitere
 * als Nachladen. Die Übersicht lädt eigene und gemerkte je Art: 4.
 */
const queriesSettled = (n: number) => waitFor(() => expect(listQueries.length).toBe(n));
const ownPublic = () =>
  asset({ id: 'own-1', title: 'Mein Herz', isOwn: true, visibility: 'public', authorName: null });

const card = (title: string) => screen.getByRole('article', { name: title });

async function openMenu(user: ReturnType<typeof renderWithProviders>['user'], title: string) {
  await user.click(within(card(title)).getByRole('button', { name: `Aktionen für ${title}` }));
  return screen.findByRole('menu');
}

describe('StudioAssetsPage', () => {
  it('shows own and saved items by kind, without the rest of Entdecken', async () => {
    store = [
      ...store,
      asset({ id: 'fav-1', title: 'Gemerkter Stern', favorited: true }),
      asset({ id: 'bg-1', kind: 'background', title: 'Wiese', isOwn: true, authorName: null }),
    ];
    renderWithProviders(<StudioAssetsPage />, { route: '/studio/sticker' });

    const stickers = await screen.findByRole('region', { name: 'Sticker' });
    expect(await within(stickers).findByRole('article', { name: 'Mein Herz' })).toBeInTheDocument();
    expect(within(stickers).getByRole('article', { name: 'Gemerkter Stern' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Hintergründe' })).getByRole('article', {
        name: 'Wiese',
      })
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: 'Sonnenblume' })).toBeNull();
    expect(screen.queryByRole('tab')).toBeNull();
    expect(new Set(listQueries.map((q) => `${q.get('kind')}:${q.get('scope')}`))).toEqual(
      new Set(['sticker:mine', 'sticker:saved', 'background:mine', 'background:saved'])
    );
  });

  it('opens Entdecken as the Marktplatz for Sticker and Hintergründe', async () => {
    const marketQueries: URLSearchParams[] = [];
    server.use(
      http.get('http://localhost/api/marketplace', ({ request }) => {
        marketQueries.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          sections: [{ kind: 'sticker', items: [item('sticker', 'Sonnenblume')], hasMore: false }],
        });
      })
    );
    const { user } = renderOverview();
    await screen.findByRole('article', { name: 'Mein Herz' });

    await user.click(screen.getByRole('button', { name: 'Entdecken' }));

    const popup = await screen.findByRole('dialog', { name: 'Entdecken' });
    expect(await within(popup).findByRole('heading', { name: 'Sonnenblume' })).toBeInTheDocument();
    const tabs = within(within(popup).getByRole('group', { name: 'Art' })).getAllByRole('button');
    expect(tabs.map((t) => t.textContent)).toEqual(['Alle', 'Sticker', 'Hintergründe']);
    expect(marketQueries[0]?.get('kinds')).toBe('sticker,background');
  });

  it('shows a like at once and sends it', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const like = vi.fn();
    server.use(
      http.put(`${API}/:id/like`, async ({ params }) => {
        like(params.id);
        await gate;
        store = store.map((i) => (i.id === params.id ? { ...i, liked: true, likesCount: 3 } : i));
        return HttpResponse.json({ liked: true, likesCount: 3 });
      })
    );
    store = [savedSonnenblume(), ...store.slice(1)];
    const { user } = renderOverview();
    await screen.findByRole('article', { name: 'Sonnenblume' });
    await queriesSettled(4);

    await user.click(within(card('Sonnenblume')).getByRole('button', { name: 'Gefällt mir (2)' }));

    const pressed = within(card('Sonnenblume')).getByRole('button', { name: 'Gefällt mir (3)' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(like).toHaveBeenCalledWith('a-1'));
    release();
    await waitFor(() => expect(listQueries.length).toBeGreaterThan(4));
    expect(
      within(card('Sonnenblume')).getByRole('button', { name: 'Gefällt mir (3)' })
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the report dialog for someone else’s sticker only', async () => {
    store = [savedSonnenblume(), ownPublic()];
    const { user } = renderOverview();
    await screen.findByRole('article', { name: 'Sonnenblume' });

    const ownMenu = await openMenu(user, 'Mein Herz');
    expect(within(ownMenu).queryByRole('menuitem', { name: 'Melden' })).toBeNull();
    await user.keyboard('{Escape}');

    const menu = await openMenu(user, 'Sonnenblume');
    await user.click(within(menu).getByRole('menuitem', { name: 'Melden' }));

    const dialog = await screen.findByRole('dialog', { name: 'Inhalt melden' });
    expect(within(dialog).getByText('Was stimmt mit „Sonnenblume“ nicht?')).toBeInTheDocument();
  });

  it('drops a sticker the report auto-hid from the gallery right away', async () => {
    server.use(
      http.post('http://localhost/api/content-reports', () => {
        store = store.filter((i) => i.id !== 'a-1');
        return HttpResponse.json({ success: true });
      })
    );
    store = [savedSonnenblume(), ownPublic()];
    const { user } = renderOverview();
    await screen.findByRole('article', { name: 'Sonnenblume' });

    const menu = await openMenu(user, 'Sonnenblume');
    await user.click(within(menu).getByRole('menuitem', { name: 'Melden' }));
    const dialog = await screen.findByRole('dialog', { name: 'Inhalt melden' });
    await user.click(within(dialog).getByRole('radio', { name: 'Rechtswidrig' }));
    await user.click(within(dialog).getByRole('button', { name: 'Melden' }));

    await waitFor(() => expect(screen.queryByRole('article', { name: 'Sonnenblume' })).toBeNull());
    expect(screen.getByRole('article', { name: 'Mein Herz' })).toBeInTheDocument();
  });

  it('hands the item to the Profilbild by deep link', async () => {
    const SRC = '/api/share/0123456789abcdef0123456789abcdef/download';
    store = [
      asset({ id: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10', src: SRC, height: 256, favorited: true }),
    ];
    const Where = () => <output data-testid="where">{useLocation().search}</output>;
    const { user } = renderWithProviders(
      <>
        <StudioAssetsPage />
        <Where />
      </>,
      { route: ROUTE }
    );
    await screen.findByRole('article', { name: 'Sonnenblume' });

    const menu = await openMenu(user, 'Sonnenblume');
    await user.click(within(menu).getByRole('menuitem', { name: 'Im Profilbild verwenden' }));

    const params = new URLSearchParams(screen.getByTestId('where').textContent ?? '');
    expect(Object.fromEntries(params)).toEqual({
      asset: '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10',
      kind: 'sticker',
      src: SRC,
      w: '512',
      h: '256',
      title: 'Sonnenblume',
    });
  });

  it('publishes an own sticker only after the rights are confirmed', async () => {
    let body: unknown = null;
    server.use(
      http.patch(`${API}/:id`, async ({ request, params }) => {
        body = await request.json();
        const updated = {
          ...store.find((i) => i.id === params.id)!,
          visibility: 'public' as const,
        };
        return HttpResponse.json(updated);
      })
    );
    const { user } = renderWithProviders(<StudioAssetsPage />);
    await screen.findByRole('article', { name: 'Mein Herz' });

    const menu = await openMenu(user, 'Mein Herz');
    await user.click(within(menu).getByRole('menuitem', { name: 'Öffentlich machen' }));

    const dialog = await screen.findByRole('dialog');
    const confirm = within(dialog).getByRole('button', { name: 'Öffentlich machen' });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Rechte an diesem Bild/ }));
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(body).toEqual({ visibility: 'public', rightsConfirmed: true }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('StudioAssetsPage follow-ups', () => {
  it('sends a quick double like in click order and ends unliked', async () => {
    const calls: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.put(`${API}/:id/like`, async () => {
        calls.push('like');
        await gate;
        return HttpResponse.json({ liked: true, likesCount: 3 });
      }),
      http.delete(`${API}/:id/like`, () => {
        calls.push('unlike');
        return HttpResponse.json({ liked: false, likesCount: 2 });
      })
    );
    store = [savedSonnenblume(), ...store.slice(1)];
    const { user } = renderOverview();
    await screen.findByRole('article', { name: 'Sonnenblume' });
    await queriesSettled(4);

    await user.click(within(card('Sonnenblume')).getByRole('button', { name: 'Gefällt mir (2)' }));
    await user.click(within(card('Sonnenblume')).getByRole('button', { name: 'Gefällt mir (3)' }));

    const button = within(card('Sonnenblume')).getByRole('button', { name: 'Gefällt mir (2)' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() => expect(calls).toEqual(['like']));
    release();
    await waitFor(() => expect(calls).toEqual(['like', 'unlike']));
    await waitFor(() => expect(listQueries.length).toBeGreaterThan(4));
    expect(
      within(card('Sonnenblume')).getByRole('button', { name: 'Gefällt mir (2)' })
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the grid when loading more fails and offers a retry', async () => {
    server.use(
      http.get(API, ({ request }) => {
        const params = new URL(request.url).searchParams;
        if (params.get('kind') !== 'sticker' || params.get('scope') !== 'saved')
          return HttpResponse.json({ items: [], hasMore: false });
        if (params.get('offset') === '0')
          return HttpResponse.json({ items: [savedSonnenblume()], hasMore: true });
        return HttpResponse.json({ success: false, message: 'Kaputt.' }, { status: 500 });
      })
    );
    const { user } = renderOverview();
    await screen.findByRole('article', { name: 'Sonnenblume' });

    await user.click(screen.getByRole('button', { name: 'Mehr laden' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Kaputt.');
    expect(screen.getByRole('article', { name: 'Sonnenblume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeEnabled();
  });

  it('uploads a background and creates it with the chosen settings', async () => {
    const blob = new Blob(['x'], { type: 'image/webp' });
    prepare.mockResolvedValue(blob);
    uploadShare.mockResolvedValue('tok-1');
    let body: unknown = null;
    server.use(
      http.post(API, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(asset({ id: 'bg-1', kind: 'background', isOwn: true }), {
          status: 201,
        });
      })
    );
    const { user } = renderWithProviders(<StudioAssetsPage />);
    await screen.findByRole('article', { name: 'Mein Herz' });
    await user.click(screen.getByRole('button', { name: 'Neu' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Hintergrund hochladen' }));

    const dialog = await screen.findByRole('dialog');
    const file = new File(['raw'], 'Wiese im Sommer.jpg', { type: 'image/jpeg' });
    await user.upload(within(dialog).getByLabelText('Bild'), file);
    expect(within(dialog).getByLabelText('Titel')).toHaveValue('Wiese im Sommer');
    await user.type(within(dialog).getByLabelText(/Schlagwörter/), 'natur, sommer');
    await user.click(within(dialog).getByRole('checkbox', { name: /öffentlich teilen/ }));
    await user.click(within(dialog).getByRole('radio', { name: 'Alle' }));
    const submit = within(dialog).getByRole('button', { name: 'Hochladen' });
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox', { name: /Rechte an diesem Bild/ }));
    await user.click(submit);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(prepare).toHaveBeenCalledWith(file);
    expect(uploadShare).toHaveBeenCalledWith(blob, {
      filename: 'Wiese im Sommer.webp',
      uploadSource: 'studio-asset',
    });
    expect(body).toEqual({
      shareToken: 'tok-1',
      kind: 'background',
      source: 'upload',
      title: 'Wiese im Sommer',
      tags: ['natur', 'sommer'],
      visibility: 'public',
      audience: 'all',
      rightsConfirmed: true,
    });
  });
});

describe('StudioAssetCard', () => {
  it('has no axe violations, including the moderation badge', async () => {
    const noop = () => {};
    const { container } = render(
      <TooltipProvider>
        <StudioAssetCard
          item={asset({ isOwn: true, moderation: 'hidden', favorited: true })}
          onToggleLike={noop}
          onToggleFavorite={noop}
          onUseInProfilbild={noop}
          onReport={noop}
          onPublish={noop}
          onMakePrivate={noop}
          onRename={noop}
          onDelete={noop}
        />
      </TooltipProvider>
    );

    expect(screen.getByRole('button', { name: 'Merken' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Ausgeblendet').closest('[tabindex="0"]')).not.toBeNull();
    expect(await axe(container)).toHaveNoViolations();
  });
});
