/**
 * A Grünerator-Block from the Elemente panel (click) or dropped onto a page:
 * the host composes it on the page's ground, the editor cuts its elements
 * loose, places them (centred, or on the drop point) and adds them to the
 * page as its own elements. Runs on the real freeform page and the real
 * composer; the host's `composeBlock` is the composition apps/web runs.
 */
import { sharepicBlockSpec, type SharepicBlock } from '@gruenerator/contracts';
import { act, cleanup, render } from '@testing-library/react';
import Konva from 'konva';
import React, { createRef } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CanvasEditorProvider, type CanvasEditorServices } from '../../../CanvasEditorProvider';
import { composeSharepic, SHAREPIC_COLOR_HEX } from '../../../composer/composeSharepic';
import { grueneratorBlocks } from '../../../composer/sharepicServices';
import { loadCanvasConfig } from '../../../configs/configLoader';
import { AutoSaveStoreProvider } from '../../../stores/AutoSaveStoreProvider';
import { GenericCanvas, type GenericCanvasRef } from '../../GenericCanvas';
import { BlockInsertProvider, useBlockInsert, type BlockInsertApi } from '../blockInsert';

import type { AdditionalText } from '../../../configs/types';

const BLOCK: SharepicBlock = {
  id: 'de-block-liste',
  titel: 'Liste',
  gruppe: 'listen',
  stichworte: [],
  color: 'mint',
  locale: 'de-DE',
  items: [{ type: 'liste', stil: 'pfeile', items: ['Mehr Busse', 'Radwege'] }],
};
const AT_BLOCK: SharepicBlock = { ...BLOCK, id: 'at-block-liste', locale: 'de-AT' };

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;

const composeBlock = vi.fn(
  async (
    block: SharepicBlock,
    { format, color }: { format: 'post-portrait' | 'post-portrait-tall'; color: string }
  ) => {
    const spec = sharepicBlockSpec(block.locale, { ...block, color } as SharepicBlock, format);
    return composeSharepic(spec, { photoSrc: (f) => `/media/${f}`, measure, kiLabel: false })
      .slides[0]!;
  }
);

/** The services apps/web passes for blocks (plus its Vorlagen catalogue). */
const HOST: CanvasEditorServices = {
  blocks: grueneratorBlocks,
  vorlagen: {
    listSeiten: async () => [],
    composeSeite: async () => [],
    listBloecke: async () => [BLOCK, AT_BLOCK],
    composeBlock,
  },
};

let measureContext: { measureText: unknown } | null = null;
let realMeasureText: unknown = null;

beforeAll(async () => {
  // Fixed advance per character: block bounds measure text, and the
  // machine's fonts must not move the placement.
  const { createCanvas } = await import('@napi-rs/canvas');
  const context = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as {
    measureText(this: { font: string }, text: string): unknown;
  };
  realMeasureText = context.measureText;
  context.measureText = function measureText(this: { font: string }, text: string) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    const width = [...text].length * size * 0.55;
    return {
      width,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: width,
      actualBoundingBoxAscent: size * 0.8,
      actualBoundingBoxDescent: size * 0.2,
      fontBoundingBoxAscent: size * 0.9,
      fontBoundingBoxDescent: size * 0.25,
    };
  };
  measureContext = context;
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
  });
});

afterAll(() => {
  if (measureContext) measureContext.measureText = realMeasureText;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  composeBlock.mockClear();
  for (const stage of [...Konva.stages]) stage.destroy();
});

