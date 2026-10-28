// SPDX-License-Identifier: MPL-2.0
/**
 * Vorlagen-Grafik → Asset-Instanz (#3403).
 *
 * Die Grafiken der Vorlagen und die Grafiken des Bildkatalogs sind DIESELBEN
 * Bilder, zweimal aufgeschrieben: die Vorlage deklariert ein `ImageElementConfig`
 * mit fester Breite/Hoehe, der Katalog eine `UniversalAsset` mit einer `src`.
 * Sie gleichen sich ueber genau diese `src` ab.
 *
 * Beim Duplizieren wird aus der einen die andere. Der harte Teil ist nicht die
 * Identitaet, sondern die Geometrie — die beiden Darstellungen messen anders:
 *
 * | | Vorlagen-Element | Asset-Instanz |
 * |---|---|---|
 * | Anker | oben links | **Mitte** |
 * | Groesse | `width`/`height` in Pixeln | `scale` gegen `ASSET_TARGET_SIZE` |
 *
 * `AssetPrimitive` normalisiert jedes Bild so, dass seine LAENGERE Seite bei
 * `scale: 1` genau `ASSET_TARGET_SIZE` misst. Die Umrechnung ist deshalb
 * `scale = max(width, height) / ASSET_TARGET_SIZE` und die Mitte der Schachtel.
 * Exakt ist das, solange die Vorlage das natuerliche Seitenverhaeltnis
 * respektiert; wo sie es nicht tut (ein quadratischer Platz fuer ein nicht
 * quadratisches Logo), zeichnet die Vorlage verzerrt und die Kopie nicht — sie
 * passt dann auf der laengeren Seite und ist auf der kuerzeren schmaler.
 *
 * Nicht umgerechnet wird, was keine Entsprechung im Katalog hat: das Foto der
 * Nutzer*in (`srcKey`), die Info-Hintergruende (die sind ohnehin nicht
 * auswaehlbar) und jedes Vorlagen-Element, das kein Bild ist. Vorlagen-TEXTE
 * bleiben ebenfalls aussen vor: `AdditionalText` kennt weder `align` noch
 * `lineHeight`, eine zentrierte Headline kaeme also linksbuendig heraus.
 */

import { centreOf } from '@ggraphic/editor/utils/orientation';

import { ASSET_TARGET_SIZE, getAssetBySrc } from './canvasAssets.js';
import { resolveImageElementBox } from './resolveElementValue.js';
import { templateRotationOf } from './templateRotation.js';

import type { DuplicableEntry } from './duplicateElement.js';
import type { CanvasElementConfig, ImageElementConfig, LayoutResult } from '../configs/types.js';

/** Die Quelle eines Vorlagen-Bildes, soweit sie ohne Zustandsschluessel feststeht. */
function staticSrc<TState extends Record<string, unknown>>(
  config: ImageElementConfig<TState>,
  state: TState
): string | null {
  // `srcKey` zeigt auf ein hochgeladenes Bild — das gehoert in keinen Katalog.
  if (config.srcKey || !config.src) return null;
  return typeof config.src === 'function' ? config.src(state) : config.src;
}

/**
 * Die Instanz, die aus diesem Vorlagen-Element wird — oder `null`, wenn es
 * keine gibt. Der Versatz der Kopie kommt nicht von hier: den legt
 * `insertInstance` ueber die Nutzlast, wie bei jeder anderen Art auch.
 */
export function templateElementToEntry<TState extends Record<string, unknown>>(
  element: CanvasElementConfig<TState>,
  state: TState,
  layout: LayoutResult
): DuplicableEntry | null {
  if (element.type !== 'image') return null;

  const config = element as ImageElementConfig<TState>;
  const src = staticSrc(config, state);
  if (!src) return null;

  const asset = getAssetBySrc(src);
  if (!asset) return null;

  const box = resolveImageElementBox(config, state, layout);
  if (!(box.width > 0) || !(box.height > 0)) return null;

  // Die Vorlage dreht um oben links, die Instanz um ihre Mitte: die Kopie
  // sitzt auf der gedrehten Mitte, sonst wanderte sie um die halbe Diagonale.
  const rotation = templateRotationOf(state, element.id);
  const centre = centreOf({
    x: box.x,
    y: box.y,
    rotation,
    scaleX: 1,
    scaleY: 1,
    offsetX: 0,
    offsetY: 0,
    local: { x: 0, y: 0, width: box.width, height: box.height },
  });

  return {
    type: 'asset',
    data: {
      // Die ID vergibt `insertInstance`; hier steht ein Platzhalter, damit die
      // Nutzlast dieselbe Form hat wie eine aus dem Zustand gelesene Instanz.
      id: element.id,
      assetId: asset.id,
      x: centre.x,
      y: centre.y,
      scale: Math.max(box.width, box.height) / ASSET_TARGET_SIZE,
      rotation,
      opacity: box.opacity,
    },
  };
}

/**
 * Findet das Vorlagen-Element mit dieser ID und macht eine Instanz daraus.
 * Speist sowohl den Aktiv-Zustand des Duplizieren-Knopfes als auch die Tat.
 */
export function findTemplateEntry<TState extends Record<string, unknown>>(
  elements: readonly CanvasElementConfig<TState>[] | undefined,
  state: TState,
  layout: LayoutResult | undefined,
  elementId: string
): DuplicableEntry | null {
  if (!elements || !layout) return null;
  const element = elements.find((e) => e.id === elementId);
  if (!element) return null;
  return templateElementToEntry(element, state, layout);
}
