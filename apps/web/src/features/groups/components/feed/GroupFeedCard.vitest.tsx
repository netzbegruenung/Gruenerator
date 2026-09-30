import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../../test/msw-server';
import { axe, renderWithProviders } from '../../../../test-utils';

import { GroupFeedCard, type GroupFeedCardProps } from './GroupFeedCard';

const GROUP = 'g1';
const SHARE = '11111111-1111-4111-8111-111111111111';
const COMMENTS_URL = `http://localhost/api/auth/groups/${GROUP}/shares/${SHARE}/comments`;

const item: GroupFeedItem = {
  key: 'collaborative_documents:d1',
  id: 'd1',
  contentType: 'collaborative_documents',
  kind: 'doc',
  title: 'Pressemitteilung Artenschutz',
  excerpt: null,
  thumbnailUrl: null,
  slug: null,
  sharedByName: 'Aileen Lorenz',
  sharedAt: '2026-09-24T10:00:00Z',
  share: {
    shareId: SHARE,
    note: 'Bitte bis Sonntag gegenlesen.',
    pinnedAt: '2026-09-25T10:00:00Z',
    pinnedByName: 'Moritz',
    commentCount: 1,
    reactions: [],
  },
  post: null,
};

const baseProps: GroupFeedCardProps = {
  item,
  groupId: GROUP,
  isAdmin: false,
  canComment: true,
  currentUserId: 'me',
  currentUserName: 'Moritz Wächter',
  onUseTemplate: () => {},
  isCloning: false,
  onRemove: null,
};

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

