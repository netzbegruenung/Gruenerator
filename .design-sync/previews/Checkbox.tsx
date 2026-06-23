import { Checkbox, Label } from '@gruenerator/ui';

// Checkbox is a Radix control: checked / defaultChecked / disabled.
// Compose with a Label where natural (checkbox first, so peer-disabled dims it).

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };

// Checked / unchecked / disabled side by side — the core state axis.
export function States() {
  return (
    <div style={col}>
      <div style={row}>
        <Checkbox id="cb-on" defaultChecked />
        <Label htmlFor="cb-on">Datenschutzerklärung gelesen</Label>
      </div>
      <div style={row}>
        <Checkbox id="cb-off" />
        <Label htmlFor="cb-off">Werbe-E-Mails erhalten</Label>
      </div>
      <div style={row}>
        <Checkbox id="cb-disabled" disabled />
        <Label htmlFor="cb-disabled">Funktion derzeit nicht verfügbar</Label>
      </div>
    </div>
  );
}

// A realistic consent list — multiple checked items in Eucalyptus green.
export function ConsentList() {
  return (
    <div style={col}>
      <div style={row}>
        <Checkbox id="th-klima" defaultChecked />
        <Label htmlFor="th-klima">Klimaschutz &amp; Energie</Label>
      </div>
      <div style={row}>
        <Checkbox id="th-verkehr" defaultChecked />
        <Label htmlFor="th-verkehr">Mobilität &amp; Verkehr</Label>
      </div>
      <div style={row}>
        <Checkbox id="th-soziales" />
        <Label htmlFor="th-soziales">Soziales &amp; Gerechtigkeit</Label>
      </div>
    </div>
  );
}
