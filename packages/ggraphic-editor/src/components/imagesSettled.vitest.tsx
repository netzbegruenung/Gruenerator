// SPDX-License-Identifier: MPL-2.0
/**
 * `imagesSettled()` hält die Offscreen-Vorschau im Chat zurück, bis das
 * Hintergrundbild geladen ist. Ohne das fotografierte sie den Dreizeiler nach
 * 500 ms — das Stockbild (Median 2,5 MB) war dann noch unterwegs, das
 * Bild-Element zeichnete nichts, und die Vorschau zeigte nur die grüne Fläche.
 *
 * Gegen die echte Vorlage, weil die Zählung über einen Context läuft, der die
 * Grenze zum Konva-Reconciler überqueren muss — eine Prüfung am Hook allein
 * bliebe grün, wenn diese Brücke risse.
 */
import { act, render } from '@testing-library/react';
import Konva from 'konva';
import React, { createRef } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GenericCanvas, type GenericCanvasRef } from '@ggraphic/editor/components/GenericCanvas';
import { loadCanvasConfig } from '@ggraphic/editor/configs/configLoader';
import { AutoSaveStoreProvider } from '@ggraphic/editor/stores/AutoSaveStoreProvider';

import { FIXTURE_ASSET_ID, registerFixtureAssets } from '../testing/fixtureTemplates';

type Status = 'loading' | 'loaded' | 'failed';