describe('GroupFeedCard', () => {
  it('shows sharer, note, pin banner and an open link', () => {
    renderWithProviders(<GroupFeedCard {...baseProps} />);
    expect(screen.getByText('Aileen Lorenz')).toBeInTheDocument();
    expect(screen.getByText('Bitte bis Sonntag gegenlesen.')).toBeInTheDocument();
    expect(screen.getByText('Angeheftet von Moritz')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Öffnen' })).toHaveAttribute('href', '/office/d1');
  });

  it('offers pinning only to admins', () => {
    const { unmount } = renderWithProviders(<GroupFeedCard {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Lösen' })).not.toBeInTheDocument();
    unmount();
    renderWithProviders(<GroupFeedCard {...baseProps} isAdmin />);
    expect(screen.getByRole('button', { name: 'Lösen' })).toHaveAttribute('aria-pressed', 'true');
  });

  const TOM = '22222222-2222-4222-8222-222222222222';
  const ANNA = '33333333-3333-4333-8333-333333333333';

  it('loads the thread on demand, comments and replies inside a thread', async () => {
    const posted: unknown[] = [];
    server.use(
      http.get(COMMENTS_URL, () =>
        HttpResponse.json({
          success: true,
          comments: [
            {
              id: 'c1',
              shareId: SHARE,
              parentId: null,
              userId: TOM,
              authorName: 'Tom Krüger',
              body: 'Das Zitat nach vorne.',
              createdAt: '2026-09-26T09:00:00Z',
            },
          ],
        })
      ),
      http.post(COMMENTS_URL, async ({ request }) => {
        const body = (await request.json()) as { body: string; parentId?: string };
        posted.push(body);
        return HttpResponse.json(
          {
            success: true,
            comment: {
              id: `c${posted.length + 1}`,
              shareId: SHARE,
              parentId: body.parentId ?? null,
              userId: 'me',
              authorName: 'Moritz Wächter',
              body: body.body,
              createdAt: '2026-09-27T09:00:00Z',
            },
          },
          { status: 201 }
        );
      })
    );

    const { user, container } = renderWithProviders(<GroupFeedCard {...baseProps} />);
    const toggle = screen.getByRole('button', { name: 'Kommentare (1)' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);

    expect(await screen.findByText('Das Zitat nach vorne.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Antworten' }));
    const replyBox = screen.getByRole('textbox', { name: 'Antwort an Tom Krüger' });
    expect(replyBox).toHaveValue('@Tom ');
    expect(replyBox).toHaveFocus();

    await user.type(replyBox, 'mach ich.{Enter}');
    // Die Vorbelegung ist eine echte Erwähnung: gespeichert als Token, gezeigt als @Tom.
    await waitFor(() =>
      expect(posted).toEqual([{ body: `@[Tom](user:${TOM}) mach ich.`, parentId: 'c1' }])
    );

    const replies = await screen.findByRole('list', { name: 'Antworten auf Tom Krüger' });
    expect(within(replies).getByText('@Tom')).toHaveClass('font-semibold');
    expect(within(replies).getByText('mach ich.', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Antwort an Tom Krüger' })).toBeNull();

    await user.type(screen.getByRole('textbox', { name: 'Kommentar schreiben' }), 'Neuer Punkt');
    await user.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(posted.at(-1)).toEqual({ body: 'Neuer Punkt' }));
    expect(await axe(container)).toHaveNoViolations();
  });

  it('names the person answered when replying to a reply', async () => {
    const posted: unknown[] = [];
    server.use(
      http.get(COMMENTS_URL, () =>
        HttpResponse.json({
          success: true,
          comments: [
            {
              id: 'c1',
              shareId: SHARE,
              parentId: null,
              userId: TOM,
              authorName: 'Tom Krüger',
              body: 'Oben',
              createdAt: '2026-09-26T09:00:00Z',
            },
            {
              id: 'c2',
              shareId: SHARE,
              parentId: 'c1',
              userId: ANNA,
              authorName: 'Anna Lorenz',
              body: 'Darunter',
              createdAt: '2026-09-26T10:00:00Z',
            },
          ],
        })
      ),
      http.post(COMMENTS_URL, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ success: false }, { status: 500 });
      })
    );
    const { user } = renderWithProviders(<GroupFeedCard {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Kommentare (1)' }));
    const replies = await screen.findByRole('list', { name: 'Antworten auf Tom Krüger' });
    await user.click(within(replies).getByRole('button', { name: 'Antworten' }));

    const box = screen.getByRole('textbox', { name: 'Antwort an Anna Lorenz' });
    expect(box).toHaveValue('@Anna ');
    await user.type(box, 'ok{Enter}');
    await waitFor(() =>
      expect(posted).toEqual([{ body: `@[Anna](user:${ANNA}) ok`, parentId: 'c1' }])
    );
  });

  it('closes an open reply with Escape', async () => {
    server.use(
      http.get(COMMENTS_URL, () =>
        HttpResponse.json({
          success: true,
          comments: [
            {
              id: 'c1',
              shareId: SHARE,
              parentId: null,
              userId: TOM,
              authorName: 'Tom Krüger',
              body: 'Oben',
              createdAt: '2026-09-26T09:00:00Z',
            },
          ],
        })
      )
    );
    const { user } = renderWithProviders(<GroupFeedCard {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Kommentare (1)' }));
    await user.click(await screen.findByRole('button', { name: 'Antworten' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Antwort an Tom Krüger' })).toBeNull();
  });

  it('hides comments where the group does not allow them', () => {
    renderWithProviders(<GroupFeedCard {...baseProps} canComment={false} />);
    expect(screen.queryByRole('button', { name: /Kommentare/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reaktion hinzufügen' })).not.toBeInTheDocument();
  });

  const REACTIONS_URL = 'http://localhost/api/auth/reactions/:entityType/:entityId/:emoji';

  it('reacts to the post itself', async () => {
    const seen: unknown[] = [];
    server.use(
      http.put(REACTIONS_URL, ({ params }) => {
        seen.push({ ...params });
        return HttpResponse.json({ reactions: [{ emoji: '🎉', count: 3, reacted: true }] });
      })
    );
    const reacted = {
      ...item,
      share: { ...item.share!, reactions: [{ emoji: '🎉', count: 2, reacted: false }] },
    };
    const { user } = renderWithProviders(<GroupFeedCard {...baseProps} item={reacted} />);
    const chip = screen.getByRole('button', { name: '🎉 – 2 Reaktionen' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await user.click(chip);
    await waitFor(() =>
      expect(seen).toEqual([{ entityType: 'group_share', entityId: SHARE, emoji: '🎉' }])
    );
  });

  it('reacts to a comment: the chip appears with its count and pressed', async () => {
    const seen: unknown[] = [];
    let reactions: { emoji: string; count: number; reacted: boolean }[] = [];
    server.use(
      http.get(COMMENTS_URL, () =>
        HttpResponse.json({
          success: true,
          comments: [
            {
              id: 'c1',
              shareId: SHARE,
              parentId: null,
              userId: TOM,
              authorName: 'Tom Krüger',
              body: 'Das Zitat nach vorne.',
              createdAt: '2026-09-26T09:00:00Z',
              reactions,
            },
          ],
        })
      ),
      http.put(REACTIONS_URL, ({ params }) => {
        seen.push({ ...params });
        reactions = [{ emoji: '👍', count: 1, reacted: true }];
        return HttpResponse.json({ reactions });
      })
    );
    const { user, container } = renderWithProviders(<GroupFeedCard {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'Kommentare (1)' }));
    const comment = (await screen.findByText('Das Zitat nach vorne.')).closest('li')!;
    await user.click(within(comment).getByRole('button', { name: 'Reaktion hinzufügen' }));
    await user.click(await screen.findByRole('button', { name: 'Mit 👍 reagieren' }));

    const chip = await within(comment).findByRole('button', { name: '👍 – 1 Reaktion, von dir' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(seen).toEqual([{ entityType: 'group_comment', entityId: 'c1', emoji: '👍' }])
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('GroupFeedCard — Beitrag', () => {
  const POST = '22222222-2222-4222-8222-222222222222';
  const postItem: GroupFeedItem = {
    ...item,
    key: `group_post:${POST}`,
    id: POST,
    contentType: 'group_post',
    kind: 'post',
    title: 'Wer hilft am Samstag?',
    share: { ...item.share!, pinnedAt: null, pinnedByName: null, note: null },
    post: {
      body: 'Wer hilft am Samstag?',
      authorId: 'me',
      editedAt: null,
      files: [
        { id: 'f1', name: 'Stand.jpg', mimeType: 'image/jpeg', sizeBytes: 2048, isImage: true },
        {
          id: 'f2',
          name: 'Plan.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 421_000,
          isImage: false,
        },
      ],
    },
  };

  it('shows text, images and downloadable files without an open button', async () => {
    const { container } = renderWithProviders(<GroupFeedCard {...baseProps} item={postItem} />);
    expect(screen.getByText('Wer hilft am Samstag?')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Stand.jpg' })).toHaveAttribute(
      'src',
      `/api/auth/groups/${GROUP}/posts/${POST}/files/f1`
    );
    expect(screen.getByRole('link', { name: 'Plan.pdf herunterladen' })).toHaveAttribute(
      'href',
      `/api/auth/groups/${GROUP}/posts/${POST}/files/f2`
    );
    expect(screen.getByText('411 KB')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Öffnen' })).not.toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lets the author edit the text', async () => {
    let patched: unknown = null;
    server.use(
      http.patch(`http://localhost/api/auth/groups/${GROUP}/posts/${POST}`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ success: true });
      })
    );
    const { user } = renderWithProviders(<GroupFeedCard {...baseProps} item={postItem} />);
    await user.click(screen.getByRole('button', { name: 'Aktionen für diesen Beitrag' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Bearbeiten' }));
    const box = screen.getByRole('textbox', { name: 'Beitrag bearbeiten' });
    await user.clear(box);
    await user.type(box, 'Samstag 10 Uhr');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(patched).toEqual({ body: 'Samstag 10 Uhr' }));
  });

  it('offers other members no actions, but admins may delete', async () => {
    const other = { ...postItem, post: { ...postItem.post!, authorId: 'someone' } };
    const { unmount } = renderWithProviders(<GroupFeedCard {...baseProps} item={other} />);
    expect(
      screen.queryByRole('button', { name: 'Aktionen für diesen Beitrag' })
    ).not.toBeInTheDocument();
    unmount();

    const { user } = renderWithProviders(<GroupFeedCard {...baseProps} item={other} isAdmin />);
    await user.click(screen.getByRole('button', { name: 'Aktionen für diesen Beitrag' }));
    expect(screen.queryByRole('menuitem', { name: 'Bearbeiten' })).not.toBeInTheDocument();
    expect(await screen.findByRole('menuitem', { name: 'Beitrag löschen' })).toBeInTheDocument();
  });
});
