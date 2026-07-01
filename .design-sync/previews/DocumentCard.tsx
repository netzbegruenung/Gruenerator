import { DocumentCard } from '@gruenerator/ui';

// A single document card: source pill (colored Library icon), title, excerpt.
export function Wahlprogramm() {
  return (
    <div style={{ maxWidth: 360 }}>
      <DocumentCard
        title="Wahlprogramm 2025 — Klima, Wirtschaft, Gerechtigkeit"
        excerpt="Wir machen Deutschland klimaneutral und sorgen dafür, dass alle Menschen von der Transformation profitieren. Bezahlbarer Strom, gute Arbeit und ein starker Sozialstaat."
        sourceUrl="#"
        sourceName="Grundsatzprogramm"
        sourceColor="#52907A"
      />
    </div>
  );
}

// A grid of document cards with differing source colors (collection tagging).
export function KnowledgeBase() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720 }}>
      <DocumentCard
        title="Antrag: Solaroffensive für öffentliche Gebäude"
        excerpt="Alle landeseigenen Dächer sollen bis 2030 mit Photovoltaik ausgestattet werden, um die Stromkosten der öffentlichen Hand zu senken."
        sourceUrl="#"
        sourceName="Anträge"
        sourceColor="#5F8575"
      />
      <DocumentCard
        title="Positionspapier zur kommunalen Wärmeplanung"
        excerpt="Leitfaden für Kommunen zur Erstellung von Wärmeplänen und zum Aufbau klimaneutraler Nahwärmenetze."
        sourceUrl="#"
        sourceName="Fraktion"
        sourceColor="#d97706"
      />
    </div>
  );
}

// Title-only variant (no excerpt) — used for compact source listings.
export function CompactSource() {
  return (
    <div style={{ maxWidth: 360 }}>
      <DocumentCard
        title="Beschluss der Bundesdelegiertenkonferenz 2024"
        sourceUrl="#"
        sourceName="Beschlüsse"
        sourceColor="#7c3aed"
      />
    </div>
  );
}