async function setup(page: Record<string, unknown> = {}, configId = 'freeform') {
  const config = await loadCanvasConfig(configId as 'freeform');
  const ref = createRef<GenericCanvasRef>();
  const canvasRefsRef = { current: [ref] };
  let live: Record<string, unknown> = {};
  let api: BlockInsertApi | null = null;
  function Probe() {
    api = useBlockInsert();
    return null;
  }
  await act(async () => {
    render(
      <CanvasEditorProvider services={HOST}>
        <AutoSaveStoreProvider>
          <BlockInsertProvider
            pages={[{ configId }]}
            currentPageIndex={0}
            formatId="post-portrait"
            canvasRefsRef={canvasRefsRef}
          >
            <Probe />
            <GenericCanvas
              forwardedRef={ref}
              config={config as never}
              formatId="post-portrait"
              initialProps={page}
              onExport={() => {}}
              onCancel={() => {}}
              autoSave={false}
              onLiveState={(state) => {
                live = state;
              }}
            />
          </BlockInsertProvider>
        </AutoSaveStoreProvider>
      </CanvasEditorProvider>
    );
  });
  for (let i = 0; i < 50 && !(api as BlockInsertApi | null)?.bloecke.length; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  return { api: () => api, live: () => live };
}

const TOKEN = /^(chart-)?blk-[a-z0-9]*-/;
const norm = (id: string) =>
  id.replace(TOKEN, (_, chart: string | undefined) => `${chart ?? ''}blk-T-`);

/** The block's elements on the page: ids without the random token, rounded positions. */
function blockOn(state: Record<string, unknown>) {
  const own = <T extends { id: string }>(key: string) =>
    ((state[key] ?? []) as T[]).filter((e) => TOKEN.test(e.id));
  return {
    texts: own<AdditionalText>('additionalTexts').map((t) => ({
      id: norm(t.id),
      text: t.text,
      x: Math.round(t.x),
      y: Math.round(t.y),
    })),
    shapes: own<{ id: string; x: number; y: number }>('shapeInstances').map((s) => ({
      id: norm(s.id),
      x: Math.round(s.x),
      y: Math.round(s.y),
    })),
    layerOrder: ((state.layerOrder ?? []) as string[]).filter((id) => TOKEN.test(id)).map(norm),
  };
}

describe('block insert into a page', () => {
  it('offers the blocks of the page’s country', async () => {
    const { api } = await setup();
    expect(api()?.bloecke.map((b) => b.id)).toEqual(['de-block-liste']);
  });

  it('composes on the page’s brand ground and adds the block centred', async () => {
    const { api, live } = await setup({
      backgroundMode: 'color',
      backgroundColor: SHAREPIC_COLOR_HEX.tanne,
    });
    let ok = false;
    await act(async () => {
      ok = await api()!.insert('de-block-liste');
    });
    expect(ok).toBe(true);
    expect(composeBlock).toHaveBeenCalledTimes(1);
    expect(composeBlock.mock.calls[0]![1]).toEqual({ format: 'post-portrait', color: 'tanne' });
    expect(blockOn(live())).toMatchSnapshot();
  });

  it('composes on the country’s dark ground on a photo and falls back to the block’s colour', async () => {
    const photo = await setup({ backgroundMode: 'image', backgroundColor: '#123456' });
    await act(async () => {
      await photo.api()!.insert('de-block-liste');
    });
    expect(composeBlock.mock.calls[0]![1]).toEqual({ format: 'post-portrait', color: 'tanne' });
    cleanup();

    const other = await setup({ backgroundMode: 'color', backgroundColor: '#123456' });
    await act(async () => {
      await other.api()!.insert('de-block-liste');
    });
    expect(composeBlock.mock.calls[1]![1]).toEqual({ format: 'post-portrait', color: 'mint' });
  });

  it('places a dropped block on the drop point', async () => {
    // jsdom draws no hit graph: nothing is under the pointer.
    vi.spyOn(Konva.Stage.prototype, 'getIntersection').mockReturnValue(null);
    const { api, live } = await setup();
    await act(async () => {
      await api()!.insert('de-block-liste', { at: { clientX: 120, clientY: 160 } });
    });
    const dropped = blockOn(live());
    expect(dropped.texts.length).toBeGreaterThan(0);
    expect(dropped).toMatchSnapshot();
  });

  it('refuses a block of another country', async () => {
    const { api, live } = await setup();
    let ok = true;
    await act(async () => {
      ok = await api()!.insert('at-block-liste');
    });
    expect(ok).toBe(false);
    expect(composeBlock).not.toHaveBeenCalled();
    expect(blockOn(live()).texts).toEqual([]);
  });

  it('offers no blocks on a page of another template', async () => {
    const { api } = await setup({}, 'zitat');
    expect(api()).toBeNull();
  });
});
