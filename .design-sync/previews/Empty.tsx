import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  Button,
} from '@gruenerator/ui';

const Megaphone = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);
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

// The canonical empty-state: a boxed dashed container with an icon medium,
// title, description and a call-to-action in EmptyContent.
export function KeinePressemitteilungen() {
  return (
    <div style={{ maxWidth: 460 }}>
      <Empty style={{ borderWidth: 1, borderStyle: 'dashed' }}>
        <EmptyHeader style={{ width: '100%', maxWidth: 320 }}>
          <EmptyMedia variant="icon">
            <Megaphone />
          </EmptyMedia>
          <EmptyTitle>Noch keine Pressemitteilungen</EmptyTitle>
          <EmptyDescription>
            Lege deine erste Mitteilung an. Der Grünerator hilft dir beim Entwurf und schlägt
            passende Überschriften vor.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="brand">
            <Plus /> Mitteilung erstellen
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
