import { Badge } from '@gruenerator/ui';

const Check = () => (
  <svg
    viewBox="0 0 24 24"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// The full variant axis — what most changes the badge's appearance.
export function Variants() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Badge variant="default">Veröffentlicht</Badge>
      <Badge variant="secondary">In Prüfung</Badge>
      <Badge variant="outline">Entwurf</Badge>
      <Badge variant="destructive">Abgelehnt</Badge>
      <Badge variant="ghost">Archiviert</Badge>
      <Badge variant="link">Mehr anzeigen</Badge>
    </div>
  );
}

// Realistic content statuses, including a badge with a leading icon.
export function Statuses() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <Badge variant="default">
        <Check />
        Live
      </Badge>
      <Badge variant="secondary">Kampagne</Badge>
      <Badge variant="secondary">Newsletter</Badge>
      <Badge variant="outline">3 Themen</Badge>
      <Badge variant="destructive">Frist heute</Badge>
    </div>
  );
}
