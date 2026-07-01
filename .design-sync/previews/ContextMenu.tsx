import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@gruenerator/ui';

// Overlay: render open so the card shows the context-menu surface. cfg pins
// single-mode + viewport so the portalled content renders inside the card.
export function MitgliedKontextmenue() {
  return (
    <ContextMenu open>
      <ContextMenuTrigger
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 220,
          height: 64,
          borderRadius: 8,
          border: '1px dashed var(--border, #d4d4d8)',
          color: 'var(--muted-foreground, #71717a)',
          fontSize: 13,
        }}
      >
        Rechtsklick auf Mitglied
      </ContextMenuTrigger>
      <ContextMenuContent style={{ width: 224 }}>
        <ContextMenuLabel>Maria Schneider</ContextMenuLabel>
        <ContextMenuItem>
          Profil öffnen
          <ContextMenuShortcut>⏎</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>Nachricht senden</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Zu Gruppe hinzufügen</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>Kreisverband</ContextMenuItem>
            <ContextMenuItem>AG Klimaschutz</ContextMenuItem>
            <ContextMenuItem>Wahlkampfteam</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem checked>Newsletter abonniert</ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>Rolle</ContextMenuLabel>
        <ContextMenuRadioGroup value="aktiv">
          <ContextMenuRadioItem value="aktiv">Aktives Mitglied</ContextMenuRadioItem>
          <ContextMenuRadioItem value="foerder">Fördermitglied</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">Mitglied entfernen</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
