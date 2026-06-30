import { ImageComparisonSlider } from '@gruenerator/ui';

// Before/after of a Stadtplatz-Umgestaltung — vorher (Asphalt) gegen nachher
// (begrünt). Slider parked just past the middle so both states are visible.
export function VorherNachher() {
  return (
    <div
      style={{
        width: 480,
        height: 300,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      <ImageComparisonSlider
        leftImage="https://picsum.photos/seed/asphalt/480/300?grayscale"
        rightImage="https://picsum.photos/seed/gruenerplatz/480/300"
        altLeft="Vorher: versiegelter Platz"
        altRight="Nachher: begrünter Platz"
        initialPosition={52}
      />
    </div>
  );
}
