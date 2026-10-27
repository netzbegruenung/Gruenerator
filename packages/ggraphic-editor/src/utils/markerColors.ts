// SPDX-License-Identifier: MPL-2.0
/**
 * Farben des Textmarkers — für die Box hinter `++Passagen++`, die Textmarker-
 * Formen im Formen-Katalog und den Farbwähler im Text. Sie kommen aus dem
 * aktiven Markenpaket (`markers`): der erste Kasten ist der Standard, `ink`
 * die dunkle Schrift darauf.
 */
import { activeBrand } from '@ggraphic/editor/brand/brandRegistry';
import { contrastRatio, luminance } from '@ggraphic/editor/utils/colorLuminance';

import { asColorOptions, type ColorOption } from './colorOptions';
import { type TextMarker } from './textUtils';

const MARKER_INK_LIGHT = '#FFFFFF';

/** Die Kastenfarben des aktiven Markenpakets, für den Farbwähler. */
export const markerSwatches = (): ColorOption[] => asColorOptions(activeBrand().markers.swatches);

/** Der erste Kasten des Markenpakets: die Farbe neuer Textmarker-Formen. */
export const defaultMarkerFill = (): string =>
  activeBrand().markers.swatches[0]?.color ?? '#FFFFFF';

/**
 * Der Kasten eines Textes, dessen Vorlage keinen Markerstil kennt: der erste
 * Kasten des Markenpakets mit dessen dunkler Schrift.
 */
const textMarkers = new WeakMap<object, TextMarker>();
export function defaultTextMarker(): TextMarker {
  const { markers } = activeBrand();
  let marker = textMarkers.get(markers);
  if (!marker) {
    marker = { fill: defaultMarkerFill(), color: markers.ink };
    textMarkers.set(markers, marker);
  }
  return marker;
}

/** Die lesbarere der beiden Schriftfarben auf einem frei gewählten Kasten. */
export function markerInkOn(fill: string): string {
  const inkDark = activeBrand().markers.ink;
  const ground = luminance(fill);
  if (ground === null) return inkDark;
  const dark = luminance(inkDark)!;
  const light = luminance(MARKER_INK_LIGHT)!;
  return contrastRatio(ground, dark) >= contrastRatio(ground, light) ? inkDark : MARKER_INK_LIGHT;
}
