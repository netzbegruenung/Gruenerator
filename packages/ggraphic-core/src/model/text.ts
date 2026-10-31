// SPDX-License-Identifier: MPL-2.0
/**
 * Text auf der Seite: der freie Text (`additionalTexts`) und wie seine Läufe aussehen.
 */
import { type GradientFill } from './fill.js';

/** Ausrichtung eines Textes in seiner Box; ohne Angabe links. */
export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;

export type TextAlign = (typeof TEXT_ALIGNS)[number];

/**
 * Wie ein `==Akzent==`-Lauf aussieht. Die Marke entscheidet das, nicht der
 * Text: AT setzt das Wort gelb in Vollkorn kursiv, DE nur in einer
 * anderen Farbe. Ohne `accent` am Text bleibt ein Akzentlauf unauffällig.
 */
export interface TextAccent {
  fill: string;
  fontFamily?: string;
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bold italic';
}

/**
 * Wie ein `++Marker++`-Lauf aussieht: ein Kasten hinter dem Lauf, je
 * Zeilenstück einer, mit dunkler Schrift darin. Nur DE setzt ihn (die
 * Textmarker-Box der Posts); ohne `marker` am Text bleibt ein Markerlauf
 * unauffällig. Abstände in Vielfachen der Schriftgröße.
 */
export interface TextMarker {
  /** Farbe des Kastens. */
  fill: string;
  /** Schriftfarbe im Kasten — der Kasten steht oft auf dunklem Grund. */
  color: string;
  /** Innenabstand links/rechts; Vorgabe 0.18. */
  padX?: number;
  /** Innenabstand oben/unten; Vorgabe 0.04. */
  padY?: number;
}

/** Dynamic additional text element */
export interface AdditionalText {
  id: string;
  text: string;
  type: 'header' | 'subheader' | 'body';
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontFamily: string;
  fontStyle?: 'normal' | 'italic' | 'bold' | 'bold italic';
  fill: string;
  rotation?: number;
  scale?: number;
  opacity?: number;
  /** Outline color; omit for no outline. */
  stroke?: string;
  /** Outline width in px (only applied when `stroke` is set). */
  strokeWidth?: number;
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  /** Linear gradient fill; when set, overrides `fill`. */
  fillGradient?: GradientFill | null;
  /** Horizontal alignment inside `width`; omit for left. */
  align?: 'left' | 'center' | 'right';
  /** Line height as a factor of `fontSize`; omit for the default 1.2. */
  lineHeight?: number;
  /** How `==accent==` runs look; omit and they render like the rest. */
  accent?: TextAccent | null;
  /** How `++marker++` runs look (a box behind the run); omit and they render like the rest. */
  marker?: TextMarker | null;
}
