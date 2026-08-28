/**
 * The list of turns waiting behind a streaming run.
 *
 * Two things are pinned. The row is addressed by **id**, not by its position:
 * removing one shifts every later index, so an index-addressed click would
 * take out the wrong turn once the list has been touched. And the label comes
 * from the message parts rather than the deprecated `prompt` field, which
 * upstream removes after 2026-11-05.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { ComposerQueueList } from './ComposerQueueList';

type QueueItemLike = {
  id: string;
  prompt: string;
  parts: { type: 'text'; text: string }[];
};

const h = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    state: { queue: [] as unknown[] },
    remove,
    queueItem: vi.fn((_selector: { id: string }) => ({ remove })),
  };
});

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) =>
    selector({ composer: { queue: h.state.queue } }),
  useAui: () => ({ composer: { queueItem: h.queueItem } }),
}));

function queued(id: string, text: string): QueueItemLike {
  return { id, prompt: text, parts: [{ type: 'text', text }] };
}

function renderQueue(items: QueueItemLike[]) {
  h.state.queue = items;
  return render(<ComposerQueueList />);
}

describe('ComposerQueueList', () => {
  beforeEach(() => {
    h.state.queue = [];
    h.remove.mockClear();
    h.queueItem.mockClear();
  });

  it('renders nothing while nothing is waiting', () => {
    const { container } = renderQueue([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('numbers the waiting turns in the order they will send', () => {
    renderQueue([queued('a', 'Erste Frage'), queued('b', 'Zweite Frage')]);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Erste Frage');
    expect(rows[1]).toHaveTextContent('Zweite Frage');
    expect(screen.getByRole('button', { name: 'Wartende Nachricht 1 entfernen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Wartende Nachricht 2 entfernen' })).toBeVisible();
  });

  it('builds the label from the text parts, not the deprecated prompt field', () => {
    h.state.queue = [{ id: 'a', prompt: 'ALT', parts: [{ type: 'text', text: 'NEU' }] }];
    render(<ComposerQueueList />);

    expect(screen.getByText('NEU')).toBeVisible();
    expect(screen.queryByText('ALT')).not.toBeInTheDocument();
  });

  it('removes the clicked turn by id, so a shifting index cannot hit the wrong one', async () => {
    const user = userEvent.setup();
    renderQueue([queued('a', 'Erste'), queued('b', 'Zweite'), queued('c', 'Dritte')]);

    await user.click(screen.getByRole('button', { name: 'Wartende Nachricht 2 entfernen' }));

    expect(h.queueItem).toHaveBeenCalledWith({ id: 'b' });
    expect(h.remove).toHaveBeenCalledTimes(1);
  });

  it('says when the waiting turns will go out', () => {
    renderQueue([queued('a', 'Eine')]);
    expect(screen.getByText('Wird gesendet, sobald die Antwort fertig ist')).toBeVisible();
  });

  it('counts the waiting turns once there is more than one', () => {
    renderQueue([queued('a', 'Eine'), queued('b', 'Zwei'), queued('c', 'Drei')]);
    expect(
      screen.getByText('3 Nachrichten werden gesendet, sobald die Antwort fertig ist')
    ).toBeVisible();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderQueue([queued('a', 'Erste'), queued('b', 'Zweite')]);
    expect(await axe(container)).toHaveNoViolations();
  });
});
