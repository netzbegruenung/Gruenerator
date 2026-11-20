import { type MenuAction } from '@expo/ui/community/menu';

export type AddMenuId = 'post' | 'existing' | 'doc' | 'sheet' | 'board' | 'file' | 'text';

/**
 * Das „+“ im Projekt: Beitrag schreiben (nur wo erlaubt), Vorhandenes hinzufügen,
 * dann Neues anlegen, dann Datei und Text. Präsentationen legt nur das Web an
 * (Canvas-Editor).
 */
export function buildAddActions(canPost = false): MenuAction[] {
  const actions: MenuAction[] = [
    { id: 'existing', title: 'Vorhandenes hinzufügen' },
    { id: 'doc', title: 'Neues Doc' },
    { id: 'sheet', title: 'Neues Sheet' },
    { id: 'board', title: 'Neues Board' },
    { id: 'file', title: 'Datei hochladen' },
    { id: 'text', title: 'Text' },
  ];
  return canPost ? [{ id: 'post', title: 'Beitrag schreiben' }, ...actions] : actions;
}
