/**
 * Keyboard and display must count the SAME list.
 *
 * The arrow keys in `GrueneratorComposer` index into
 * `getFilteredMentionables(query)`; the popover hands out its own indices while
 * rendering and highlights `idx === selectedIndex`. When those two orders drift,
 * Enter inserts something other than the highlighted row — silently, because
 * both lists look plausible on their own (#2874).
 *
 * So the assertion is deliberately not "the builder agrees with itself" but
 * "the DOM agrees with the keyboard list": read the rendered options back in
 * document order and compare them to the flat list the composer walks.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  setCustomAgents,
  setUserNotebookMentionables,
  type Mentionable,
} from '../../lib/mentionables';
import { getFilteredMentionables } from '../../lib/mentionDetection';

import { MentionPopover } from './MentionPopover';

const anchorRect = { x: 0, y: 0 };

/** `@title` — what one rendered row shows, and what identifies it in the flat list. */
const rowKey = (m: Mentionable) => `${m.title}|${m.trigger}${m.mention}`;

function renderedRows(): string[] {
  return screen.getAllByRole('option').map((el) => {
    const [title, mention] = Array.from(el.querySelectorAll('p')).map((p) => p.textContent ?? '');
    return `${title}|${mention}`;
  });
}

beforeEach(() => {
  setCustomAgents([
    { id: 'own-1', name: 'Mein Rezept', slug: 'mein-rezept' },
    { id: 'own-2', name: 'Zweites Rezept', slug: 'zweites-rezept' },
  ]);
  setUserNotebookMentionables([
    { id: 'nb-1', title: 'Mein Notizbuch', slug: 'mein-notizbuch' },
    { id: 'nb-2', title: 'Ortsverband', slug: 'ortsverband' },
  ]);
});

describe('MentionPopover ↔ keyboard list', () => {
  // '' is the widest list (every category at once, including the dev-only
  // @vorlagen trigger the popover used to omit); 'notiz' is the narrow one that
  // pulls in the user's own notebooks, which the flat list used to omit.
  it.each(['', 'notiz'])('renders the keyboard list in order for query %o', (query) => {
    render(
      <MentionPopover
        query={query}
        visible
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
        selectedIndex={0}
        anchorRect={anchorRect}
      />
    );

    const flat = getFilteredMentionables(query);
    expect(flat.length).toBeGreaterThan(0);
    expect(renderedRows()).toEqual(flat.map(rowKey));
  });

  it('highlights the row Enter would insert, at every index', () => {
    const flat = getFilteredMentionables('notiz');
    expect(flat.length).toBeGreaterThan(1);

    for (let i = 0; i < flat.length; i++) {
      const { unmount } = render(
        <MentionPopover
          query="notiz"
          visible
          onSelect={vi.fn()}
          onDismiss={vi.fn()}
          selectedIndex={i}
          anchorRect={anchorRect}
        />
      );
      const selected = screen.getAllByRole('option').filter((el) => el.dataset.selected === 'true');
      expect(selected).toHaveLength(1);
      expect(selected[0].querySelector('p')?.textContent).toBe(flat[i].title);
      unmount();
    }
  });

  it('offers the user’s own notebooks — they were display-only before', () => {
    const mentions = getFilteredMentionables('notiz').map((m) => m.mention);
    expect(mentions).toContain('mein-notizbuch');
    expect(mentions).toContain('ortsverband');
  });
});
