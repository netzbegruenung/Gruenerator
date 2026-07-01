import { Input, Label } from '@gruenerator/ui';

// Input is a styled native <input> — all native props (placeholder, disabled,
// type, defaultValue, aria-invalid) pass straight through.

const field: React.CSSProperties = { display: 'grid', gap: 6, maxWidth: 320 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 320 };

// Composed with a Label — the canonical form-field pattern (Label htmlFor + Input id).
export function WithLabel() {
  return (
    <div style={field}>
      <Label htmlFor="kampagne-titel">Titel der Kampagne</Label>
      <Input id="kampagne-titel" defaultValue="Klimaschutz vor Ort" />
    </div>
  );
}

// Placeholder vs. filled value.
export function Filled() {
  return (
    <div style={col}>
      <Input placeholder="E-Mail für den Newsletter" type="email" />
      <Input defaultValue="kontakt@gruene-musterstadt.de" type="email" />
    </div>
  );
}

// Invalid state via aria-invalid (destructive ring) plus a disabled field.
export function States() {
  return (
    <div style={col}>
      <div style={field}>
        <Label htmlFor="plz-error">Postleitzahl</Label>
        <Input id="plz-error" defaultValue="1234" aria-invalid="true" />
      </div>
      <div style={field}>
        <Label htmlFor="mitglied-id">Mitgliedsnummer</Label>
        <Input id="mitglied-id" defaultValue="GRÜNE-2024-0815" disabled />
      </div>
    </div>
  );
}
