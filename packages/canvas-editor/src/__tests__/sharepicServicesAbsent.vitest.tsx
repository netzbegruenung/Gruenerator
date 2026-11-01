/**
 * A host without `CanvasEditorServices.blocks` / `.carousel` (a neutral
 * editor without the sharepic composer): the editor offers no blocks, and
 * page ops leave the carousel chrome as it is. Nothing throws.
 */
import {
  CanvasEditorProvider,
  type CanvasEditorServices,
} from '@ggraphic/editor/CanvasEditorProvider';
import { readPages } from '@ggraphic/editor/collab/pagesDoc';
import { useYjsPages } from '@ggraphic/editor/collab/useYjsPages';
import { type SharepicBlock } from '@gruenerator/contracts';
import { act, render, renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  BlockInsertProvider,
  useBlockInsert,
  type BlockInsertApi,
} from '../components/CanvasEditor/blockInsert';

import type { AdditionalText } from '@ggraphic/editor/configs/types';

const BLOCK: SharepicBlock = {
  id: 'de-block-liste',
  titel: 'Liste',
  gruppe: 'listen',
  stichworte: [],
  color: 'mint',
  locale: 'de-DE',
  items: [{ type: 'liste', items: ['A'] }],
};

describe('without the sharepic host services', () => {
  it('offers no blocks, even with a block catalogue', async () => {
    const services: CanvasEditorServices = {
      vorlagen: {
        listSeiten: async () => [],
        composeSeite: async () => [],
        listBloecke: async () => [BLOCK],
        composeBlock: async () => {
          throw new Error('not reached');
        },
      },
    };
    let api: BlockInsertApi | null | undefined;
    function Probe() {
      api = useBlockInsert();
      return null;
    }
    await act(async () => {
      render(
        <CanvasEditorProvider services={services}>
          <BlockInsertProvider
            pages={[{ configId: 'freeform' }]}
            currentPageIndex={0}
            formatId="post-portrait"
            canvasRefsRef={{ current: [] }}
          >
            <Probe />
          </BlockInsertProvider>
        </CanvasEditorProvider>
      );
    });
    expect(api).toBeNull();
  });

  it('leaves the page number as it is after a page op', () => {
    const doc = new Y.Doc();
    const pages = renderHook(() => useYjsPages(doc, true));
    const label = (text: string): AdditionalText =>
      ({ id: 'sc-seite', text, x: 0, y: 0, width: 60, fontSize: 30 }) as AdditionalText;
    const page = (id: string, k: number) => ({
      id,
      configId: 'freeform',
      state: { additionalTexts: [label(`${k}/3`)], layerOrder: ['sc-seite'] },
    });
    act(() => pages.result.current!.seedIfEmpty([page('a', 1), page('b', 2), page('c', 3)]));
    act(() => pages.result.current!.removePage('c'));
    expect(
      readPages(doc).map((v) => (v.state.additionalTexts as AdditionalText[])[0]!.text)
    ).toEqual(['1/3', '2/3']);
  });
});
