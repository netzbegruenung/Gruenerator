import { Button } from '@gruenerator/ui';

// Inline SVGs keep previews dependency-free; Button sizes any child svg via
// its `[&_svg]:size-4` class.
const Plus = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const Check = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const row: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
};

// The standard shadcn variant axis — the prop that most changes appearance.
export function Variants() {
  return (
    <div style={row}>
      <Button>Speichern</Button>
      <Button variant="secondary">Entwurf</Button>
      <Button variant="outline">Abbrechen</Button>
      <Button variant="ghost">Mehr</Button>
      <Button variant="destructive">Löschen</Button>
      <Button variant="link">Mehr erfahren</Button>
    </div>
  );
}

// Grünerator's rounded "brand" buttons — the primary CTA style (Eucalyptus green).
export function BrandButtons() {
  return (
    <div style={row}>
      <Button variant="brand">Veröffentlichen</Button>
      <Button variant="brand-outline">Vorschau</Button>
      <Button variant="brand-ghost">Verwerfen</Button>
      <Button variant="brand-danger">Kampagne beenden</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Button size="sm">Klein</Button>
      <Button size="default">Standard</Button>
      <Button size="lg">Groß</Button>
      <Button size="icon" aria-label="Hinzufügen">
        <Plus />
      </Button>
    </div>
  );
}

export function States() {
  return (
    <div style={row}>
      <Button>
        <Check /> Gespeichert
      </Button>
      <Button disabled>Deaktiviert</Button>
      <Button variant="outline" disabled>
        Nicht verfügbar
      </Button>
    </div>
  );
}
