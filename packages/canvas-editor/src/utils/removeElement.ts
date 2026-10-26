import { isLayerLocked } from './layerLock';

import type { CanvasItem } from './canvasLayerManager';
import type { BaseCanvasState } from '../configs/factory/baseTypes';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers';

type WithId = { id: string };

/**
 * Löschen eines Canvas-Elements — eine Tür für die Entf-Taste und den
 * Löschen-Knopf der mobilen Auswahl. Liefert die Löschung als Funktion, oder
 * `null`, wenn die Auswahl nicht löschbar ist (Vorlagen-Elemente liegen in
 * keiner Sammlung oder meldet die Vorlage über `isTemplateBound`, gesperrte
 * bleiben stehen, oder der Config fehlt die passende Aktion). So kann der Knopf seinen Zustand aus derselben Frage ableiten, die
 * das Löschen stellt.
 */
export function findElementRemover(
  state: Partial<BaseCanvasState>,
  actions: OptionalCanvasActions,
  id: string | null
): (() => void) | null {
  if (!id || isLayerLocked(state, id) || actions.isTemplateBound?.(id)) return null;
  const has = (list: readonly WithId[] | undefined) => !!list?.some((item) => item.id === id);
  const bind = (remove: ((id: string) => void) | undefined) => (remove ? () => remove(id) : null);

  if (has(state.balkenInstances)) return bind(actions.removeBalken);
  if (state.selectedIcons?.includes(id)) {
    const { toggleIcon } = actions;
    return toggleIcon ? () => toggleIcon(id, false) : null;
  }
  if (has(state.shapeInstances)) return bind(actions.removeShape);
  if (has(state.additionalTexts)) return bind(actions.removeAdditionalText);
  if (has(state.illustrationInstances)) return bind(actions.removeIllustration);
  if (has(state.assetInstances)) return bind(actions.removeAsset);
  if (has(state.pillBadgeInstances)) return bind(actions.removePillBadge);
  if (has(state.circleBadgeInstances)) return bind(actions.removeCircleBadge);
  if (has(state.frameInstances)) return bind(actions.removeFrame);
  if (has(state.userImageInstances)) return bind(actions.removeUserImage);
  if (has(state.chartInstances)) return bind(actions.removeChart);
  return null;
}

/**
 * Bleibt `id` stehen, weil es zur Vorlage gehört — ein Element der Config oder
 * eins, das die Vorlage selbst ableitet (`isTemplateBound`, etwa der Balken von
 * Dreizeilen)? Gesperrte zählen nicht: sie bleiben wegen des Schlosses stehen.
 */
export function isTemplateBound(
  state: Partial<BaseCanvasState>,
  actions: OptionalCanvasActions,
  renderList: readonly CanvasItem[],
  id: string
): boolean {
  if (isLayerLocked(state, id)) return false;
  if (actions.isTemplateBound?.(id)) return true;
  return renderList.some((item) => item.id === id && item.type === 'element');
}
