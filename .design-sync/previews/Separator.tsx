import { Separator } from '@gruenerator/ui';

// Horizontal separator splitting a title block from its description —
// the most common usage in card and section headers.
export function Horizontal() {
  return (
    <div style={{ maxWidth: 360 }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>Klimaschutz vor Ort</div>
      <div style={{ fontSize: 13, opacity: 0.7 }}>Pressemitteilung · 18. Juni 2026</div>
      <Separator style={{ marginTop: 12, marginBottom: 12 }} />
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
        Die grüne Fraktion fordert ein kommunales Förderprogramm für Wärmepumpen und Dachbegrünung.
      </p>
    </div>
  );
}

// Vertical separators between inline meta items — like a stats row in a
// dashboard header.
export function Vertical() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 28 }}>
      <span style={{ fontSize: 14, fontWeight: 600 }}>Veranstaltungen</span>
      <Separator orientation="vertical" />
      <span style={{ fontSize: 14 }}>12 geplant</span>
      <Separator orientation="vertical" />
      <span style={{ fontSize: 14 }}>4.812 Anmeldungen</span>
    </div>
  );
}
