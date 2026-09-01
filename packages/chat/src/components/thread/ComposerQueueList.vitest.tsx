/**
 * The wiring between the runtime and the vendored MessageQueue element.
 *
 * The element is NOT mocked — it renders for real, so the German copy and the
 * a11y of the actual markup are covered here too. Only the two runtime hooks
 * are faked, which is the whole seam this file owns.
 *
 * What is pinned is what this file decides: the shape handed to the element
 * (label from the text parts, file names when a turn carries none, the running
 * turn read off the last user message) and that cancelling addresses the turn
 * by **id**. Removing one row shifts every later position, so an
 * index-addressed cancel would take out the wrong turn once the list is
 * touched. Upstream's own markup — numbering, the running row, the animation —
 * is upstream's business and is not asserted here.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { ComposerQueueList } from './ComposerQueueList';

type PartLike =
  | { type: 'text'; text: string }
  | { type: 'file'; filename?: string; data: string; mimeType: string };

const h = vi.hoisted(() => {
  const remove = vi.fn();
  return {
    state: {
      queue: [] as { id: string; prompt: string; parts: PartLike[] }[],
      messages: [] as { role: string; content: PartLike[] }[],
    },
    remove,
    queueItem: vi.fn((_selector: { id: string }) => ({ remove })),
  };
});

vi.mock('@assistant-ui/react', () => ({
  useAuiState: (selector: (s: unknown) => unknown) =>
    selector({
      composer: { queue: h.state.queue },
      thread: { messages: h.state.messages },
    }),
  useAui: () => ({ composer: { queueItem: h.queueItem } }),
}));

function queued(id: string, text: string) {
  return { id, prompt: text, parts: [{ type: 'text' as const, text }] };
}

function renderQueue(
  items: { id: string; prompt: string; parts: PartLike[] }[],
  running = 'Die laufende Frage'
) {
  h.state.queue = items;
  h.state.messages = [{ role: 'user', content: [{ type: 'text', text: running }] }];
  return render(<ComposerQueueList />);
}

describe('ComposerQueueList', () => {
  beforeEach(() => {
    h.state.queue = [];
    h.state.messages = [];
    h.remove.mockClear();
    h.queueItem.mockClear();
  });

  it('renders nothing while nothing is waiting', () => {
    const { container } = renderQueue([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('hands the waiting turns over in the order they will send', () => {
    renderQueue([queued('a', 'Erste Frage'), queued('b', 'Zweite Frage')]);

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Erste Frage');
    expect(rows[1]).toHaveTextContent('Zweite Frage');
  });

  it('shows the turn the queue is waiting behind', () => {
    renderQueue([queued('a', 'Erste')], 'Schreib mir einen Antrag');

    expect(screen.getByText('Schreib mir einen Antrag')).toBeVisible();
    expect(screen.getByText('läuft')).toBeVisible();
  });

  it('reads the running turn off the LAST user message, not the first', () => {
    h.state.queue = [queued('a', 'Erste')];
    h.state.messages = [
      { role: 'user', content: [{ type: 'text', text: 'Alte Frage' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Alte Antwort' }] },
      { role: 'user', content: [{ type: 'text', text: 'Neue Frage' }] },
    ];
    render(<ComposerQueueList />);

    expect(screen.getByText('Neue Frage')).toBeVisible();
    expect(screen.queryByText('Alte Frage')).not.toBeInTheDocument();
  });

  it('counts the waiting turns, singular and plural', () => {
    const { unmount } = renderQueue([queued('a', 'Eine')]);
    expect(screen.getByText('1 wartet')).toBeVisible();
    expect(screen.getByText('sobald die Antwort fertig ist')).toBeVisible();
    unmount();

    renderQueue([queued('a', 'Eine'), queued('b', 'Zwei'), queued('c', 'Drei')]);
    expect(screen.getByText('3 warten')).toBeVisible();
  });

  it('builds the label from the text parts, not the deprecated prompt field', () => {
    renderQueue([{ id: 'a', prompt: 'ALT', parts: [{ type: 'text', text: 'NEU' }] }]);

    expect(screen.getByText('NEU')).toBeVisible();
    expect(screen.queryByText('ALT')).not.toBeInTheDocument();
  });

  it('falls back to the file names when a turn carries no text', () => {
    renderQueue([
      {
        id: 'a',
        prompt: '',
        parts: [{ type: 'file', filename: 'antrag.pdf', data: 'x', mimeType: 'application/pdf' }],
      },
    ]);

    expect(screen.getByRole('listitem')).toHaveTextContent('antrag.pdf');
  });

  it('cancels the clicked turn by id, so a shifting position cannot hit the wrong one', async () => {
    const user = userEvent.setup();
    renderQueue([queued('a', 'Erste'), queued('b', 'Zweite'), queued('c', 'Dritte')]);

    await user.click(screen.getByRole('button', { name: 'Wartende Nachricht "Zweite" entfernen' }));

    expect(h.queueItem).toHaveBeenCalledExactlyOnceWith({ id: 'b' });
    expect(h.remove).toHaveBeenCalledOnce();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderQueue([queued('a', 'Erste'), queued('b', 'Zweite')]);
    expect(await axe(container)).toHaveNoViolations();
  });
});
