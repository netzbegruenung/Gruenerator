import { LoadingSection } from '@gruenerator/ui';

// LoadingSection: a compact inline loading row — a spinning Loader2 icon plus a
// short label. Used to fill a panel while server data is fetched. The `label`
// prop is the only knob; cell 1 shows several realistic in-flight messages.

const stack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  maxWidth: 420,
};

export function Ladezustände() {
  return (
    <div style={stack}>
      <LoadingSection label="Wird verarbeitet…" />
      <LoadingSection label="Meinungsbild wird berechnet…" />
      <LoadingSection label="Beiträge werden geladen…" />
    </div>
  );
}

export function ImPanel() {
  return (
    <div
      style={{
        width: 420,
        border: '1px solid var(--grey-200)',
        borderRadius: 12,
        background: 'var(--background)',
        padding: '4px 16px',
      }}
    >
      <LoadingSection label="Aktuelle Themen werden ausgewertet…" />
    </div>
  );
}
