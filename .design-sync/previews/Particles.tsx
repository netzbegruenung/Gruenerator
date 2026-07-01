import { Particles } from '@gruenerator/ui';

// A drifting particle field behind a hero line — the ambient backdrop used on a
// Kampagnen-Startseite. Dark panel so the light particles read clearly.
export function KampagnenHero() {
  return (
    <div
      style={{
        position: 'relative',
        width: 420,
        height: 260,
        overflow: 'hidden',
        borderRadius: 16,
        background: '#0f2e26',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Particles
        style={{ position: 'absolute', inset: 0 }}
        quantity={140}
        size={1.4}
        color="#a8d5c4"
      />
      <div
        style={{
          position: 'relative',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          color: '#fff',
        }}
      >
        <span style={{ fontSize: 24, fontWeight: 700 }}>Gemeinsam für Morgen</span>
        <span style={{ fontSize: 14, opacity: 0.85 }}>Kampagne 2025</span>
      </div>
    </div>
  );
}
