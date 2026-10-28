// SPDX-License-Identifier: MPL-2.0
import { ELEMENT_KINDS, hostElementKinds, kindAction, kindList } from './elementKinds.js';
import { isLayerLocked } from './layerLock.js';

import type { CanvasItem } from './canvasItem.js';
import type { BaseCanvasState } from '../configs/factory/baseTypes.js';
import type { OptionalCanvasActions } from '../hooks/useCanvasElementHandlers.js';

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

  for (const kind of hostElementKinds()) {
    if (!has(kindList(state, kind.stateKey) as readonly WithId[])) continue;
    const remove = kindAction(actions, kind.actions.remove) as ((id: string) => void) | null;
    return remove ? () => remove(id) : null;
  }
  for (const { stateKey, remove } of ELEMENT_KINDS) {
    const list = kindList(state, stateKey);
    if (remove === null) {
      // Icons: the id itself is listed; deleting one switches it off.
      if (!list.includes(id)) continue;
      const { toggleIcon } = actions;
      return toggleIcon ? () => toggleIcon(id, false) : null;
    }
    if (has(list as readonly WithId[])) return bind(actions[remove]);
  }
  return null;
}

/**
 * Bleibt `id` stehen, weil es zur Vorlage gehört — ein Element der Config oder
 * eins, das die Vorlage selbst ableitet (`isTemplateBound`, etwa der Balken einer
 * Dreizeilen-Vorlage)? Gesperrte zählen nicht: sie bleiben wegen des Schlosses stehen.
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
