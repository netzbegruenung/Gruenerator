import { Label, Input, Checkbox } from '@gruenerator/ui';

// Label is rarely rendered alone — its real job is to caption a control via
// htmlFor (and to dim when the peer control is disabled). So compose it.

const field: React.CSSProperties = { display: 'grid', gap: 6, maxWidth: 320 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };

// Captioning a text input — the standard form-field header.
export function FieldLabel() {
  return (
    <div style={field}>
      <Label htmlFor="veranstaltung-ort">Ort der Veranstaltung</Label>
      <Input id="veranstaltung-ort" defaultValue="Bürgerhaus, Musterstadt" />
    </div>
  );
}

// Inline with a checkbox — Label sits beside the control it activates.
export function WithCheckbox() {
  return (
    <div style={row}>
      <Checkbox id="newsletter-opt" defaultChecked />
      <Label htmlFor="newsletter-opt">Newsletter der Grünen abonnieren</Label>
    </div>
  );
}

// Label dims (opacity 50) when its peer control is disabled.
export function DisabledPeer() {
  return (
    <div style={row}>
      <Checkbox id="archiv-opt" disabled />
      <Label htmlFor="archiv-opt">Archivierte Kampagnen anzeigen</Label>
    </div>
  );
}
