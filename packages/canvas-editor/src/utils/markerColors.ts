/**
 * Farben des Textmarkers — für die Box hinter `++Passagen++`, die Textmarker-
 * Formen im Formen-Katalog und den Farbwähler im Text. Limette und Mint sind
 * die Kastenfarben der DE-Posts (siehe `composeSharepic.ts`).
 */
import { contrastRatio, luminance } from './colorLuminance';
import { type TextMarker } from './textUtils';

/** Die dunkle Schrift der DE-Kästen (`SHAREPIC_COLOR_HEX.dunkeltanne`). */
const MARKER_INK_DARK = '#00261A';
const MARKER_INK_LIGHT = '#FFFFFF';

export const MARKER_LIME = '#BEFF60';

export const MARKER_PRESETS = [
  { id: 'limette', name: 'Limette', value: MARKER_LIME },
  { id: 'mint', name: 'Mint', value: '#77F6A5' },
  { id: 'grasgruen', name: 'Grasgrün', value: '#00CC4F' },
  { id: 'white', name: 'Weiß', value: '#FFFFFF' },
];

/**
 * Der Kasten eines Textes, dessen Vorlage keinen Markerstil kennt (alles außer
 * den DE-Sharepics): Limette mit dunkler Schrift.
 */
export const DEFAULT_TEXT_MARKER: TextMarker = { fill: MARKER_LIME, color: MARKER_INK_DARK };

/** Die lesbarere der beiden Schriftfarben auf einem frei gewählten Kasten. */
export function markerInkOn(fill: string): string {
  const ground = luminance(fill);
  if (ground === null) return MARKER_INK_DARK;
  const dark = luminance(MARKER_INK_DARK)!;
  const light = luminance(MARKER_INK_LIGHT)!;
  return contrastRatio(ground, dark) >= contrastRatio(ground, light)
    ? MARKER_INK_DARK
    : MARKER_INK_LIGHT;
}
