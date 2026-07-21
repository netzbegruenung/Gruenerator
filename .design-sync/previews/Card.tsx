import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from '@gruenerator/ui';

const Dots = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

// The canonical content card: header (Raleway title + muted description),
// body, and a footer of brand actions.
export function PressRelease() {
  return (
    <Card style={{ maxWidth: 440 }}>
      <CardHeader>
        <CardTitle>Klimaschutz vor Ort stärken</CardTitle>
        <CardDescription>Pressemitteilung · 18. Juni 2026</CardDescription>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Die grüne Landtagsfraktion fordert ein kommunales Förderprogramm für Wärmepumpen und
          Dachbegrünung. „Klimaschutz entscheidet sich in den Kommunen", so die Sprecherin.
        </p>
      </CardContent>
      <CardFooter style={{ gap: 8 }}>
        <Button variant="brand">Weiterlesen</Button>
        <Button variant="ghost">Teilen</Button>
      </CardFooter>
    </Card>
  );
}

// Card with a header action slot (icon button pinned top-right).
export function WithAction() {
  return (
    <Card style={{ maxWidth: 440 }}>
      <CardHeader>
        <CardTitle>Newsletter Juni</CardTitle>
        <CardDescription>Geplant für nächste Woche</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Optionen">
            <Dots />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div style={{ display: 'flex', gap: 24 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>4.812</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Empfänger:innen</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>3 Themen</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>im Entwurf</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
