import { Toggle } from '@gruenerator/ui';

// Toggle is a Radix two-state button: pressed / defaultPressed / disabled,
// variant default|outline, size sm|default|lg. Toggle sizes child svgs to size-4.

const Bold = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z" />
  </svg>
);
const Bell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 };

// variant axis — default vs. outline, each pressed and unpressed.
export function Variants() {
  return (
    <div style={row}>
      <Toggle defaultPressed>Fett</Toggle>
      <Toggle>Kursiv</Toggle>
      <Toggle variant="outline" defaultPressed>Wichtig</Toggle>
      <Toggle variant="outline">Entwurf</Toggle>
    </div>
  );
}

// Icon toggles across the three sizes (sm / default / lg).
export function Sizes() {
  return (
    <div style={row}>
      <Toggle size="sm" defaultPressed aria-label="Fett"><Bold /></Toggle>
      <Toggle size="default" aria-label="Fett"><Bold /></Toggle>
      <Toggle size="lg" defaultPressed aria-label="Benachrichtigungen"><Bell /></Toggle>
    </div>
  );
}

// Pressed / unpressed / disabled states with labels.
export function States() {
  return (
    <div style={row}>
      <Toggle defaultPressed>Abonniert</Toggle>
      <Toggle variant="outline">Stummschalten</Toggle>
      <Toggle disabled>Gesperrt</Toggle>
    </div>
  );
}
