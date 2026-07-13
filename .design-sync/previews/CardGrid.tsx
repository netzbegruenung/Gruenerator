import {
  CardGrid,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
} from '@gruenerator/ui';

const Megaphone = () => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 11 18-5v12L3 14v-3zM11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);
const Mail = () => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);
const Doc = () => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M9 13h6M9 17h6" />
  </svg>
);
const Calendar = () => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const TILES = [
  {
    Icon: Megaphone,
    label: 'Pressemitteilung',
    desc: 'Erstelle druckreife Statements zu aktuellen Themen.',
    badge: 'Beliebt',
  },
  { Icon: Mail, label: 'Newsletter', desc: 'Verfasse Mitglieder-Newsletter mit klarer Struktur.' },
  { Icon: Doc, label: 'Antrag', desc: 'Formuliere Anträge für Rat und Fraktion.' },
  {
    Icon: Calendar,
    label: 'Veranstaltung',
    desc: 'Plane Termine und schreibe passende Einladungen.',
    badge: 'Neu',
  },
];

// CardGrid as the tool picker: a responsive grid of feature tiles. The config
// pins cardMode:column (wide viewport) so the multi-column layout shows.
export function WerkzeugRaster() {
  return (
    <CardGrid columns="3" gap="md">
      {TILES.map(({ Icon, label, desc, badge }) => (
        <Card key={label} style={{ height: '100%' }}>
          <CardHeader>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ color: 'var(--secondary-600, #5F8575)' }}>
                <Icon />
              </span>
              {badge && <Badge variant="default">{badge}</Badge>}
            </div>
            <CardTitle style={{ marginTop: 8 }}>{label}</CardTitle>
            <CardDescription>{desc}</CardDescription>
          </CardHeader>
          <CardContent>
            <span style={{ fontSize: 13, color: 'var(--secondary-600, #5F8575)', fontWeight: 600 }}>
              Jetzt erstellen →
            </span>
          </CardContent>
        </Card>
      ))}
    </CardGrid>
  );
}
