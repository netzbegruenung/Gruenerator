import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { axe } from '../../../test-utils';

import { ThreadSearch, type SearchableThread } from './thread-search';

/**
 * The regression these guard is deviation 2 in the file's header: upstream
 * filters `threads` itself with `${title} ${preview}`.includes(query). Our hits
 * come from a server that matched message BODIES, so re-running that filter
 * silently drops every hit whose title does not repeat the search term — the
 * whole point of the feature. A re-sync that restores the upstream line breaks
 * nothing visibly except this test.
 */
function thread(over: Partial<SearchableThread> = {}): SearchableThread {
  return {
    id: 'thread-1',
    title: 'Wochenplanung',
    group: 'Heute',
    preview: '…mehr Windkraft im Landkreis…',
    href: '/chat/wochenplanung-ab12cd',
    ...over,
  };
}

function renderSearch(props: Partial<Parameters<typeof ThreadSearch>[0]> = {}) {
  return render(
    <ThreadSearch
      threads={[thread()]}
      query="windkraft"
      activeId={null}
      minQueryLength={2}
      {...props}
    />
  );
}

describe('ThreadSearch', () => {
  it('renders a hit whose title does not contain the query', () => {
    renderSearch();

    // "windkraft" appears only in the body excerpt, never in "Wochenplanung".
    expect(screen.getByText('Wochenplanung')).toBeInTheDocument();
  });

  it('shows the empty state only once the query is long enough', () => {
    const { rerender } = renderSearch({ threads: [], query: 'w' });
    expect(screen.queryByText(/Keine Chats/)).not.toBeInTheDocument();

    rerender(<ThreadSearch threads={[]} query="wi" activeId={null} minQueryLength={2} />);
    expect(screen.getByText(/Keine Chats für «wi» gefunden/)).toBeInTheDocument();
  });

  it('yields to a status line instead of claiming there is nothing', () => {
    renderSearch({ threads: [], status: <span>Suche läuft…</span> });

    expect(screen.getByText('Suche läuft…')).toBeInTheDocument();
    expect(screen.queryByText(/Keine Chats/)).not.toBeInTheDocument();
  });

  it('makes every row a real link carrying its destination', () => {
    renderSearch();

    expect(screen.getByRole('link', { name: /Wochenplanung/ })).toHaveAttribute(
      'href',
      '/chat/wochenplanung-ab12cd'
    );
  });

  it('leaves a modifier-click to the browser', () => {
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    const row = screen.getByRole('link', { name: /Wochenplanung/ });

    fireEvent.click(row, { metaKey: true });
    fireEvent.click(row, { ctrlKey: true });
    fireEvent.click(row, { shiftKey: true });
    fireEvent.click(row, { button: 1 });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects on a plain click', async () => {
    const onSelect = vi.fn();
    renderSearch({ onSelect });

    await userEvent.click(screen.getByRole('link', { name: /Wochenplanung/ }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'thread-1' }));
  });

  it('does not navigate on ArrowDown', async () => {
    const onSelect = vi.fn();
    renderSearch({ onSelect, threads: [thread(), thread({ id: 'thread-2', title: 'Rede' })] });

    await userEvent.click(screen.getByLabelText('Chats durchsuchen'));
    await userEvent.keyboard('{ArrowDown}');

    expect(onSelect).not.toHaveBeenCalled();
  });

  it('groups pinned threads under their own heading', () => {
    renderSearch({
      threads: [thread({ id: 'p1', title: 'Angepinnt', pinned: true }), thread()],
    });

    expect(screen.getByText('Angeheftet')).toBeInTheDocument();
    expect(screen.getByText('Heute')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderSearch();

    expect(await axe(container)).toHaveNoViolations();
  });
});
