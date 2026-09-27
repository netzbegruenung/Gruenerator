import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { type GroupFeedItem } from '@gruenerator/shared/groups';
import { screen, waitFor } from '@testing-library/react';
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
  },
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

  it('loads the thread on demand and posts a comment', async () => {
    let posted: unknown = null;
    server.use(
      http.get(COMMENTS_URL, () =>
        HttpResponse.json({
          success: true,
          comments: [
            {
              id: 'c1',
              shareId: SHARE,
              userId: 'u2',
              authorName: 'Tom Krüger',
              body: 'Das Zitat nach vorne.',
              createdAt: '2026-09-26T09:00:00Z',
            },
          ],
        })
      ),
      http.post(COMMENTS_URL, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          {
            success: true,
            comment: {
              id: 'c2',
              shareId: SHARE,
              userId: 'me',
              authorName: 'Moritz Wächter',
              body: 'Mach ich.',
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
    expect(screen.getByRole('textbox', { name: 'Kommentar schreiben' })).toHaveValue('@Tom ');

    await user.clear(screen.getByRole('textbox', { name: 'Kommentar schreiben' }));
    await user.type(screen.getByRole('textbox', { name: 'Kommentar schreiben' }), 'Mach ich.');
    await user.click(screen.getByRole('button', { name: 'Senden' }));

    await waitFor(() => expect(posted).toEqual({ body: 'Mach ich.' }));
    expect(await screen.findByText('Mach ich.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('hides comments where the group does not allow them', () => {
    renderWithProviders(<GroupFeedCard {...baseProps} canComment={false} />);
    expect(screen.queryByRole('button', { name: /Kommentare/ })).not.toBeInTheDocument();
  });
});
