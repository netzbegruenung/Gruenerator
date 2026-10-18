import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const comments = vi.hoisted(() => ({
  data: { reactions: [], comments: [] as unknown[] } as unknown,
  isLoading: false,
  isError: false,
}));
const ownTemplates = vi.hoisted(() => ({ data: [] as Array<{ id: string }> }));

vi.mock('@gruenerator/shared/comments', () => ({
  useEntityComments: () => comments,
  useAddEntityComment: () => ({ mutateAsync: vi.fn() }),
  useDeleteEntityComment: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleCommentReaction: () => ({ toggle: vi.fn() }),
}));
vi.mock('@/features/auth/hooks/useProfileData', () => ({
  useUserTemplates: () => ({ query: ownTemplates }),
}));
vi.mock('@/stores/authStore', () => ({
  useAuthStore: (select: (s: { user: { id: string } }) => unknown) =>
    select({ user: { id: 'me' } }),
}));

import { VorlageComments } from './VorlageComments';

const foreign = {
  id: 'c1',
  entityType: 'template',
  entityId: 't1',
  parentId: null,
  userId: 'someone-else',
  authorName: 'Anna Beispiel',
  body: 'Tolle Vorlage',
  createdAt: '2026-10-13T10:00:00Z',
  reactions: [{ emoji: '👍', count: 2, reacted: false }],
};

beforeEach(() => {
  comments.data = { reactions: [], comments: [foreign] };
  comments.isLoading = false;
  comments.isError = false;
  ownTemplates.data = [];
});

describe('VorlageComments', () => {
  it('lists the comments with their reactions', () => {
    render(<VorlageComments templateId="t1" />);
    expect(screen.getByText('Tolle Vorlage')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '👍 – 2 Reaktionen' })).toBeInTheDocument();
  });

  it("only lets the Vorlage's owner delete other people's comments", () => {
    const { unmount } = render(<VorlageComments templateId="t1" />);
    expect(screen.queryByRole('button', { name: 'Kommentar löschen' })).toBeNull();
    unmount();

    ownTemplates.data = [{ id: 't1' }];
    render(<VorlageComments templateId="t1" />);
    expect(screen.getByRole('button', { name: 'Kommentar löschen' })).toBeInTheDocument();
  });

  it('shows a loading hint while the comments load', () => {
    comments.isLoading = true;
    comments.data = undefined;
    render(<VorlageComments templateId="t1" />);
    expect(screen.getByText('Lädt …')).toBeInTheDocument();
  });
});
