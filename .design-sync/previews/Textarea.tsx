import { Textarea, Label } from '@gruenerator/ui';

// Textarea is a styled native <textarea>; native props pass through.

const field: React.CSSProperties = { display: 'grid', gap: 6, maxWidth: 380 };
const col: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  maxWidth: 380,
};

// Composed with a Label — a typical motion / Antrag body field.
export function WithLabel() {
  return (
    <div style={field}>
      <Label htmlFor="antrag-begruendung">Begründung des Antrags</Label>
      <Textarea
        id="antrag-begruendung"
        rows={4}
        defaultValue="Die Stadt soll bis 2030 klimaneutral werden. Dazu fordern wir ein verbindliches Sanierungsprogramm für kommunale Gebäude sowie den Ausbau sicherer Radwege."
      />
    </div>
  );
}

// Placeholder (empty) state.
export function Placeholder() {
  return (
    <div style={field}>
      <Label htmlFor="pm-entwurf">Entwurf der Pressemitteilung</Label>
      <Textarea
        id="pm-entwurf"
        rows={4}
        placeholder="Worum geht es in der Mitteilung? Stichpunkte genügen …"
      />
    </div>
  );
}

// Invalid (aria-invalid) and disabled states.
export function States() {
  return (
    <div style={col}>
      <Textarea
        rows={3}
        aria-invalid="true"
        defaultValue="Zu kurz – bitte mindestens 280 Zeichen für den Social-Post."
      />
      <Textarea
        rows={3}
        disabled
        defaultValue="Veröffentlichter Beitrag – kann nicht mehr bearbeitet werden."
      />
    </div>
  );
}
