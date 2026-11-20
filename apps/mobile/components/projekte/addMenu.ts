import { type MenuAction } from '@expo/ui/community/menu';

export type AddMenuId = 'existing' | 'doc' | 'sheet' | 'board' | 'file' | 'text';

/**
 * Das „+“ im Projekt: Vorhandenes hinzufügen, dann Neues anlegen, dann Datei und
 * Text. Präsentationen legt nur das Web an (Canvas-Editor).
 */
export function buildAddActions(): MenuAction[] {
  return [
    { id: 'existing', title: 'Vorhandenes hinzufügen' },
    { id: 'doc', title: 'Neues Doc' },
    { id: 'sheet', title: 'Neues Sheet' },
    { id: 'board', title: 'Neues Board' },
    { id: 'file', title: 'Datei hochladen' },
    { id: 'text', title: 'Text' },
  ];
}
