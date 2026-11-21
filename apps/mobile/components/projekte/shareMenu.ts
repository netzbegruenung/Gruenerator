import { type MenuAction } from '@expo/ui/community/menu';
import { type GroupFeedItem } from '@gruenerator/shared/groups';

import { buildModerationActions } from './moderationMenu';

export type ShareMenuId = 'write' | 'read' | 'note' | 'pin' | 'unpin' | 'remove';

/** „Bearbeiten" / „Nur lesen" — nur für Docs, Sheets, Präsentationen und Boards (wie im Web). */
export function projectRoleLabel(item: Pick<GroupFeedItem, 'projectWrite'>): string | null {
  if (item.projectWrite === null) return null;
  return item.projectWrite ? 'Bearbeiten' : 'Nur lesen';
}

/**
 * Die Verwaltungseinträge zu einer Freigabe: wer bearbeiten darf (mit Häkchen am
 * aktuellen Stand), Notiz bearbeiten, Anheften/Lösen (nur Projekt-Admins) und
 * „Aus dem Projekt entfernen". Beiträge sind keine Freigaben — sie haben eigene
 * Routen und kommen hier nie vor.
 */
export function buildShareActions(
  item: Pick<GroupFeedItem, 'projectWrite' | 'post' | 'share'>,
  canManage: boolean,
  canPin = false
): MenuAction[] {
  if (!canManage || item.post) return [];
  const actions: MenuAction[] = [];
  if (item.projectWrite !== null) {
    actions.push(
      {
        id: 'write',
        title: 'Mitglieder dürfen bearbeiten',
        state: item.projectWrite ? 'on' : 'off',
      },
      {
        id: 'read',
        title: 'Mitglieder dürfen nur lesen',
        state: item.projectWrite ? 'off' : 'on',
      }
    );
  }
  if (item.share) {
    actions.push({ id: 'note', title: 'Notiz bearbeiten' });
    if (canPin) {
      actions.push(
        item.share.pinnedAt ? { id: 'unpin', title: 'Lösen' } : { id: 'pin', title: 'Anheften' }
      );
    }
  }
  actions.push({
    id: 'remove',
    title: 'Aus dem Projekt entfernen',
    attributes: { destructive: true },
  });
  return actions;
}

/** Ein Menü je Karte: erst die Verwaltung, dann Melden/Ausblenden. */
export function buildItemMenuActions(
  share: MenuAction[],
  canReport: boolean,
  canHide: boolean
): MenuAction[] {
  return [...share, ...buildModerationActions(canReport, canHide)];
}
