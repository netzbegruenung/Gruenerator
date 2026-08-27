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
  setTextforms,
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

/** Titles of the rows rendered under one sublabel ("eigene", "aus deinen Gruppen"). */
function rowTitlesUnder(sublabel: string): string[] {
  const group = screen.getByText(sublabel).parentElement;
  return Array.from(group?.querySelectorAll('[role="option"]') ?? []).map(
    (el) => el.querySelector('p')?.textContent ?? ''
  );
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
  setTextforms([]);
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

/**
 * "Aus deinen Gruppen" was an unreachable branch: the split reads
 * `sharedFromGroup`, but no setter accepted the field, so every shared recipe
 * rendered as one of the user’s own (#2876).
 */
describe('recipes shared from a group', () => {
  const renderPopover = (query: string) =>
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

  it('lists a shared recipe apart from the user’s own', () => {
    setTextforms([
      { mention: 'eigene-pressemitteilung', title: 'Eigene Pressemitteilung' },
      {
        mention: 'geteilte-pressemitteilung',
        title: 'Geteilte Pressemitteilung',
        sharedFromGroup: 'Ortsverband Mitte',
      },
    ]);
    renderPopover('pressemitteilung');

    expect(rowTitlesUnder('eigene')).toEqual(['Eigene Pressemitteilung']);
    expect(rowTitlesUnder('aus deinen Gruppen')).toEqual(['Geteilte Pressemitteilung']);
  });

  it('keeps the group section away when nothing is shared', () => {
    setTextforms([{ mention: 'eigene-pressemitteilung', title: 'Eigene Pressemitteilung' }]);
    renderPopover('pressemitteilung');

    expect(rowTitlesUnder('eigene')).toEqual(['Eigene Pressemitteilung']);
    expect(screen.queryByText('aus deinen Gruppen')).toBeNull();
  });

  it('keeps the split consistent with the keyboard list', () => {
    setTextforms([
      { mention: 'eigene-pressemitteilung', title: 'Eigene Pressemitteilung' },
      {
        mention: 'geteilte-pressemitteilung',
        title: 'Geteilte Pressemitteilung',
        sharedFromGroup: 'Ortsverband Mitte',
      },
    ]);
    renderPopover('pressemitteilung');

    expect(renderedRows()).toEqual(getFilteredMentionables('pressemitteilung').map(rowKey));
  });
});

/**
 * The other half of the same claim: a prompt saved from someone else's public
 * one is not the user's own either. `custom_prompts` have no group origin at all
 * (#2909), but the owner behind a saved one is on the wire — so "eigene" has to
 * stop covering it (#2876).
 */
describe('recipes saved from another user', () => {
  const renderPopover = (query: string) =>
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

  it('lists a saved recipe apart from the user’s own', () => {
    setCustomAgents([
      { id: 'own-1', name: 'Eigene Rede', slug: 'eigene-rede' },
      { id: 'saved-1', name: 'Fremde Rede', slug: 'fremde-rede', savedFromOwner: 'Alex Grün' },
    ]);
    renderPopover('rede');

    expect(rowTitlesUnder('eigene')).toEqual(['Eigene Rede']);
    expect(rowTitlesUnder('von anderen')).toEqual(['Fremde Rede']);
  });

  it('keeps a saved recipe out of “eigene” even without an owner name', () => {
    setCustomAgents([
      { id: 'own-1', name: 'Eigene Rede', slug: 'eigene-rede' },
      { id: 'saved-1', name: 'Fremde Rede', slug: 'fremde-rede', savedFromOwner: null },
    ]);
    renderPopover('rede');

    expect(rowTitlesUnder('eigene')).toEqual(['Eigene Rede']);
    expect(rowTitlesUnder('von anderen')).toEqual(['Fremde Rede']);
  });

  it('keeps the section away when nothing was saved', () => {
    setCustomAgents([{ id: 'own-1', name: 'Eigene Rede', slug: 'eigene-rede' }]);
    renderPopover('rede');

    expect(rowTitlesUnder('eigene')).toEqual(['Eigene Rede']);
    expect(screen.queryByText('von anderen')).toBeNull();
  });

  it('keeps the split consistent with the keyboard list', () => {
    setCustomAgents([
      { id: 'own-1', name: 'Eigene Rede', slug: 'eigene-rede' },
      { id: 'saved-1', name: 'Fremde Rede', slug: 'fremde-rede', savedFromOwner: 'Alex Grün' },
    ]);
    renderPopover('rede');

    expect(renderedRows()).toEqual(getFilteredMentionables('rede').map(rowKey));
  });
});
