/**
 * „Vorlage für alle Folien": der Katalog des Hosts, die aktive Vorlage
 * gedrückt, Neu-Setzen nach Bestätigung als EIN Rückgängig-Schritt.
 */
import { CanvasEditorProvider } from '@ggraphic/editor/CanvasEditorProvider';
import {
  getPagesMap,
  readPages,
  replaceDeck,
  seedPagesIfEmpty,
} from '@ggraphic/editor/collab/pagesDoc';
import { type FolienVorlage } from '@gruenerator/contracts';
import { buildFolie, readDeckStil } from '@gruenerator/contracts/slides';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';

import { axe } from '../test-utils';

import { DeckVorlagenPicker } from './DeckVorlagenPicker';

// Kein Offscreen-Konva in jsdom: die Vorschauen bleiben beim Skeleton.
vi.mock('./renderDeckStilThumbnail', () => ({
  renderDeckStilThumbnail: () => new Promise(() => {}),
}));

const vorlage = (id: string, titel: string, stil: FolienVorlage['stil']): FolienVorlage => ({
  id,
  titel,
  beschreibung: `${titel} beschreibt sich selbst.`,
  stil,
  locale: 'de-DE',
});
const CATALOGUE = [
  vorlage('cd', 'Offiziell', 'cd'),
  vorlage('ruhig', 'Ruhig', 'ruhig'),
  vorlage('band', 'Band', 'band'),
];

const ctx = { locale: 'de-DE', date: new Date(2026, 9, 30), pageNumber: 1, title: 'Mein Deck' };
const pageOf = (id: string, stil: 'cd' | 'band', index: number, notes?: string) => ({
  id,
  configId: 'freeform',
  state: {
    ...buildFolie(
      stil,
      index === 0
        ? { typ: 'titel', slots: { headline: 'Klima jetzt', unterzeile: 'Rede' } }
        : { typ: 'liste', slots: { headline: 'Forderungen', punkte: ['Eins', 'Zwei', 'Drei'] } },
      { ...ctx, pageNumber: index + 1, index } as never
    ),
    ...(notes ? { notes } : {}),
  } as unknown as Record<string, unknown>,
});

function setup(load: (() => Promise<FolienVorlage[]>) | null, initialStil: 'cd' | 'band' = 'band') {
  const origin = Symbol('local');
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [
    pageOf('p1', initialStil, 0, 'Meine Notiz'),
    pageOf('p2', initialStil, 1),
  ]);
  const undo = new Y.UndoManager(getPagesMap(doc), {
    trackedOrigins: new Set([origin]),
    captureTimeout: 0,
  });
  const pagesNow = () =>
    readPages(doc).map((v) => ({ id: v.id, configId: v.configId, state: v.state }));
  const deck = {
    getPages: pagesNow,
    replaceDeck: vi.fn((ops: Parameters<typeof replaceDeck>[1]) => replaceDeck(doc, ops, origin)),
  };
  const tree = () => (
    <CanvasEditorProvider services={{}}>
      <DeckVorlagenPicker load={load} pages={pagesNow()} deck={deck} locale="de-DE" />
    </CanvasEditorProvider>
  );
  const view = render(tree());
  return { doc, undo, deck, pagesNow, user: userEvent.setup(), view, tree };
}

describe('DeckVorlagenPicker', () => {
  it('shows the catalogue with the active style pressed', async () => {
    const { view } = setup(async () => CATALOGUE, 'band');
    const section = await screen.findByRole('region', { name: 'Vorlage für alle Folien' });
    expect(within(section).getAllByRole('button')).toHaveLength(3);
    expect(within(section).getByRole('button', { name: /Band/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(within(section).getByRole('button', { name: /Ruhig/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it('restyles all pages after confirming and is undoable', async () => {
    const { user, pagesNow, undo, deck, doc } = setup(async () => CATALOGUE, 'band');
    const before = pagesNow();
    await user.click(await screen.findByRole('button', { name: /Ruhig/ }));

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Alle Folien in „Ruhig“ neu setzen?',
    });
    expect(within(dialog).getByText('Texte und eigene Elemente bleiben.')).toBeInTheDocument();
    expect(deck.replaceDeck).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Neu setzen' }));

    await waitFor(() => expect(deck.replaceDeck).toHaveBeenCalledTimes(1));
    const after = pagesNow();
    expect(after.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(readDeckStil(after)).toBe('ruhig');
    expect(after.every((p) => p.state.deckStil === 'ruhig')).toBe(true);
    // Texte und Notizen bleiben.
    const texts = (after[1]!.state.additionalTexts as { id: string; text: string }[]).map(
      (t) => t.text
    );
    expect(texts).toEqual(expect.arrayContaining(['Forderungen', 'Eins', 'Zwei', 'Drei']));
    expect(after[0]!.state.notes).toBe('Meine Notiz');

    // Ein Schritt zurück stellt das ganze Deck her.
    expect(undo.undoStack.length).toBe(1);
    undo.undo();
    expect(readPages(doc).map((v) => ({ id: v.id, configId: v.configId, state: v.state }))).toEqual(
      before
    );
  });

  it('does nothing on cancel', async () => {
    const { user, deck, pagesNow } = setup(async () => CATALOGUE, 'band');
    const before = pagesNow();
    await user.click(await screen.findByRole('button', { name: /Ruhig/ }));
    await user.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    expect(deck.replaceDeck).not.toHaveBeenCalled();
    expect(pagesNow()).toEqual(before);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows only Offiziell when the loader fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn(async (): Promise<FolienVorlage[]> => {
      throw new Error('offline');
    });
    const { view } = setup(load, 'cd');
    await waitFor(() => expect(load).toHaveBeenCalled());
    const section = screen.getByRole('region', { name: 'Vorlage für alle Folien' });
    await waitFor(() => expect(warn).toHaveBeenCalled());
    const buttons = within(section).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(/Offiziell/);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(await axe(view.container)).toHaveNoViolations();
    warn.mockRestore();
  });

  it('shows only Offiziell when the host has no loader', () => {
    setup(null, 'cd');
    const section = screen.getByRole('region', { name: 'Vorlage für alle Folien' });
    expect(within(section).getAllByRole('button')).toHaveLength(1);
  });
});

describe('DeckVorlagenPicker measure', () => {
  it('passes a measurer to restyleDeck so texts fit their boxes', async () => {
    const spy = vi.spyOn(await import('@gruenerator/contracts/slides'), 'restyleDeck');
    const { user } = setup(async () => CATALOGUE, 'band');
    await user.click(await screen.findByRole('button', { name: /Ruhig/ }));
    await user.click(await screen.findByRole('button', { name: 'Neu setzen' }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(typeof spy.mock.calls[0]![2].measure).toBe('function');
  });
});
