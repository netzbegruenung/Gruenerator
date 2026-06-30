import { SmartInput } from '@gruenerator/ui';

// SmartInput is a styled text input that opens a cmdk suggestion list (in a
// Popover) on focus/typing. The popover only opens via internal state on
// interaction (no `open`/`defaultOpen` prop), so a static screenshot shows the
// resting input — the list surface cannot be forced open. We render realistic
// empty + filled input states. Handlers are no-ops.

const options = [
  { value: 'klimaschutz', label: 'Klimaschutz', description: 'Verkehr, Energie, Wärmewende' },
  { value: 'mobilitaet', label: 'Mobilität & Verkehr', description: 'Radwege, ÖPNV, Tempo 30' },
  { value: 'soziales', label: 'Soziale Gerechtigkeit', description: 'Wohnen, Teilhabe, Pflege' },
  { value: 'bildung', label: 'Bildung', description: 'Kitas, Schulen, Ganztag' },
  { value: 'demokratie', label: 'Demokratie & Beteiligung' },
];

const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 360 };
const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--foreground, #18181b)' };

// Idle: placeholder only.
export function LeeresFeld() {
  return (
    <div style={wrap}>
      <span style={label}>Thema auswählen</span>
      <SmartInput
        value=""
        onValueChange={() => {}}
        options={options}
        placeholder="Thema suchen oder eingeben…"
      />
    </div>
  );
}

// Filled: a selected option's label is in the field.
export function MitAuswahl() {
  return (
    <div style={wrap}>
      <span style={label}>Thema auswählen</span>
      <SmartInput
        value="Mobilität & Verkehr"
        onValueChange={() => {}}
        options={options}
        placeholder="Thema suchen oder eingeben…"
      />
    </div>
  );
}
