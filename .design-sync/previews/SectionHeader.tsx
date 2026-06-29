import { SectionHeader, Button } from '@gruenerator/ui';

const ChevronRight = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const block: React.CSSProperties = { maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 28 };

// Default size: a large section title with a "Neu erstellen" plus button
// (rendered when onCreate is set) and a trailing link action.
export function MitContentAktion() {
  return (
    <div style={block}>
      <SectionHeader
        title="Pressemitteilungen"
        onCreate={() => {}}
        createLabel="Neue Mitteilung"
        actions={
          <a
            href="#"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              fontSize: 13,
              color: 'var(--grey-400)',
              textDecoration: 'none',
            }}
          >
            Alle anzeigen <ChevronRight />
          </a>
        }
      />

      {/* Small size: a compact sub-section heading with a button action. */}
      <SectionHeader
        size="sm"
        title="Geplante Beiträge"
        actions={<Button variant="outline" size="sm">Verwalten</Button>}
      />
    </div>
  );
}

// A plain titled header with no actions — the minimal usage.
export function NurTitel() {
  return (
    <div style={{ maxWidth: 520 }}>
      <SectionHeader title="Top-Themen der Woche" />
    </div>
  );
}
