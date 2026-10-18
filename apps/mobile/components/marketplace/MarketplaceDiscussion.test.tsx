/* eslint-disable import-x/order -- `@jest/globals` must stay the first import so
   babel-plugin-jest-hoist keeps it above the hoisted `jest.mock` factories
   (see components/chat/ConfirmActionCard.test.tsx). */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type EntityComment, type MarketplaceItemOf } from '@gruenerator/contracts';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { Share } from 'react-native';

import { useAddEntityComment, useEntityComments } from '@gruenerator/shared/comments';
import { useAuthStore } from '@gruenerator/shared/stores';

import { submitReport } from '../common/submitReport';

import { MarketplaceDiscussion } from './MarketplaceDiscussion';

const mockLike = jest.fn();
const mockAdd = jest.fn<(input: { body: string; parentId?: string }) => Promise<unknown>>();
jest.mock('@gruenerator/shared/comments', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/comments'),
  useEntityComments: jest.fn(),
  useAddEntityComment: jest.fn(),
  useDeleteEntityComment: () => ({ mutate: jest.fn() }),
  useToggleItemReaction: () => ({ toggle: jest.fn() }),
  useToggleCommentReaction: () => ({ toggle: jest.fn() }),
}));
jest.mock('@gruenerator/shared/marketplace', () => ({
  ...jest.requireActual<Record<string, unknown>>('@gruenerator/shared/marketplace'),
  useMarketplaceLike: () => ({ mutate: mockLike }),
}));
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('../../hooks/useHiddenMembers', () => ({ useHiddenMemberIds: () => new Set() }));
jest.mock('../common/confirmHidePerson', () => ({ confirmHidePerson: jest.fn() }));
jest.mock('../common/submitReport', () => ({ submitReport: jest.fn() }));
jest.mock('../common/Skeleton', () => ({ SkeletonRows: () => null }));
// The real sheet is a Modal with keyboard handling; only its content matters here.
jest.mock('../common/BottomSheet', () => ({
  BottomSheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? children : null,
}));

const mockComments = useEntityComments as unknown as jest.Mock;
const mockAddHook = useAddEntityComment as unknown as jest.Mock;
const mockSubmit = submitReport as unknown as jest.Mock<typeof submitReport>;

const recipe = {
  key: 'recipe:r1',
  ref: 'r1',
  kind: 'recipe',
  origin: 'oeffentlich',
  title: 'Presse-Rezept',
  description: null,
  thumbnailUrl: null,
  iconKey: null,
  authorName: 'Kim',
  audience: 'all',
  likesCount: 2,
  liked: false,
  saved: false,
  isOwn: false,
  reportKind: 'text_form',
  createdAt: null,
  recipe: { mention: 'presse', rowId: 'r1', skillCategory: null, system: false },
} as unknown as MarketplaceItemOf<'recipe'>;

const comment = (over: Partial<EntityComment>): EntityComment =>
  ({
    id: 'c1',
    entityType: 'recipe',
    entityId: 'r1',
    parentId: null,
    userId: 'other',
    authorName: 'Kim Grün',
    body: 'Super Rezept',
    createdAt: '2026-10-01T10:00:00Z',
    reactions: [],
    ...over,
  }) as EntityComment;

function setup(comments: EntityComment[]) {
  mockComments.mockReturnValue({
    isPending: false,
    isError: false,
    data: { reactions: [], comments },
  });
  mockAdd.mockResolvedValue({});
  mockAddHook.mockReturnValue({ mutateAsync: mockAdd });
  mockSubmit.mockResolvedValue('done');
}

async function sendReport() {
  fireEvent.press(screen.getByRole('radio', { name: 'Sonstiges' }));
  await act(async () => {
    // The form's own „Melden" comes last, after the item's.
    fireEvent.press(screen.getAllByRole('button', { name: 'Melden' }).at(-1)!);
  });
}

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'me' } as never });
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

const target = { kind: 'recipe', ref: 'r1' } as const;

describe('MarketplaceDiscussion', () => {
  it('likes, shares and reports the item', async () => {
    setup([]);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' });
    render(
      <MarketplaceDiscussion
        target={target}
        item={recipe}
        canModerate={false}
        shareUrl="https://gruenerator.eu/marktplatz?item=recipe%3Ar1"
      />
    );

    fireEvent.press(screen.getByText('Gefällt mir (2)'));
    expect(mockLike).toHaveBeenCalledWith(recipe, expect.anything());

    fireEvent.press(screen.getByText('Teilen'));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://gruenerator.eu/marktplatz?item=recipe%3Ar1' })
    );

    fireEvent.press(screen.getByText('Melden'));
    await sendReport();
    expect(mockSubmit).toHaveBeenCalledWith({ kind: 'text_form', targetId: 'r1' }, 'other', '');
    expect(screen.getByText('Noch keine Kommentare. Schreib den ersten.')).toBeTruthy();
  });

  it('answers a reply in the thread of its comment', async () => {
    setup([
      comment({}),
      comment({ id: 'c2', parentId: 'c1', userId: 'me', authorName: 'Ich', body: 'Danke' }),
    ]);
    render(<MarketplaceDiscussion target={target} item={recipe} canModerate={false} />);

    // A reply to a reply still hangs on the thread's first comment.
    fireEvent.press(screen.getByRole('button', { name: 'Ich antworten' }));
    fireEvent.changeText(screen.getByLabelText('Ich antworten …'), 'Gern');
    await act(async () => {
      fireEvent.press(screen.getAllByRole('button', { name: 'Senden' })[0]!);
    });
    expect(mockAdd).toHaveBeenCalledWith({ body: 'Gern', parentId: 'c1' });
  });

  it('reports someone else’s comment as an entity_comment, not one’s own', async () => {
    setup([comment({}), comment({ id: 'c2', userId: 'me', authorName: 'Ich' })]);
    render(<MarketplaceDiscussion target={target} item={null} canModerate={false} />);

    // No item: neither like nor item report.
    expect(screen.queryByText('Gefällt mir (2)')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: 'Optionen für den Kommentar von Ich' }));
    expect(screen.queryByText('Melden')).toBeNull();
    expect(screen.getByText('Kommentar löschen')).toBeTruthy();

    fireEvent.press(
      screen.getByRole('button', { name: 'Optionen für den Kommentar von Kim Grün' })
    );
    fireEvent.press(screen.getByText('Melden'));
    act(() => {
      jest.runOnlyPendingTimers();
    });
    await sendReport();
    expect(mockSubmit).toHaveBeenCalledWith(
      { kind: 'entity_comment', targetId: 'c1' },
      'other',
      ''
    );
  });

  it('offers no report inside a sheet', () => {
    setup([comment({})]);
    render(
      <MarketplaceDiscussion
        target={target}
        item={recipe}
        canModerate={false}
        allowReport={false}
      />
    );
    expect(screen.queryByText('Melden')).toBeNull();
    fireEvent.press(
      screen.getByRole('button', { name: 'Optionen für den Kommentar von Kim Grün' })
    );
    expect(screen.queryByText('Melden')).toBeNull();
    expect(screen.getByText('Person ausblenden')).toBeTruthy();
  });
});
