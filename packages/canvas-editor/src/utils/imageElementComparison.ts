/**
 * Vergleich der Render-Eingaben eines Bild-Elements für React.memo.
 *
 * Eigene Datei, damit die Regel ohne react-konva testbar bleibt.
 *
 * Der frühere Vergleich sah `layout` überhaupt nicht an. Bei layoutgebundenen
 * Bildern (`fromLayout(...)` für x/y, z. B. der Pfeil der Info-Vorlage) hiess
 * das: die Überschrift wird länger, Kopf- und Fliesstext wandern auf die neue
 * Höhe — und das Bild bleibt stehen, bis ein anderer Grund ein Neuzeichnen
 * erzwingt.
 */

import { assertAsPosition } from './stateTypeAssertions';

import type { ImageElementConfig, LayoutElementResult, LayoutResult } from '../configs/types';

export interface ImageRenderInputs<TState extends Record<string, unknown>> {
  config: ImageElementConfig<TState>;
  state: TState;
  layout: LayoutResult;
  selected: boolean;
}

function geometryOf(layout: LayoutResult, id: string): LayoutElementResult | undefined {
  return layout[id] as LayoutElementResult | undefined;
}

export function imageRenderInputsAreEqual<TState extends Record<string, unknown>>(
  prev: ImageRenderInputs<TState>,
  next: ImageRenderInputs<TState>
): boolean {
  if (prev.config.id !== next.config.id) return false;
  if (prev.selected !== next.selected) return false;

  const srcKey = prev.config.srcKey;
  if (srcKey && prev.state[srcKey] !== next.state[srcKey]) return false;

  const offsetKey = prev.config.offsetKey;
  if (offsetKey) {
    const prevOffset = assertAsPosition(prev.state[offsetKey]);
    const nextOffset = assertAsPosition(next.state[offsetKey]);
    if (prevOffset.x !== nextOffset.x || prevOffset.y !== nextOffset.y) return false;
  }

  const positionKey = prev.config.positionStateKey;
  if (positionKey) {
    const prevRaw = prev.state[positionKey];
    const nextRaw = next.state[positionKey];
    if ((prevRaw == null) !== (nextRaw == null)) return false;
    if (prevRaw != null && nextRaw != null) {
      const prevPos = assertAsPosition(prevRaw);
      const nextPos = assertAsPosition(nextRaw);
      if (prevPos.x !== nextPos.x || prevPos.y !== nextPos.y) return false;
    }
  }

  const sizeKey = prev.config.sizeStateKey;
  if (sizeKey && prev.state[sizeKey] !== next.state[sizeKey]) return false;

  const scaleKey = prev.config.scaleKey;
  if (scaleKey && prev.state[scaleKey] !== next.state[scaleKey]) return false;

  const lockedKey = prev.config.lockedKey;
  if (lockedKey && prev.state[lockedKey] !== next.state[lockedKey]) return false;

  const opacityKey = prev.config.opacityStateKey;
  if (opacityKey && prev.state[opacityKey] !== next.state[opacityKey]) return false;

  const fillKey = prev.config.fillStateKey;
  if (fillKey && prev.state[fillKey] !== next.state[fillKey]) return false;

  const prevGeometry = geometryOf(prev.layout, prev.config.id);
  const nextGeometry = geometryOf(next.layout, next.config.id);
  if (prevGeometry?.x !== nextGeometry?.x) return false;
  if (prevGeometry?.y !== nextGeometry?.y) return false;
  if (prevGeometry?.width !== nextGeometry?.width) return false;
  if (prevGeometry?.height !== nextGeometry?.height) return false;

  return true;
}
