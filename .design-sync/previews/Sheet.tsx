import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Switch,
  Label,
} from '@gruenerator/ui';

// Overlay component: rendered in the controlled `open` state so the card shows
// the side panel (cfg.overrides.Sheet pins cardMode single + viewport).
// Settings sheet sliding in from the right with realistic board options.
export function BoardSettings() {
  return (
    <Sheet open>
      {/* Explicit width: in this bundle `max-w-sm` compiles to var(--spacing-sm)
          (~12px) instead of a container width, so the panel's default
          `sm:max-w-sm` collapses at the 640px viewport. Pin a real panel width
          as layout glue. See learnings (config-level max-w-* collision). */}
      <SheetContent side="right" style={{ width: 384, maxWidth: 384 }}>
        <SheetHeader>
          <SheetTitle>Board-Einstellungen</SheetTitle>
          <SheetDescription>
            Konfiguriere Sichtbarkeit und Benachrichtigungen für das Board „Wahlkampf 2026".
          </SheetDescription>
        </SheetHeader>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label htmlFor="public">Öffentlich sichtbar</Label>
            <Switch id="public" defaultChecked />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label htmlFor="notify">E-Mail bei neuen Karten</Label>
            <Switch id="notify" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Label htmlFor="archive">Erledigte automatisch archivieren</Label>
            <Switch id="archive" defaultChecked />
          </div>
        </div>
        <SheetFooter>
          <Button variant="brand">Speichern</Button>
          <Button variant="outline">Abbrechen</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
