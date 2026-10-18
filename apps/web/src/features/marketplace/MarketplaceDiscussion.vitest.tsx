/**
 * Der eine Interaktionsblock unter jedem Marktplatz-Beitrag: Like, Link,
 * Melden, Reaktionen und Kommentare. Fremde Kommentare lassen sich melden,
 * eigene nicht; löschen darf die Besitzerin des Beitrags auch fremde.
 */
import { type EntityComment } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { item } from '../../test/marketplaceFixtures';
import { server } from '../../test/msw-server';

import { MarketplaceDiscussion } from './MarketplaceDiscussion';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor, within } from '@/test-utils';

const API = 'http://localhost/api';

const comment = (over: Partial<EntityComment> = {}): EntityComment => ({
  id: 'c1',
  entityType: 'recipe',
  entityId: 'recipe-fremdes-rezept',
  parentId: null,
  userId: 'someone-else',
  authorName: 'Anna Beispiel',
  body: 'Tolles Rezept',
  createdAt: '2026-10-13T10:00:00Z',
  reactions: [{ emoji: '👍', count: 2, reacted: false }],
  ...over,
});

let comments: EntityComment[] = [];
const recipe = item('recipe', 'Fremdes Rezept', { likesCount: 4 });
const target = { kind: recipe.kind, ref: recipe.ref };

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: API, authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'me' } as never });
  comments = [
    comment(),
    comment({ id: 'c2', userId: 'me', authorName: 'Ich', body: 'Meins', reactions: [] }),
  ];
  server.use(
    http.get(`${API}/comments/:type/:id`, ({ params }) => {
      expect(params).toEqual({ type: 'recipe', id: 'recipe-fremdes-rezept' });
      return HttpResponse.json({
        success: true,
        reactions: [{ emoji: '❤️', count: 1, reacted: true }],
        comments,
      });
    })
  );
});

describe('MarketplaceDiscussion', () => {
  it('shows the item’s reactions and the comments with theirs', async () => {
    renderWithProviders(
      <MarketplaceDiscussion target={target} item={recipe} canModerate={false} />
    );

    expect(await screen.findByText('Tolles Rezept')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '❤️ – 1 Reaktion, von dir' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👍 – 2 Reaktionen' })).toBeInTheDocument();
  });

  it('reports other people’s comments as entity_comment, never one’s own', async () => {
    const report = vi.fn();
    server.use(
      http.post(`${API}/content-reports`, async ({ request }) => {
        report(await request.json());
        return HttpResponse.json({ success: true, hidden: false });
      })
    );
    const { user } = renderWithProviders(
      <MarketplaceDiscussion target={target} item={recipe} canModerate={false} />
    );
    await screen.findByText('Tolles Rezept');

    expect(screen.queryByRole('button', { name: 'Kommentar von Ich melden' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Kommentar von Anna Beispiel melden' }));
    const dialog = await screen.findByRole('dialog', { name: 'Inhalt melden' });
    expect(within(dialog).getByText('Was stimmt mit „Kommentar von Anna Beispiel“ nicht?'));
    await user.click(within(dialog).getAllByRole('radio')[0]!);
    await user.click(within(dialog).getByRole('button', { name: 'Melden' }));

    await waitFor(() =>
      expect(report).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'entity_comment', targetId: 'c1' })
      )
    );
  });

  it("lets only the item's owner delete other people's comments", async () => {
    const { unmount } = renderWithProviders(
      <MarketplaceDiscussion target={target} item={recipe} canModerate={false} />
    );
    await screen.findByText('Tolles Rezept');
    // Only one's own comment.
    expect(screen.getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(1);
    unmount();

    renderWithProviders(<MarketplaceDiscussion target={target} item={recipe} canModerate />);
    await screen.findByText('Tolles Rezept');
    expect(screen.getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(2);
  });

  it('likes the item through the Marktplatz', async () => {
    const like = vi.fn();
    server.use(
      http.put(`${API}/marketplace/:kind/:ref/like`, ({ params }) => {
        like(params.kind, params.ref);
        return HttpResponse.json({ liked: true, likesCount: 5 });
      })
    );
    const { user } = renderWithProviders(
      <MarketplaceDiscussion target={target} item={recipe} canModerate={false} />
    );

    await user.click(screen.getByRole('button', { name: 'Gefällt mir (4)' }));
    await waitFor(() => expect(like).toHaveBeenCalledWith('recipe', 'recipe-fremdes-rezept'));
  });

  it('copies the link it is given, and reports the item when it can be reported', async () => {
    const { user } = renderWithProviders(
      <MarketplaceDiscussion
        target={target}
        item={recipe}
        canModerate={false}
        shareHref="/marktplatz?item=recipe%3Arecipe-fremdes-rezept"
      />
    );
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');

    await user.click(screen.getByRole('button', { name: 'Link kopieren' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/marktplatz?item=recipe%3Arecipe-fremdes-rezept`
    );

    await user.click(screen.getByRole('button', { name: 'Melden' }));
    expect(await screen.findByRole('dialog', { name: 'Inhalt melden' })).toBeInTheDocument();
  });

  it('without an item: no like, no item report, no link — reactions and comments only', async () => {
    renderWithProviders(<MarketplaceDiscussion target={target} item={null} canModerate={false} />);
    await screen.findByText('Tolles Rezept');

    expect(screen.queryByRole('button', { name: /Gefällt mir/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Melden' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Link kopieren' })).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(
      <MarketplaceDiscussion
        target={target}
        item={recipe}
        canModerate={false}
        shareHref="/marktplatz"
      />
    );
    await screen.findByText('Tolles Rezept');
    expect(await axe(container)).toHaveNoViolations();
  });
});
