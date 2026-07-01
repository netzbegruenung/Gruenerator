import { Button, Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';

// Overlay: render open so the card shows the popover surface. cfg pins single-mode
// + viewport so the portalled content renders inside the card. Panel content is
// inline-styled glue (the package only exports Popover/Trigger/Content/Anchor).
export function VeranstaltungEinstellungen() {
  return (
    <Popover open>
      <PopoverTrigger>Einstellungen</PopoverTrigger>
      <PopoverContent style={{ width: 288 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Veranstaltung</span>
            <span style={{ fontSize: 13, color: 'var(--muted-foreground, #71717a)' }}>
              Sichtbarkeit & Anmeldung anpassen.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span>Öffentlich gelistet</span>
              <input type="checkbox" defaultChecked />
            </label>
            <label
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span>Anmeldung erforderlich</span>
              <input type="checkbox" defaultChecked />
            </label>
            <label
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
              }}
            >
              <span>Warteliste aktiv</span>
              <input type="checkbox" />
            </label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button variant="outline" size="sm">
              Abbrechen
            </Button>
            <Button variant="brand" size="sm">
              Speichern
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
