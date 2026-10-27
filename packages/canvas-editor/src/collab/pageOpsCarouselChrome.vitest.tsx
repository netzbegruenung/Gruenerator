/**
 * Every structural page op of `useYjsPages` (add, insert, duplicate, remove,
 * move, replace the deck) keeps a composed carousel's chrome true: the page
 * number k/n and the swipe arrow on all slides but the last. Pages of other
 * templates count towards n and are left alone; converting a page and state
 * writes do not touch the chrome.
 */
import { readPages } from '@ggraphic/editor/collab/pagesDoc';
import { type SharepicSlide } from '@gruenerator/contracts';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { CanvasEditorProvider, type CanvasEditorServices } from '../CanvasEditorProvider';
import { composeSharepic } from '../composer/composeSharepic';
import { grueneratorCarousel } from '../composer/sharepicServices';

import { useYjsPages } from './useYjsPages';

import type { AdditionalText } from '../configs/types';

/** What the editor host passes in apps/web. */
const HOST: CanvasEditorServices = { carousel: grueneratorCarousel };

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

const slide = (text: string): SharepicSlide => ({
  background: { kind: 'farbe', color: 'dunkeltanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'absatz', text }],
  logo: false,
});

const composed = (texts: string[]) =>
  composeSharepic(
    { locale: 'de-DE', slides: texts.map(slide), seitenzahl: 'bruch' },
    { photoSrc: (f: string) => `/media/${f}`, measure }
  ).slides.map((s) => s as unknown as Record<string, unknown>);

function setup() {
  const doc = new Y.Doc();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CanvasEditorProvider services={HOST}>{children}</CanvasEditorProvider>
  );
  const hook = renderHook(() => useYjsPages(doc, true), { wrapper });
  const [a, b, c] = composed(['Eins', 'Zwei', 'Drei']);
  act(() =>
    hook.result.current!.seedIfEmpty([
      { id: 'a', configId: 'freeform', state: a! },
      { id: 'b', configId: 'freeform', state: b! },
      { id: 'c', configId: 'freeform', state: c! },
    ])
  );
  const api = () => hook.result.current!;
  return { doc, api };
}

const textOf = (state: Record<string, unknown>, id: string) =>
  ((state.additionalTexts ?? []) as AdditionalText[]).find((t) => t.id === id)?.text ?? null;

/** Per page: id, page number, arrow in the layer order. */
const chrome = (doc: Y.Doc) =>
  readPages(doc).map((v) => [
    v.id,
    textOf(v.state, 'sc-seite'),
    ((v.state.layerOrder ?? []) as string[]).includes('sc-pfeil'),
  ]);

describe('useYjsPages: carousel chrome after page ops', () => {
  it('starts from the composed deck', () => {
    const { doc } = setup();
    expect(chrome(doc)).toEqual([
      ['a', '1/3', true],
      ['b', '2/3', true],
      ['c', '3/3', false],
    ]);
  });

  it('renumbers after removing a page and takes the arrow off the new last one', () => {
    const { doc, api } = setup();
    act(() => api().removePage('c'));
    expect(chrome(doc)).toEqual([
      ['a', '1/2', true],
      ['b', '2/2', false],
    ]);
  });

  it('renumbers after duplicating a page', () => {
    const { doc, api } = setup();
    let copy: string | null = null;
    act(() => {
      copy = api().duplicatePage('c');
    });
    expect(chrome(doc)).toEqual([
      ['a', '1/4', true],
      ['b', '2/4', true],
      ['c', '3/4', true],
      [copy, '4/4', false],
    ]);
  });

  it('moves the arrow with the page order', () => {
    const { doc, api } = setup();
    act(() => api().movePage('c', 'up'));
    expect(chrome(doc)).toEqual([
      ['a', '1/3', true],
      ['c', '2/3', true],
      ['b', '3/3', false],
    ]);
  });

  it('counts an added or inserted page of another template and leaves it alone', () => {
    const { doc, api } = setup();
    act(() => api().addPage({ id: 'z', configId: 'zitat', state: { quote: 'x' } }));
    expect(chrome(doc)).toEqual([
      ['a', '1/4', true],
      ['b', '2/4', true],
      ['c', '3/4', true],
      ['z', null, false],
    ]);
    expect(readPages(doc).find((v) => v.id === 'z')!.state).toEqual({ quote: 'x' });

    act(() => api().insertPage(0, { id: 'y', configId: 'zitat', state: { quote: 'y' } }));
    expect(chrome(doc)).toEqual([
      ['y', null, false],
      ['a', '2/5', true],
      ['b', '3/5', true],
      ['c', '4/5', true],
      ['z', null, false],
    ]);
  });

  it('renumbers after replacing the deck', () => {
    const { doc, api } = setup();
    // A slide of a longer deck: a deck of one has no page number.
    const d = composed(['Eins', 'Zwei', 'Drei', 'Vier'])[3];
    act(() => {
      api().replaceDeck({
        updates: [],
        inserts: [{ afterPageId: 'c', configId: 'freeform', state: d!, pageId: 'd' }],
        removes: ['a'],
      });
    });
    expect(chrome(doc)).toEqual([
      ['b', '1/3', true],
      ['c', '2/3', true],
      ['d', '3/3', false],
    ]);
  });

  it('leaves the chrome alone on a state write and on converting a page', () => {
    const { doc, api } = setup();
    act(() => api().updatePageState('a', { backgroundColor: '#000000' }));
    act(() => api().setPageConfig('c', 'zitat', { quote: 'x' }));
    expect(chrome(doc)).toEqual([
      ['a', '1/3', true],
      ['b', '2/3', true],
      ['c', null, false],
    ]);
  });

  it('undoes the chrome with the page op', () => {
    const { doc, api } = setup();
    act(() => api().removePage('c'));
    act(() => api().undoPageOp());
    expect(chrome(doc)).toEqual([
      ['a', '1/3', true],
      ['b', '2/3', true],
      ['c', '3/3', false],
    ]);
  });
});
