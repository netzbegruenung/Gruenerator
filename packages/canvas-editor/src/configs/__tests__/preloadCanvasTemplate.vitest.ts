import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';

import { canvasFontFamilies } from '../../utils/canvasFontFamilies';
import { loadCanvasConfig, preloadCanvasTemplate } from '../configLoader';

/**
 * Der Editor fragt Schriften erst an, wenn die erste Seite gemountet ist —
 * dann hat der erste Paint schon die Ersatzschrift. `preloadCanvasTemplate`
 * läuft, sobald der Vorlagentyp bekannt ist, und muss genau die Schnitte
 * anfordern, auf die `useFontLoader` später wartet.
 */
describe('preloadCanvasTemplate', () => {
  const load = vi.fn((_spec: string) => Promise.resolve([] as FontFace[]));
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;

  // Kaltstart-Import vor dem Stub: Abhängigkeiten der Config fassen beim
  // Import `document` an, das der Stub nicht nachbildet.
  beforeAll(async () => {
    config = await loadCanvasConfig('zitat');
  }, 30_000);

  beforeEach(() => {
    load.mockClear();
    vi.stubGlobal('document', { fonts: { load } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fordert Grundschnitt, Fett und Kursiv jeder gezeichneten Schrift an', async () => {
    const size = config.fonts?.fontSize ?? 60;
    const families = canvasFontFamilies(config);
    expect(families.length).toBeGreaterThan(0);

    await preloadCanvasTemplate('zitat');

    const specs = load.mock.calls.map(([spec]) => spec);
    expect(specs).toEqual(
      expect.arrayContaining(
        families.flatMap((family) => [
          `${size}px ${family}`,
          `bold ${size}px ${family}`,
          `italic ${size}px ${family}`,
        ])
      )
    );
  });

  it('ignoriert einen unbekannten Typ', async () => {
    await expect(preloadCanvasTemplate('gibt-es-nicht')).resolves.toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('schluckt eine fehlgeschlagene Schriftanfrage', async () => {
    load.mockImplementation(() => Promise.reject(new Error('offline')));
    await expect(preloadCanvasTemplate('zitat')).resolves.toBeUndefined();
  });
});
