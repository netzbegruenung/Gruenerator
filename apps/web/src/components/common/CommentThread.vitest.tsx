import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { CommentThread, type ThreadComment } from './CommentThread';

const top: ThreadComment = {
  id: 'c1',
  parentId: null,
  userId: 'anna',
  authorName: 'Anna Beispiel',
  body: 'Tolle Vorlage',
  createdAt: '2026-10-13T10:00:00Z',
};
const reply: ThreadComment = {
  id: 'c2',
  parentId: 'c1',
  userId: 'ben',
  authorName: 'Ben Muster',
  body: 'Finde ich auch',
  createdAt: '2026-10-13T11:00:00Z',
};

function setup(props: Partial<Parameters<typeof CommentThread>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onDelete = vi.fn();
  const view = render(
    <CommentThread
      comments={[top, reply]}
      currentUserId="anna"
      canModerate={false}
      onSubmit={onSubmit}
      onDelete={onDelete}
      {...props}
    />
  );
  return { onSubmit, onDelete, ...view };
}

describe('CommentThread', () => {
  it('shows replies indented under their comment and an empty hint without comments', () => {
    const { unmount } = setup();
    const thread = screen.getByText('Tolle Vorlage').closest('li')!;
    expect(within(thread).getByText('Finde ich auch')).toBeInTheDocument();
    unmount();

    setup({ comments: [] });
    expect(screen.getByText('Noch keine Kommentare. Schreib den ersten.')).toBeInTheDocument();
  });

  it('only offers delete on own comments unless the viewer moderates', () => {
    const { unmount } = setup();
    expect(screen.getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(1);
    unmount();

    setup({ canModerate: true });
    expect(screen.getAllByRole('button', { name: 'Kommentar löschen' })).toHaveLength(2);
  });

  it('deletes the clicked comment', async () => {
    const user = userEvent.setup();
    const { onDelete } = setup();
    await user.click(screen.getByRole('button', { name: 'Kommentar löschen' }));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });

  it('posts a new comment and clears the field', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const input = screen.getByRole('textbox', { name: 'Kommentieren …' });
    await user.type(input, '  Danke! ');
    await user.click(screen.getByRole('button', { name: 'Senden' }));
    expect(onSubmit).toHaveBeenCalledWith({ body: 'Danke!' });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('replies to a reply on the top-level comment', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    const replyBlock = screen.getByText('Finde ich auch').closest('div')!.parentElement!;
    await user.click(within(replyBlock).getByRole('button', { name: 'Antworten' }));
    const box = screen.getByRole('textbox', { name: 'Ben antworten …' });
    await user.type(box, 'Ja');
    await user.click(within(box.closest('form')!).getByRole('button', { name: 'Senden' }));
    expect(onSubmit).toHaveBeenCalledWith({ body: 'Ja', parentId: 'c1' });
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Ben antworten …' })).toBeNull()
    );
  });

  it('keeps the text and shows the error when sending fails', async () => {
    const user = userEvent.setup();
    const { onSubmit } = setup();
    onSubmit.mockRejectedValueOnce(new Error('Kommentar konnte nicht gesendet werden.'));
    const input = screen.getByRole('textbox', { name: 'Kommentieren …' });
    await user.type(input, 'Hallo');
    await user.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByText('Kommentar konnte nicht gesendet werden.')).toBeInTheDocument();
    expect(input).toHaveValue('Hallo');
  });

  it('renders extra actions per comment', () => {
    setup({ renderActions: (c) => <span>Aktion {c.id}</span> });
    expect(screen.getByText('Aktion c1')).toBeInTheDocument();
    expect(screen.getByText('Aktion c2')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
