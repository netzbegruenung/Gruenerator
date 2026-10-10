/**
 * Die Pille am Objekt soll beim Transformieren verschwinden. Konva feuert
 * `transformstart`/`transformend` aber ohne Bubbling, die Bühne hört sie nie —
 * die Pille blieb beim Ziehen eines Ankers stehen. `subscribeManipulation`
 * nimmt deshalb den Druck auf den Anker (der bubbelt) als Beginn und das
 * `transformend` des Transformers selbst als Ende.
 */
import { act, render } from '@testing-library/react';
import Konva from 'konva';
import React, { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { loadCanvasConfig } from '../../configs/configLoader';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider';
import { GenericCanvas, type GenericCanvasRef } from '../GenericCanvas';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const TEXT_ID = 'text-1';

describe('subscribeManipulation', () => {
  // Ein voller GenericCanvas-Mount in jsdom (Config laden, Konva-Bühne,
  // Transformer) braucht leer 3,2 s auf einem M5 und lief auf dem CI-Runner
  // in drei Läufen hintereinander über die 5-s-Vorgabe (#3998). Der Vorgabewert
  // ist für Fälle gedacht, die nicht den ganzen Editor hochziehen.
  it('meldet Beginn und Ende einer Anker-Transformation', { timeout: 30_000 }, async () => {
    const config = await loadCanvasConfig('dreizeilen');
    const ref = createRef<GenericCanvasRef>();
    await act(async () => {
      render(
        <AutoSaveStoreProvider>
          <GenericCanvas
            forwardedRef={ref}
            config={config as never}
            initialProps={{
              additionalTexts: [
                {
                  id: TEXT_ID,
                  text: 'Neue Überschrift',
                  type: 'header',
                  x: 100,
                  y: 100,
                  fontSize: 60,
                  fontFamily: 'GrueneTypeNeue, Arial, sans-serif',
                  fontStyle: 'bold',
                  fill: '#ffffff',
                  width: 400,
                },
              ],
            }}
            onExport={() => {}}
            onCancel={() => {}}
            autoSave={false}
          />
        </AutoSaveStoreProvider>
      );
    });

    const stage = Konva.stages.at(-1)!;
    const node = stage.findOne(`#${TEXT_ID}`)!;
    await act(async () => {
      node.fire('touchstart', { evt: {} }, true);
    });

    const listener = vi.fn();
    const unsubscribe = ref.current!.subscribeManipulation!(listener);

    const transformer = stage.findOne<Konva.Transformer>('Transformer')!;
    expect(transformer, 'Transformer der Auswahl').toBeTruthy();
    const anchor = transformer.findOne('.middle-right')!;
    expect(anchor, 'Anker').toBeTruthy();

    // Wie Konva selbst: der Druck auf den Anker bubbelt bis zur Bühne,
    // `transformend` kommt ohne Bubbling vom Transformer. Der Transformer
    // liest dabei die Zeigerposition der Bühne — ohne sie stirbt sein eigener
    // Hörer, bevor unserer dran ist.
    const press = { preventDefault() {}, clientX: 0, clientY: 0 };
    stage.setPointersPositions(press as never);
    anchor.fire('mousedown', { evt: press }, true);
    expect(listener).toHaveBeenLastCalledWith(true);

    transformer.fire('transformend', { evt: {} }, false);
    expect(listener).toHaveBeenLastCalledWith(false);
    expect(listener).toHaveBeenCalledTimes(2);

    // Ein Druck auf das Objekt selbst ist keine Transformation.
    node.fire('mousedown', { evt: press }, true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    anchor.fire('mousedown', { evt: press }, true);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
