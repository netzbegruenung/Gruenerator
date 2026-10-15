import { type MenuAction } from '@expo/ui/community/menu';

/** Einträge im Menü einer Kachel. Kennungen, keine Beschriftungen. */
export type MarketMenuId = 'chat' | 'details' | 'edit' | 'share' | 'delete' | 'remove';

/**
 * Was der lange Druck auf eine Kachel anbietet. Bearbeiten, Teilen und Löschen
 * nur bei Eigenem — fremde Agents und Katalog-Rezepte gehören jemand anderem.
 * Aufgaben haben keinen Chat-Start und kein Teilen (sie sind immer privat).
 */
export function buildMarketMenuActions(item: {
  kind: 'agent' | 'recipe' | 'task';
  own: boolean;
  inLibrary: boolean;
}): MenuAction[] {
  const actions: MenuAction[] = [];
  if (item.kind !== 'task') actions.push({ id: 'chat', title: 'Im Chat öffnen' });
  actions.push({ id: 'details', title: 'Details' });
  if (item.own) {
    actions.push({ id: 'edit', title: 'Bearbeiten' });
    if (item.kind !== 'task') actions.push({ id: 'share', title: 'Teilen' });
    actions.push({ id: 'delete', title: 'Löschen', attributes: { destructive: true } });
  } else if (item.inLibrary) {
    actions.push({
      id: 'remove',
      title: 'Aus meinen Grüneratoren entfernen',
      attributes: { destructive: true },
    });
  }
  return actions;
}
