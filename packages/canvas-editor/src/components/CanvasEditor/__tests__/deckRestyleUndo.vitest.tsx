/**
 * „Vorlage für alle Folien" (und das Anwenden einer mehrseitigen Vorlage)
 * ersetzt das ganze Deck in EINEM `replaceDeck`. Rückgängig in der Werkzeugleiste
 * muss diesen Schritt als Ganzes zurücknehmen — über alle Seiten. Bisher gewann
 * der Verlauf der aktiven Seite, sobald dort irgendein älterer Schritt lag: das
 * erste Rückgängig drehte nur die aktive Seite zurück (und eine ältere
 * Textänderung gleich mit), alle anderen Seiten blieben umgestaltet.
 */
import {
  CanvasEditorProvider,
  type CanvasEditorServices,
  type CanvasSpecEditBridge,
} from '@ggraphic/editor/CanvasEditorProvider';
import { buildFolie, type FolieSpec, restyleDeck } from '@gruenerator/contracts/slides';
import { act, render, screen } from '@testing-library/react';
import Konva from 'konva';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { vorlageDeckOps } from '../../../collab/vorlageDeck';
import { CanvasEditor } from '../index';

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => ({
  useOptionalUserUploads: () => null,
  UserUploadsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUserUploads: () => ({ uploads: [], refresh: () => {} }),
}));

// Der echte Vorlagen-Bereich lädt Kataloge; hier zählt nur die Deck-Brücke,
// die ihm der Editor reicht — dieselbe, über die der Picker `replaceDeck` ruft.
const bridge = vi.hoisted(() => ({ deck: null as CanvasSpecEditBridge | null }));
vi.mock('../../../sidebar/sections/VorlagenSection', () => ({
  VorlagenSection: (props: { deck: CanvasSpecEditBridge }) => {
    bridge.deck = props.deck;
    return null;
  },
}));

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

vi.stubGlobal(
  'matchMedia',
  vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
);

vi.spyOn(Konva.Stage.prototype, 'toDataURL').mockReturnValue('data:,');
Element.prototype.scrollIntoView ??= () => {};

const services: CanvasEditorServices = {
  vorlagen: { listSeiten: async () => [], composeSeite: async () => [] },
};

const headerText = (id: string, fill: string) => ({
  id,
  text: 'Überschrift',
  type: 'header',
  x: 100,
  y: 100,
  fontSize: 60,
  fontFamily: 'GrueneTypeNeue, Arial, sans-serif',
  fontStyle: 'bold',
  fill,
  width: 400,
});

const pageState = (textId: string, fill: string) => ({
  additionalTexts: [headerText(textId, fill)],
});

const settle = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

type Page = { id: string; configId: string; state: Record<string, unknown> };

const twoTextPages: Page[] = [
  { id: 'p1', configId: 'dreizeilen', state: pageState('text-1', '#ffffff') },
  { id: 'p2', configId: 'dreizeilen', state: pageState('text-2', '#ffffff') },
];

const ctx = { locale: 'de-DE', date: new Date(2026, 9, 30), title: 'Mein Deck' };
const folien: FolieSpec[] = [
  { typ: 'titel', slots: { headline: 'Klima jetzt', unterzeile: 'Rede' } },
  { typ: 'liste', slots: { headline: 'Forderungen', punkte: ['Eins', 'Zwei'] } },
];
const bandSlides: Page[] = folien.map((folie, index) => ({
  id: `p${index + 1}`,
  configId: 'freeform',
  state: buildFolie('band', folie, { ...ctx, pageNumber: index + 1, index } as never) as never,
}));

