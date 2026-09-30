import { type BoardComment } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders } from '../../../test-utils';

import { CardComments } from './CardComments';

// The @-mention popover loads members and agents; not part of this test.
vi.mock('./UserMentionPopover', () => ({ UserMentionPopover: () => null }));

const BOARD = 'b1';
const CARD = 'k1';
const COMMENTS_URL = `http://localhost/api/board-comments/${BOARD}/cards/${CARD}/comments`;
const REACTION_URL = 'http://localhost/api/auth/reactions/:entityType/:entityId/:emoji';

const base = {
  board_id: BOARD,
  card_id: CARD,
  user_id: 'u2',
  content: null,
  mentioned_user_ids: [],
  is_edited: false,
  edited_at: null,
  created_at: '2026-09-30T10:00:00Z',
  updated_at: '2026-09-30T10:00:00Z',
  author_name: 'Aileen Lorenz',
  author_avatar_robot_id: 1,
};

const comments: BoardComment[] = [
  {
    ...base,
    id: 'c1',
    parent_id: null,
    blocks: [{ type: 'text', text: 'Erster Kommentar' }],
    reactions: [
      { id: 'r1', comment_id: 'c1', user_id: 'u3', emoji: '💡', created_at: base.created_at },
    ],
    reactionSummaries: [
      { emoji: '💡', count: 1, reacted: false },
      { emoji: '👍', count: 2, reacted: true },
    ],
    replies: [
      {
        ...base,
        id: 'x1',
        parent_id: 'c1',
        blocks: [{ type: 'text', text: 'Antwort' }],
        reactions: [],
        reactionSummaries: [{ emoji: '🎉', count: 1, reacted: false }],
      },
    ],
  },
];

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function renderThread() {
  server.use(http.get(COMMENTS_URL, () => HttpResponse.json(comments)));
  return renderWithProviders(
    <Routes>
      <Route
        path="/boards/:id"
        element={
          <CardComments
            cardId={CARD}
            currentUserId="me"
            currentUserName="Moritz"
            currentUserAvatarRobotId={1}
          />
        }
      />
    </Routes>,
    { route: `/boards/${BOARD}` }
  );
}

describe('CardComments reactions', () => {
  it('renders chips from reactionSummaries, legacy emojis only as disabled chips', async () => {
    const { container } = renderThread();
    const own = await screen.findByRole('button', { name: '👍 – 2 Reaktionen, darunter deine' });
    expect(own).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '💡 – 1 Reaktion' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '🎉 – 1 Reaktion' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Reaktion hinzufügen' })).toHaveLength(2);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('removes an own reaction with DELETE', async () => {
    let seen: Record<string, unknown> | null = null;
    server.use(
      http.delete(REACTION_URL, ({ params }) => {
        seen = { ...params };
        return HttpResponse.json({ reactions: [{ emoji: '👍', count: 1, reacted: false }] });
      })
    );
    const { user } = renderThread();
    await user.click(
      await screen.findByRole('button', { name: '👍 – 2 Reaktionen, darunter deine' })
    );
    await waitFor(() =>
      expect(seen).toEqual({ entityType: 'board_comment', entityId: 'c1', emoji: '👍' })
    );
  });

  it('adds a reaction to a reply with PUT and shows it optimistically', async () => {
    let seen: Record<string, unknown> | null = null;
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.put(REACTION_URL, async ({ params }) => {
        seen = { ...params };
        // Held open so the refetch after the PUT cannot replace the optimistic chip.
        await gate;
        return HttpResponse.json({ reactions: [{ emoji: '🎉', count: 2, reacted: true }] });
      })
    );
    const { user } = renderThread();
    const reply = (await screen.findByText('Antwort')).closest('div.flex-1');
    expect(reply).not.toBeNull();
    await user.click(within(reply as HTMLElement).getByRole('button', { name: '🎉 – 1 Reaktion' }));
    expect(
      await screen.findByRole('button', { name: '🎉 – 2 Reaktionen, darunter deine' })
    ).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(seen).toEqual({ entityType: 'board_comment', entityId: 'x1', emoji: '🎉' })
    );
    release();
  });
});
