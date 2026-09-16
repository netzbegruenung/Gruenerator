import { beforeAll, describe, expect, it } from 'vitest';

import { loadCanvasConfig } from '../configLoader';
import { getAssetBySrc } from '../../utils/canvasAssets';

/**
 * Wächter für #3403: eine Vorlagen-Grafik wird beim Duplizieren zur
 * Asset-Instanz, und der Abgleich läuft über die `src`.
 *
 * Wer einer Vorlage ein neues Bild gibt, ohne es in `ALL_ASSETS` oder
 * `TEMPLATE_ASSETS` einzutragen, nimmt ihr damit stillschweigend das
 * Duplizieren: der Knopf wird grau, es gibt keinen Fehler und keine Meldung.
 * Genau diese Lücke fällt hier auf.
 *
 * Nicht erfasst und bewusst nicht: Bilder mit `srcKey` (Hintergrundfoto,
 * Profilbild) — die gehören der Nutzer*in und in keinen Katalog.
 */

type CanvasConfigType = Parameters<typeof loadCanvasConfig>[0];

const TEMPLATES: CanvasConfigType[] = [
  'zitat-pure',
  'info',
  'veranstaltung',
  'simple',
  'dreizeilen',
  'zitat',
  'slider',
  'freeform',
  'profilbild',
  'zitat-at',
  'zitat-pure-at',
  'dreizeilen-overlay-at',
  'info-at',
  'freeform-at',
];

interface ImageElementLike {
  id: string;
  type: string;
  src?: string | ((state: never) => string);
  srcKey?: string;
}

describe.each(TEMPLATES)('%s: template graphics are in the asset catalogue', (type) => {
  // Eigenes Zeitbudget: `loadCanvasConfig` zieht über einen dynamischen Import
  // die ganze Config-Kette nach und sprengt auf einem belasteten CI-Läufer die
  // 5-Sekunden-Vorgabe.
  let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
  beforeAll(async () => {
    config = await loadCanvasConfig(type);
  }, 60_000);

  it('every fixed graphic resolves to a catalogue asset', () => {
    const state = config.createInitialState({}) as Record<string, unknown>;
    const orphans: string[] = [];

    for (const raw of config.elements as unknown as ImageElementLike[]) {
      if (raw.type !== 'image' || raw.srcKey || !raw.src) continue;
      const src = typeof raw.src === 'function' ? raw.src(state as never) : raw.src;
      if (!getAssetBySrc(src)) orphans.push(`${type}/${raw.id}: ${src}`);
    }

    expect(orphans, `graphics without a catalogue entry:\n  ${orphans.join('\n  ')}`).toEqual([]);
  });
});
