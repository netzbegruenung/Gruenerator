import { Ripple } from '@gruenerator/ui';

// Concentric ripple rings behind a call-to-action — the kind of animated
// backdrop used on a Mitmachen / Spenden hero.
export function MitmachenHero() {
  return (
    <div
      style={{
        position: 'relative',
        width: 420,
        height: 260,
        overflow: 'hidden',
        borderRadius: 16,
        background: 'var(--secondary-600, #5F8575)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}
    >
      <Ripple />
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 700 }}>Jetzt mitmachen</span>
        <span style={{ fontSize: 14, opacity: 0.9 }}>Werde Teil der Kampagne</span>
      </div>
    </div>
  );
}
