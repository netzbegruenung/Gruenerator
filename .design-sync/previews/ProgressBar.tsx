import { ProgressBar } from '@gruenerator/ui';

// A few progress states — campaign goal tracking with real values.
export function States() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 320 }}>
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            marginBottom: 6,
            color: '#374151',
          }}
        >
          <span>Unterschriften gesammelt</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>35%</span>
        </div>
        <ProgressBar value={35} color="#52907A" />
      </div>
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            marginBottom: 6,
            color: '#374151',
          }}
        >
          <span>Newsletter-Versand</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>70%</span>
        </div>
        <ProgressBar value={70} color="#5F8575" />
      </div>
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            marginBottom: 6,
            color: '#374151',
          }}
        >
          <span>Spendenziel erreicht</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>100%</span>
        </div>
        <ProgressBar value={100} color="#52907A" />
      </div>
    </div>
  );
}

// The size axis — sm / md / lg bar heights.
export function Sizes() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: 320 }}>
      <ProgressBar value={60} size="sm" color="#52907A" />
      <ProgressBar value={60} size="md" color="#52907A" />
      <ProgressBar value={60} size="lg" color="#52907A" />
    </div>
  );
}
