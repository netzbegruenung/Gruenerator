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
  setUserAgentMentionables,
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
    { id: 'nb-1', title: 'Mein Notebook', slug: 'mein-notebook' },
    { id: 'nb-2', title: 'Ortsverband', slug: 'ortsverband' },
  ]);
  setTextforms([]);
  setUserAgentMentionables([]);
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

  /**
   * Zwei Änderungen, und die erste allein hätte es nicht getan.
   *
   * `rerender` statt Montage und Abbau je Index: ein Mount, N Aktualisierungen.
   * Als Schleife voller Vollmontagen war dieser Fall der mit Abstand teuerste
   * der Datei — gemessen 131/134/136 ms gegen 4–15 ms für jeden anderen; mit
   * `rerender` sind es 84–89 ms. Geprüft wird dasselbe, nur näher am echten
   * Ablauf: EIN Popover, dessen `selectedIndex` wandert, wie beim Druck auf die
   * Pfeiltaste.
   *
   * **Das erklärt den Ausfall aber nicht.** Der Deckel liegt bei 5 s, der Fall
   * bei 134 ms — er ist in der CI nicht an seinen eigenen Kosten gescheitert,
   * sondern an Faktor 37 unter Last (`pnpm test` fährt 24 Pakete gleichzeitig).
   * 35 % billiger heisst nur, dass er später als erster umfällt; verhindert ist
   * damit nichts. Deshalb steht die Frist ausdrücklich hier: ein Fall, der N
   * Renders macht, ist keiner, für den der Vorgabewert gedacht war. Wer sie
   * wieder streichen will, misst vorher unter Last, nicht auf einer leeren
   * Maschine.
   */
  it('highlights the row Enter would insert, at every index', { timeout: 20_000 }, () => {
    const flat = getFilteredMentionables('notiz');
    expect(flat.length).toBeGreaterThan(1);

    const popover = (index: number) => (
      <MentionPopover
        query="notiz"
        visible
        onSelect={vi.fn()}
        onDismiss={vi.fn()}
        selectedIndex={index}
        anchorRect={anchorRect}
      />
    );

    const { rerender } = render(popover(0));

    for (let i = 0; i < flat.length; i++) {
      rerender(popover(i));
      const selected = screen.getAllByRole('option').filter((el) => el.dataset.selected === 'true');
      expect(selected).toHaveLength(1);
      expect(selected[0].querySelector('p')?.textContent).toBe(flat[i].title);
    }
  });

  it('offers the user’s own notebooks — they were display-only before', () => {
    const mentions = getFilteredMentionables('notiz').map((m) => m.mention);
    expect(mentions).toContain('mein-notebook');
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
 * Grünerator-Agenten sind die dritte Quelle des Rezept-Menüs — und die einzige,
 * die eine Gruppenherkunft überhaupt haben kann (#2909). Ein Grünerator aus der
 * Gruppe darf deshalb nicht unter „eigene" stehen.
 */
describe('Grüneratoren aus einer Gruppe', () => {
  const agent = (identifier: string, title: string, sharedFromGroup: string | null) => ({
    identifier,
    title,
    description: 'Ein Grünerator',
    avatar: '🤖',
    backgroundColor: '#316049',
    sharedFromGroup,
  });

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

  it('trennt geteilte Grüneratoren von den eigenen', () => {
    setCustomAgents([]);
    setUserAgentMentionables([
      agent('mein-klima-gruenerator', 'Mein Klima-Grünerator', null),
      agent('kv-klima-gruenerator', 'KV Klima-Grünerator', 'KV Köln'),
    ]);
    renderPopover('klima');

    expect(rowTitlesUnder('eigene')).toEqual(['Mein Klima-Grünerator']);
    expect(rowTitlesUnder('aus deinen Gruppen')).toEqual(['KV Klima-Grünerator']);
  });

  it('zeigt keine Gruppen-Untergruppe, wenn nichts geteilt ist', () => {
    setCustomAgents([]);
    setUserAgentMentionables([agent('mein-klima-gruenerator', 'Mein Klima-Grünerator', null)]);
    renderPopover('klima');

    expect(rowTitlesUnder('eigene')).toEqual(['Mein Klima-Grünerator']);
    expect(screen.queryByText('aus deinen Gruppen')).toBeNull();
  });

  it('hält die Aufteilung deckungsgleich mit der Tastaturliste', () => {
    setCustomAgents([]);
    setUserAgentMentionables([
      agent('mein-klima-gruenerator', 'Mein Klima-Grünerator', null),
      agent('kv-klima-gruenerator', 'KV Klima-Grünerator', 'KV Köln'),
    ]);
    renderPopover('klima');

    expect(renderedRows()).toEqual(getFilteredMentionables('klima').map(rowKey));
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
