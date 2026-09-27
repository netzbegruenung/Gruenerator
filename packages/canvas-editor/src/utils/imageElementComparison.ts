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

import { assertAsPosition, assertAsSize } from './stateTypeAssertions';

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

  // Ein aktiver Override koppelt die Achse vom Layout ab (siehe Render:
  // `customPosition?.x ?? resolveValue(config.x, …)`). Unveraendert gesetzte
  // Overrides merken wir uns, um den Layout-Vergleich unten zu sparen.
  let positionOverridden = false;
  const positionKey = prev.config.positionStateKey;
  if (positionKey) {
    const prevRaw = prev.state[positionKey];
    const nextRaw = next.state[positionKey];
    if ((prevRaw == null) !== (nextRaw == null)) return false;
    if (prevRaw != null && nextRaw != null) {
      const prevPos = assertAsPosition(prevRaw);
      const nextPos = assertAsPosition(nextRaw);
      if (prevPos.x !== nextPos.x || prevPos.y !== nextPos.y) return false;
      positionOverridden = true;
    }
  }

  let sizeOverridden = false;
  const sizeKey = prev.config.sizeStateKey;
  if (sizeKey) {
    const prevRaw = prev.state[sizeKey];
    const nextRaw = next.state[sizeKey];
    if ((prevRaw == null) !== (nextRaw == null)) return false;
    if (prevRaw != null && nextRaw != null) {
      const prevSize = assertAsSize(prevRaw);
      const nextSize = assertAsSize(nextRaw);
      if (prevSize.w !== nextSize.w || prevSize.h !== nextSize.h) return false;
      // Spiegelt die Gueltigkeitspruefung des Renderers: {0,0} zaehlt nicht
      // als Override, dort greift wieder das Layout.
      sizeOverridden = prevSize.w > 0 && prevSize.h > 0;
    }
  }

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

  if (!positionOverridden) {
    if (prevGeometry?.x !== nextGeometry?.x) return false;
    if (prevGeometry?.y !== nextGeometry?.y) return false;
  }

  if (!sizeOverridden) {
    if (prevGeometry?.width !== nextGeometry?.width) return false;
    if (prevGeometry?.height !== nextGeometry?.height) return false;
  }

  return true;
}
