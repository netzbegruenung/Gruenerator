import { type MenuAction } from '@expo/ui/community/menu';

/**
 * The action models behind the native context menus.
 *
 * Split out from the components because a `MenuView` renders a real SwiftUI
 * `Menu` / Compose `DropdownMenu` — there is no React tree inside it to assert
 * against, so the jest-expo lane cannot reach the labels, the disabled states or
 * the destructive flag. Building the `MenuAction[]` here keeps the part that can
 * actually be wrong under test; what is left in the component is a native view
 * and one `switch`.
 *
 * Icons are omitted throughout. `image` takes an SF Symbol name on iOS and an
 * `ImageSourcePropType` on Android — one icon set would need two spellings, and
 * platform menus are text-first anyway.
 */

/** Menu entries of an assistant message. Identifiers, not labels — see `onPressAction`. */
export type MessageMenuId = 'export-docx' | 'open-in-docs';

/** Menu entries of one conversation. */
export type ThreadMenuId = 'rename' | 'share' | 'archive' | 'unarchive' | 'delete';

export function buildMessageMenuActions(exporting: boolean): MenuAction[] {
  // Both actions leave the app (share sheet, editor). While one is running the
  // menu must not offer the other — the second handoff would land on top of the
  // first and the user would see whichever won.
  const attributes = { disabled: exporting };
  return [
    { id: 'export-docx', title: 'Als Word herunterladen', attributes },
    { id: 'open-in-docs', title: 'Im Editor öffnen', attributes },
  ];
}

export function buildThreadMenuActions(archived: boolean): MenuAction[] {
  return [
    { id: 'rename', title: 'Umbenennen' },
    { id: 'share', title: 'Mit Gruppe teilen' },
    archived
      ? { id: 'unarchive', title: 'Wiederherstellen' }
      : { id: 'archive', title: 'Archivieren' },
    // Destructive is the native flag, not a colour we pick: it puts the entry
    // last and red on iOS, and both platforms treat it as the one entry that
    // needs a second thought. The confirmation still happens in the caller.
    { id: 'delete', title: 'Löschen', attributes: { destructive: true } },
  ];
}

/**
 * `onPressAction` hands back a bare string. This narrows it, so a renamed id in
 * one of the builders above becomes a type error at the call site instead of a
 * menu entry that silently does nothing.
 */
export function asThreadMenuId(event: string): ThreadMenuId | null {
  switch (event) {
    case 'rename':
    case 'share':
    case 'archive':
    case 'unarchive':
    case 'delete':
      return event;
    default:
      return null;
  }
}

export function asMessageMenuId(event: string): MessageMenuId | null {
  return event === 'export-docx' || event === 'open-in-docs' ? event : null;
}
