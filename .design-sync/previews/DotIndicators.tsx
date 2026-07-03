import { DotIndicators } from '@gruenerator/ui';

// Carousel-style dot indicators with the active dot elongated and tinted
// in brand green — shown across the carousel positions.
export function Carousel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Erste von fünf Aktuelles-Karten</div>
        <DotIndicators count={5} activeIdx={0} onSelect={() => {}} />
      </div>
      <div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Dritte von fünf Aktuelles-Karten</div>
        <DotIndicators count={5} activeIdx={2} onSelect={() => {}} />
      </div>
      <div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Letzte von fünf Aktuelles-Karten</div>
        <DotIndicators count={5} activeIdx={4} onSelect={() => {}} />
      </div>
    </div>
  );
}

// Underneath a carousel card, indicating which of three Dokumente is shown.
export function DocumentCarousel() {
  return (
    <div style={{ width: 280, padding: 16, borderRadius: 12, border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 15, fontWeight: 700 }}>Beschlussvorlage Klimaschutz</div>
      <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>PDF · 12 Seiten</div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <DotIndicators count={3} activeIdx={1} onSelect={() => {}} />
      </div>
    </div>
  );
}
