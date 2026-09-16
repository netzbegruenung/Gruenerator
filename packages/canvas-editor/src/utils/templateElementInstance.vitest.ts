import { describe, expect, it } from 'vitest';

import { ASSET_TARGET_SIZE } from './canvasAssets';
import { duplicateElementInState } from './duplicateElement';
import { findTemplateEntry, templateElementToEntry } from './templateElementInstance';

import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { CanvasElementConfig, ImageElementConfig, LayoutResult } from '../configs/types';

type S = Record<string, unknown>;

/** Das Anführungszeichen von `zitat-pure`, auf das Wesentliche gekürzt. */
const quoteMark = (extra: Partial<ImageElementConfig<S>> = {}): ImageElementConfig<S> => ({
  id: 'quote-mark',
  type: 'image',
  x: 100,
  y: 200,
  width: 300,
  height: 300,
  src: '/quote.svg',
  ...extra,
});

const NO_LAYOUT: LayoutResult = {};

describe('templateElementToEntry', () => {
  it('macht aus einer Vorlagen-Grafik eine Asset-Instanz auf ihrer Mitte', () => {
    const entry = templateElementToEntry(quoteMark(), {}, NO_LAYOUT);

    expect(entry).toEqual({
      type: 'asset',
      data: {
        id: 'quote-mark',
        assetId: 'quote-mark',
        // Vorlagen-Elemente sind oben links verankert, Asset-Instanzen mittig.
        x: 250,
        y: 350,
        // 300 px lange Kante gegen die Normgröße, auf die AssetPrimitive rechnet.
        scale: 300 / ASSET_TARGET_SIZE,
        rotation: 0,
        opacity: 1,
      },
    });
  });

  it('nimmt den gespeicherten Versatz und die Deckkraft mit', () => {
    const entry = templateElementToEntry(
      quoteMark({ offsetKey: 'quoteMarkOffset', opacityStateKey: 'quoteMarkOpacity' }),
      { quoteMarkOffset: { x: 40, y: -10 }, quoteMarkOpacity: 0.5 },
      NO_LAYOUT
    );

    expect(entry?.data).toMatchObject({ x: 290, y: 340, opacity: 0.5 });
  });

  it('folgt einer Lage, die erst das Layout berechnet', () => {
    const readY = (_s: S, layout: LayoutResult) => (layout['quote-mark'] as { y: number }).y;
    const element = quoteMark({ y: readY });
    const entry = templateElementToEntry(element, {}, { 'quote-mark': { y: 500 } });

    expect(entry?.data).toMatchObject({ y: 650 });
  });

  /**
   * Die kürzere Seite folgt dem natürlichen Seitenverhältnis des Bildes, die
   * längere passt. Zeichnet die Vorlage ein nicht quadratisches Logo in einem
   * quadratischen Platz, ist also die Vorlage verzerrt und die Kopie nicht.
   */
  it('misst an der längeren Kante', () => {
    const entry = templateElementToEntry(quoteMark({ width: 300, height: 120 }), {}, NO_LAYOUT);
    expect(entry?.data).toMatchObject({ scale: 2, x: 250, y: 260 });
  });

  it('lässt ein hochgeladenes Bild in Ruhe', () => {
    // `srcKey` zeigt auf ein Bild der Nutzer*in — das steht in keinem Katalog.
    const element = { ...quoteMark(), src: undefined, srcKey: 'currentImageSrc' };
    expect(templateElementToEntry(element, { currentImageSrc: 'blob:x' }, NO_LAYOUT)).toBeNull();
  });

  it('lässt eine Grafik ohne Katalog-Eintrag in Ruhe', () => {
    expect(
      templateElementToEntry(quoteMark({ src: '/Info_bg_tanne.png' }), {}, NO_LAYOUT)
    ).toBeNull();
  });

  it('lässt Vorlagen-Texte in Ruhe', () => {
    const text = {
      id: 'quote-text',
      type: 'text',
      x: 0,
      y: 0,
    } as unknown as CanvasElementConfig<S>;
    expect(templateElementToEntry(text, {}, NO_LAYOUT)).toBeNull();
  });
});

describe('findTemplateEntry', () => {
  const elements = [quoteMark()];

  it('findet das Element über seine ID', () => {
    expect(findTemplateEntry(elements, {}, NO_LAYOUT, 'quote-mark')).not.toBeNull();
  });

  it('gibt null für eine fremde ID zurück', () => {
    expect(findTemplateEntry(elements, {}, NO_LAYOUT, 'quote-text')).toBeNull();
  });

  it('gibt null zurück, solange kein Layout vorliegt', () => {
    // Ohne gerechnetes Layout stünde die Lage layoutgebundener Elemente nicht
    // fest — dann lieber nicht duplizieren als an der falschen Stelle.
    expect(findTemplateEntry(elements, {}, undefined, 'quote-mark')).toBeNull();
  });
});

/**
 * Der Weg, den der Knopf und Strg+D nehmen: dieselbe `duplicateElementInState`
 * wie für jede Instanz, nur mit der Vorlagen-Tür als Nachschlag.
 */
describe('Duplizieren einer Vorlagen-Grafik', () => {
  const state = {
    assetInstances: [],
    layerOrder: ['background', 'quote-mark', 'quote-text'],
  } as unknown as BaseCanvasState;

  const template = (id: string) => findTemplateEntry([quoteMark()], state, NO_LAYOUT, id);

  it('legt die Kopie als Asset-Instanz ab, um den Standardversatz verschoben', () => {
    const result = duplicateElementInState(state, 'quote-mark', { template })!;

    expect(result.state.assetInstances).toHaveLength(1);
    expect(result.state.assetInstances[0]).toMatchObject({
      id: result.newId,
      assetId: 'quote-mark',
      x: 270,
      y: 370,
    });
  });

  it('setzt die Kopie in der Ebenenfolge direkt über das Original', () => {
    const result = duplicateElementInState(state, 'quote-mark', { template })!;
    expect(result.state.layerOrder).toEqual([
      'background',
      'quote-mark',
      result.newId,
      'quote-text',
    ]);
  });

  it('lässt das Vorlagen-Element selbst unangetastet', () => {
    const result = duplicateElementInState(state, 'quote-mark', { template })!;
    expect(result.newId).not.toBe('quote-mark');
    expect(state.assetInstances).toHaveLength(0);
  });

  it('bleibt ohne Vorlagen-Tür bei null', () => {
    expect(duplicateElementInState(state, 'quote-mark')).toBeNull();
  });
});
