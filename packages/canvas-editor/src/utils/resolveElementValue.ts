/**
 * Aufgeloeste Werte eines Vorlagen-Elements.
 *
 * Ein Element der Vorlage traegt seine Lage nicht als Zahl, sondern als Rezept:
 * `x` kann eine Funktion ueber Zustand und Layout sein, dazu kommen
 * Zustandsschluessel fuer Versatz, Skalierung, Groesse und Deckkraft. Wer
 * wissen will, wo ein Vorlagen-Bild WIRKLICH liegt, muss dieses Rezept kochen.
 *
 * Das tat bisher nur `GenericCanvasElement` beim Zeichnen. Seit eine duplizierte
 * Vorlagen-Grafik zu einer Asset-Instanz wird (#3403), braucht es dieselbe
 * Rechnung ein zweites Mal — und zwei Fassungen derselben Arithmetik driften
 * auseinander, ohne dass es jemandem auffaellt. Darum steht sie hier, ohne
 * React und ohne Konva, und beide Seiten rufen sie.
 */

import {
  assertAsOpacity,
  assertAsPosition,
  assertAsScale,
  assertAsSize,
  getOptionalStateValue,
} from './stateTypeAssertions';

import type { ImageElementConfig, LayoutResult } from '../configs/types';

/** Loest einen Wert auf, der statisch oder aus Zustand und Layout abgeleitet ist. */
export function resolveValue<T, TState extends Record<string, unknown> = Record<string, unknown>>(
  value: T | ((state: TState, layout: LayoutResult) => T),
  state: TState,
  layout: LayoutResult
): T {
  if (typeof value === 'function') {
    return (value as (state: TState, layout: LayoutResult) => T)(state, layout);
  }
  return value;
}

/** Dasselbe fuer Farben. */
export function resolveColor<TState extends Record<string, unknown> = Record<string, unknown>>(
  value: string | ((state: TState, layout: LayoutResult) => string) | undefined,
  state: TState,
  layout: LayoutResult
): string | undefined {
  if (typeof value === 'function') {
    return (value as (state: TState, layout: LayoutResult) => string)(state, layout);
  }
  return value;
}

/** Die gezeichnete Schachtel eines Vorlagen-Bildes, oben links verankert. */
export interface ResolvedImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

/**
 * Wo und wie gross zeichnet dieses Vorlagen-Bild?
 *
 * Die Reihenfolge ist nicht beliebig: eine gespeicherte absolute Position
 * (`positionStateKey`) gewinnt gegen alles, sonst gilt Layoutwert + Anker +
 * Versatz. `null`/`undefined` heisst dabei "kein Override" — der {0,0}-Fallback
 * von `assertAsPosition` darf hier nicht greifen, sonst rutscht jedes Bild mit
 * `positionStateKey` in den Koordinatenursprung.
 */
export function resolveImageElementBox<
  TState extends Record<string, unknown> = Record<string, unknown>,
>(config: ImageElementConfig<TState>, state: TState, layout: LayoutResult): ResolvedImageBox {
  const offset = config.offsetKey ? assertAsPosition(state[config.offsetKey]) : { x: 0, y: 0 };
  const scale = config.scaleKey ? assertAsScale(state[config.scaleKey]) : 1;
  const baseWidth = resolveValue(config.width, state, layout);
  const baseHeight = resolveValue(config.height, state, layout);

  // `assertAsSize` faellt auf {0,0} zurueck — das waere ein unsichtbares Bild.
  const rawCustomSize = config.sizeStateKey ? state[config.sizeStateKey] : null;
  const storedSize = rawCustomSize != null ? assertAsSize(rawCustomSize) : null;
  const customSize = storedSize && storedSize.w > 0 && storedSize.h > 0 ? storedSize : null;

  const rawCustomPosition = config.positionStateKey ? state[config.positionStateKey] : null;
  const customPosition = rawCustomPosition != null ? assertAsPosition(rawCustomPosition) : null;

  // centerZoom verankert die skalierte Schachtel auf der Mitte des Platzes
  // statt auf der linken oberen Ecke.
  const anchorX = config.centerZoom ? (baseWidth * (1 - scale)) / 2 : 0;
  const anchorY = config.centerZoom ? (baseHeight * (1 - scale)) / 2 : 0;

  const customOpacity = getOptionalStateValue<number>(state, config.opacityStateKey);

  return {
    x: customPosition?.x ?? resolveValue(config.x, state, layout) + anchorX + offset.x,
    y: customPosition?.y ?? resolveValue(config.y, state, layout) + anchorY + offset.y,
    width: customSize?.w ?? baseWidth * scale,
    height: customSize?.h ?? baseHeight * scale,
    opacity: assertAsOpacity(
      customOpacity ?? (config.opacity ? resolveValue(config.opacity, state, layout) : 1)
    ),
  };
}
