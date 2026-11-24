import { type MenuAction } from '@expo/ui/community/menu';

export const SYNC_SOURCE_ID = 'sync';
export const DETACH_SOURCE_ID = 'detach';

/**
 * Das Zeilenmenü einer verbundenen Ablage (Wolke-Ordner, Drive-Auswahl): nur für
 * Admins; „Jetzt abgleichen" fehlt im archivierten Projekt (der Abgleich ruht dort).
 */
export function buildCloudSourceActions(isAdmin: boolean, archived: boolean): MenuAction[] {
  if (!isAdmin) return [];
  const sync: MenuAction[] = archived ? [] : [{ id: SYNC_SOURCE_ID, title: 'Jetzt abgleichen' }];
  return [...sync, { id: DETACH_SOURCE_ID, title: 'Trennen', attributes: { destructive: true } }];
}
