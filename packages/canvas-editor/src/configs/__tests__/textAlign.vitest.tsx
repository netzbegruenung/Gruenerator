/**
 * Textausrichtung (#4963): die Kontextleiste schreibt sie bei freien Texten in
 * `align`, bei Vorlagen-Texten je Element-ID in `templateTextAligns` — deren
 * `align` steht sonst fest in der Config, und eine zentrierte Vorlagen-Headline
 * bliebe zentriert. Ein Undo nimmt die Wahl zurück, der Wiederaufbau über
 * `createInitialState` behält sie.
 */
import { GenericCanvas, type GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { carryInstanceState } from '@ggraphic/editor/configs/factory/carryInstanceState';
import { floatingModuleFor } from '@ggraphic/editor/hooks/useFloatingModuleState';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';
import { act, cleanup, render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { AdditionalText } from '@ggraphic/editor/configs/types';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

type ConfigId = 'zitat-at' | 'freeform';
const configs = new Map<ConfigId, Awaited<ReturnType<typeof loadCanvasConfig>>>();

beforeAll(async () => {
  for (const id of ['zitat-at', 'freeform'] as const) configs.set(id, await loadCanvasConfig(id));
}, 120_000);

afterEach(cleanup);

const ZITAT = { quote: 'Klimaschutz ist Menschenschutz.', name: 'Max Muster' };

const FREE_TEXT: AdditionalText = {
  id: 'text-1',
  text: 'Frei gesetzt',
  type: 'body',
  x: 100,
  y: 100,
  width: 600,
  fontSize: 48,
  fontFamily: 'PT Sans, Arial, sans-serif',
  fill: '#000000',
};

async function mount(configId: ConfigId, seed: Record<string, unknown>) {
  const live = { state: {} as Record<string, unknown> };
  const ref = createRef<GenericCanvasRef>();
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={configs.get(configId) as never}
          initialProps={seed}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onLiveState={(state) => {
            live.state = state as Record<string, unknown>;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  const stage = Konva.stages.at(-1)!;
  const alignOf = (id: string) => stage.findOne<Konva.Text>(`#${id}`)!.align();
  const setAlign = async (id: string, align: 'left' | 'center' | 'right') => {
    await act(async () => {
      ref.current!.handleTextAlignChange!(id, align);
    });
  };
  return { ref, live, alignOf, setAlign };
}

describe('carryInstanceState: templateTextAligns', () => {
  it('carries known alignments and drops anything else', () => {
    expect(
      carryInstanceState({
        templateTextAligns: { 'quote-text': 'left', 'name-text': 'justify', other: 3 },
      }).templateTextAligns
    ).toEqual({ 'quote-text': 'left' });
  });

  it('turns a non-object into an empty record', () => {
    expect(carryInstanceState({ templateTextAligns: 'left' }).templateTextAligns).toEqual({});
    expect(carryInstanceState({ templateTextAligns: ['left'] }).templateTextAligns).toEqual({});
    expect(carryInstanceState({}).templateTextAligns).toEqual({});
  });
});

describe('Vorlagen-Text ausrichten', () => {
  it('overrides the config alignment of one text; one undo restores it', async () => {
    const canvas = await mount('zitat-at', ZITAT);
    // Der Verlauf legt seinen Startpunkt einen Tick nach dem Mounten an.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(canvas.alignOf('quote-text')).toBe('center');

    await canvas.setAlign('quote-text', 'left');

    expect(canvas.alignOf('quote-text')).toBe('left');
    expect(canvas.alignOf('name-text')).toBe('center');
    expect(canvas.live.state.templateTextAligns).toEqual({ 'quote-text': 'left' });

    // Der Schritt ist entprellt; Undo nimmt ihn vorher als eigenen Eintrag auf.
    await act(async () => {
      canvas.ref.current!.undo!();
    });
    expect(canvas.alignOf('quote-text')).toBe('center');
    expect(canvas.live.state.templateTextAligns).toEqual({});
  }, 90_000);

  it('a stored choice survives createInitialState and renders', async () => {
    const seed = { ...ZITAT, templateTextAligns: { 'quote-text': 'right' } };
    expect(configs.get('zitat-at')!.createInitialState(seed)).toMatchObject({
      templateTextAligns: { 'quote-text': 'right' },
    });

    const canvas = await mount('zitat-at', seed);
    expect(canvas.alignOf('quote-text')).toBe('right');
  }, 90_000);

  it('the context bar reads the effective alignment', () => {
    const config = configs.get('zitat-at')!;
    const state = config.createInitialState(ZITAT) as Record<string, unknown>;
    expect(floatingModuleFor('quote-text', config, state, {})?.data.align).toBe('center');
    const chosen = { ...state, templateTextAligns: { 'quote-text': 'right' } };
    expect(floatingModuleFor('quote-text', config, chosen, {})?.data.align).toBe('right');
  });
});

describe('Freien Text ausrichten', () => {
  it('writes align on the text itself', async () => {
    const canvas = await mount('freeform', { additionalTexts: [FREE_TEXT] });
    expect(canvas.alignOf('text-1')).toBe('left');

    await canvas.setAlign('text-1', 'center');

    expect(canvas.alignOf('text-1')).toBe('center');
    const [text] = canvas.live.state.additionalTexts as AdditionalText[];
    expect(text?.align).toBe('center');
    expect(canvas.live.state.templateTextAligns ?? {}).toEqual({});
  }, 90_000);

  it('the context bar reports left for a text without align', () => {
    const config = configs.get('freeform')!;
    const state = config.createInitialState({ additionalTexts: [FREE_TEXT] }) as Record<
      string,
      unknown
    >;
    expect(floatingModuleFor('text-1', config, state, {})?.data.align).toBe('left');
  });
});