// Wie das echte `use-image`: der Hook abonniert seinen Ladezustand und rendert
// sich selbst neu, wenn das Bild ankommt. Gesteuert wird nur das Stockbild —
// die Zierde der Vorlage ist auch ein Bild-Element und gilt als geladen.
const imageStatus = vi.hoisted(() => {
  let current: Status = 'loading';
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(next: Status) {
      current = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
});

const STOCK = vi.hoisted(() => 'https://example.org/stock-image/');

vi.mock('use-image', async () => {
  const { useSyncExternalStore } = await import('react');
  // Der 2D-Kontext kommt in diesem Lauf von @napi-rs/canvas (vitest.setup.ts),
  // und der zeichnet nur eigene Flächen, kein jsdom-<img>.
  const { Image, createCanvas } = await import('@napi-rs/canvas');
  const bitmap = new Image();
  bitmap.src = createCanvas(4, 4).toBuffer('image/png');
  const useImage = (url: string) => {
    const status = useSyncExternalStore(imageStatus.subscribe, imageStatus.get);
    if (!url) return [undefined, 'loading'];
    if (!url.includes(STOCK)) return [bitmap, 'loaded'];
    return status === 'loaded' ? [bitmap, 'loaded'] : [undefined, status];
  };
  return { default: useImage };
});

// Konva cacht Bilder mit Filtern auf einem jsdom-Canvas, den der napi-Kontext
// beim Zeichnen ablehnt. Hier werden keine Pixel geprüft, nur der Ladezustand.
vi.spyOn(Konva.Node.prototype, 'cache').mockReturnThis();

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

// Einmal geladen und mit eigenem Budget, wie in `remoteEditKeepsAddedElements`:
// `loadCanvasConfig` zieht über einen dynamischen Import den ganzen Config-
// Graphen (konva, recharts, @iconify) herein — kalt gemessen 5,1 s gegen die
// 5 s des ersten Tests, das Rendern selbst 80 ms (#3775). Auf einer warmen
// Maschine lag es knapp darunter, deshalb war die Datei lokal grün und in CI rot.
let config: Awaited<ReturnType<typeof loadCanvasConfig>>;

beforeAll(async () => {
  config = await loadCanvasConfig('fixture-poster');
}, 120_000);

async function mount(initialProps: Record<string, unknown>) {
  const ref = createRef<GenericCanvasRef>();
  render(
    <AutoSaveStoreProvider>
      <GenericCanvas
        config={config as never}
        initialProps={initialProps}
        onExport={() => {}}
        onCancel={() => {}}
        callbacks={{}}
        forwardedRef={ref}
        preview
      />
    </AutoSaveStoreProvider>
  );
  await act(async () => {});
  return { ref };
}

const SLOGAN = { line1: 'Klimaschutz jetzt', line2: 'Gemeinsam handeln', line3: 'Zukunft sichern' };

describe('GenericCanvasRef.imagesSettled', () => {
  beforeEach(() => {
    imageStatus.set('loading');
  });

  it('is false while the background image loads, true once it has', async () => {
    const { ref } = await mount({
      ...SLOGAN,
      currentImageSrc: `${STOCK}wind.jpg`,
    });
    expect(ref.current!.imagesSettled()).toBe(false);

    await act(async () => {
      imageStatus.set('loaded');
    });
    expect(ref.current!.imagesSettled()).toBe(true);
  });

  it('does not wait on a failed image', async () => {
    imageStatus.set('failed');
    const { ref } = await mount({
      ...SLOGAN,
      currentImageSrc: `${STOCK}wind.jpg`,
    });
    expect(ref.current!.imagesSettled()).toBe(true);
  });

  it('has nothing to wait for without a background image', async () => {
    const { ref } = await mount(SLOGAN);
    expect(ref.current!.imagesSettled()).toBe(true);
  });
});

/**
 * Logo und Sticker sind Asset-Instanzen und laden ihr Bild selbst
 * (`AssetPrimitive`), nicht über `use-image`. Ohne Anmeldung ging die
 * Vorschau raus, bevor sie da waren: ein Sharepic ohne Logo und ohne
 * Themen-Zeichen (#4834).
 */
describe('GenericCanvasRef.imagesSettled with assets', () => {
  // jsdom lädt keine Bilder; hier entscheidet der Test, wann eines ankommt.
  const created: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[] = [];
  class FakeImage {
    crossOrigin = '';
    naturalWidth = 4;
    naturalHeight = 4;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    #src = '';
    get src() {
      return this.#src;
    }
    set src(value: string) {
      this.#src = value;
      created.push(this);
    }
  }

  const STICKER = {
    id: 'sticker-1',
    assetId: FIXTURE_ASSET_ID,
    x: 10,
    y: 10,
    scale: 1,
    rotation: 0,
    opacity: 1,
  };

  beforeEach(() => {
    registerFixtureAssets();
    created.length = 0;
    imageStatus.set('loaded');
    vi.stubGlobal('Image', FakeImage);
    // Nach `onload` zeichnet Konva im nächsten Frame — mit einem FakeImage, das
    // der napi-Kontext ablehnt. Landete der Frame vor dem Abbau, warf er als
    // „Unhandled Error" und färbte den ganzen Lauf rot. Pixel prüft hier keiner.
    const drawImage = vi.spyOn(Konva.Context.prototype, 'drawImage').mockImplementation(() => {});
    return () => {
      drawImage.mockRestore();
      vi.unstubAllGlobals();
    };
  });

  it('waits for a sticker image, then settles', async () => {
    const { ref } = await mount({ ...SLOGAN, assetInstances: [STICKER] });
    const sticker = created.find((img) => img.src.includes(FIXTURE_ASSET_ID));
    expect(sticker).toBeDefined();
    expect(ref.current!.imagesSettled()).toBe(false);

    await act(async () => {
      sticker!.onload?.();
    });
    expect(ref.current!.imagesSettled()).toBe(true);
    // Den Zeichen-Frame abwarten, statt auf den Ausgang des Rennens zu hoffen.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  });

  it('does not wait on a sticker that fails to load', async () => {
    const { ref } = await mount({ ...SLOGAN, assetInstances: [STICKER] });
    await act(async () => {
      created.find((img) => img.src.includes(FIXTURE_ASSET_ID))!.onerror?.();
    });
    expect(ref.current!.imagesSettled()).toBe(true);
  });
});
