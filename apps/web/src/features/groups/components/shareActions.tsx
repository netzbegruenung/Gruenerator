import { type GroupFeedItem } from '@gruenerator/shared/groups';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@gruenerator/ui';
import { PiTrash } from 'react-icons/pi';

/**
 * Was man an einem Inhalt im Projekt verwalten darf. Die Regeln entscheidet der Host
 * (Admin oder wer geteilt hat); der Server prüft dieselben.
 */
export interface ShareActions {
  /** Rolle der Mitglieder ändern. */
  canManage: (item: GroupFeedItem) => boolean;
  canRemove: (item: GroupFeedItem) => boolean;
  onSetWrite: (item: GroupFeedItem, write: boolean) => void;
  onRemove: (item: GroupFeedItem) => void;
}

/** „Bearbeiten" / „Nur lesen" — nur für Docs, Sheets, Präsentationen und Boards. */
export function projectRoleLabel(item: GroupFeedItem): string | null {
  if (item.projectWrite === null) return null;
  return item.projectWrite ? 'Bearbeiten' : 'Nur lesen';
}

const canSetRole = (item: GroupFeedItem, actions: ShareActions) =>
  item.projectWrite !== null && actions.canManage(item);

export function hasShareMenu(item: GroupFeedItem, actions: ShareActions | null): boolean {
  return !!actions && (canSetRole(item, actions) || actions.canRemove(item));
}

/**
 * Die Menüeinträge zu einem geteilten Inhalt — gleich in der Wissensliste und auf
 * der Karte in „Alle": wer ihn bearbeiten darf, und „Aus dem Projekt entfernen".
 */
export function ShareMenuItems({
  item,
  actions,
  leadingSeparator = false,
}: {
  item: GroupFeedItem;
  actions: ShareActions;
  /** Stehen schon andere Einträge darüber. */
  leadingSeparator?: boolean;
}) {
  const role = canSetRole(item, actions);
  const remove = actions.canRemove(item);
  if (!role && !remove) return null;
  return (
    <>
      {leadingSeparator && <DropdownMenuSeparator />}
      {role && (
        <>
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Mitglieder können
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={item.projectWrite ? 'write' : 'read'}
            onValueChange={(value) => {
              const write = value === 'write';
              if (write !== item.projectWrite) actions.onSetWrite(item, write);
            }}
          >
            <DropdownMenuRadioItem value="write">Bearbeiten</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="read">Nur lesen</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          {remove && <DropdownMenuSeparator />}
        </>
      )}
      {remove && (
        <DropdownMenuItem variant="destructive" onSelect={() => actions.onRemove(item)}>
          <PiTrash aria-hidden className="mr-xs size-4" />
          Aus dem Projekt entfernen
        </DropdownMenuItem>
      )}
    </>
  );
}
