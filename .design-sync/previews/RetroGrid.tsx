import { RetroGrid } from '@gruenerator/ui';

// A perspective grid backdrop behind a section title — the animated floor used
// on a Kampagnen- oder Veranstaltungs-Landingpage.
export function VeranstaltungBackdrop() {
  return (
    <div
      style={{
        position: 'relative',
        width: 440,
        height: 260,
        overflow: 'hidden',
        borderRadius: 16,
        background: 'var(--card)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RetroGrid angle={65} cellSize={48} lightLineColor="#5F8575" darkLineColor="#5F8575" />
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          color: 'var(--foreground)',
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 700 }}>Klimakonferenz 2025</span>
        <span style={{ fontSize: 14, opacity: 0.75 }}>14. Juni · Berlin</span>
      </div>
    </div>
  );
}
