import { AnimatedCircularProgressBar } from '@gruenerator/ui';

// Decorative gauges at a few values — brand green primary, light track.
export function Gauges() {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <AnimatedCircularProgressBar
          value={42}
          max={100}
          min={0}
          gaugePrimaryColor="#52907A"
          gaugeSecondaryColor="#E5EAE8"
        />
        <span style={{ fontSize: 12, color: '#6b7280' }}>Wahlkampf-Fortschritt</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <AnimatedCircularProgressBar
          value={78}
          max={100}
          min={0}
          gaugePrimaryColor="#5F8575"
          gaugeSecondaryColor="#E5EAE8"
        />
        <span style={{ fontSize: 12, color: '#6b7280' }}>Mitglieder-Ziel</span>
      </div>
    </div>
  );
}

// A single high-emphasis gauge near completion.
export function Complete() {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 8 }}
    >
      <AnimatedCircularProgressBar
        value={100}
        max={100}
        min={0}
        gaugePrimaryColor="#52907A"
        gaugeSecondaryColor="#E5EAE8"
      />
      <span style={{ fontSize: 12, color: '#6b7280' }}>Spendenziel erreicht</span>
    </div>
  );
}