async function renderDeck(initialPages: Page[] = twoTextPages) {
  bridge.deck = null;
  await act(async () => {
    render(
      <CanvasEditorProvider services={services}>
        <CanvasEditor
          initialConfigId={initialPages[0]!.configId as 'dreizeilen'}
          formatId={initialPages[0]!.configId === 'freeform' ? 'slide-16-9' : 'post-portrait'}
          initialTab="vorlagen"
          initialProps={{}}
          initialPages={initialPages}
          onExport={() => {}}
          onCancel={() => {}}
        />
      </CanvasEditorProvider>
    );
  });
  for (let i = 0; i < 50 && (Konva.stages.length < 2 || !bridge.deck); i++) await settle();
  expect(Konva.stages.length).toBe(2);
  expect(bridge.deck).not.toBeNull();
  // Der Anfangsstand jeder Seite landet einen Takt nach dem Einhängen im Verlauf.
  await settle();
}

const textOf = (page: number, id: string) => Konva.stages[page]!.findOne<Konva.Text>(`#${id}`)!;

async function growFontOnFirstPage(id = 'text-1') {
  const node = textOf(0, id);
  const before = node.fontSize();
  await act(async () => {
    node.fire('mousedown', { evt: { button: 0 } }, true);
    node.fire('click', { evt: { button: 0 } }, true);
  });
  const [larger] = await screen.findAllByTitle('Schrift vergrößern');
  await act(async () => {
    larger!.click();
  });
  expect(node.fontSize()).toBeGreaterThan(before);
  // Die Größenänderung landet entprellt im Verlauf der Seite.
  await settle(700);
}

function restyle() {
  const deck = bridge.deck!;
  const pages = deck.getPages();
  act(() => {
    deck.replaceDeck({
      updates: pages.map((p, i) => ({
        pageId: p.id,
        state: {
          ...p.state,
          additionalTexts: [{ ...headerText(`text-${i + 1}`, '#ff0000'), fontSize: 62 }],
        },
      })),
      inserts: [],
      removes: [],
    });
  });
}

async function pressUndo() {
  await press(/^Rückgängig/);
}

async function pressRedo() {
  await press(/^Wiederholen/);
}

async function press(name: RegExp) {
  const button = screen.getAllByRole('button', { name })[0]!;
  await act(async () => {
    button.click();
  });
  await settle();
}

describe('Rückgängig nach einem Deck-Ersatz', () => {
  it('nimmt den Ersatz über alle Seiten in einem Schritt zurück, danach die ältere Textänderung', async () => {
    await renderDeck();
    await growFontOnFirstPage();

    restyle();
    await settle();
    expect(textOf(0, 'text-1').fill()).toBe('#ff0000');
    expect(textOf(1, 'text-2').fill()).toBe('#ff0000');

    await pressUndo();
    expect(textOf(0, 'text-1').fill()).toBe('#ffffff');
    expect(textOf(1, 'text-2').fill()).toBe('#ffffff');
    // Die ältere Textänderung bleibt — sie ist ein eigener, älterer Schritt.
    expect(textOf(0, 'text-1').fontSize()).toBe(62);

    await pressUndo();
    expect(textOf(0, 'text-1').fontSize()).toBe(60);
  });

  it('gilt auch für „Vorlage für alle Folien" an einem echten Deck', async () => {
    await renderDeck(bandSlides);
    const headline = () => textOf(0, 'folie-headline');
    const base = headline().fontSize();
    await growFontOnFirstPage('folie-headline');
    const grown = headline().fontSize();

    const deck = bridge.deck!;
    const current = deck.getPages();
    const next = restyleDeck(
      current.map(({ id, configId, state }) => ({ id, configId, state })),
      'cd',
      { locale: 'de-DE', date: new Date(2026, 9, 30), title: 'Mein Deck' }
    );
    act(() => {
      deck.replaceDeck(vorlageDeckOps(current, next, () => 'neu'));
    });
    await settle();
    const stile = () => deck.getPages().map((p) => p.state.deckStil);
    expect(stile()).toEqual(['cd', 'cd']);

    await pressUndo();
    expect(stile()).toEqual(['band', 'band']);
    expect(headline().fontSize()).toBe(grown);

    await pressRedo();
    expect(stile()).toEqual(['cd', 'cd']);
    await pressUndo();
    expect(stile()).toEqual(['band', 'band']);

    await pressUndo();
    expect(headline().fontSize()).toBe(base);
  });
});
