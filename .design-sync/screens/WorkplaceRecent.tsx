import { SectionHeader, ArticleCard, VideoCard, DocumentCard } from '../../packages/ui/src/index';

// Recreation of the workplace RecentlyCreatedSection ("Zuletzt erstellt"): a
// titled grid of the user's recently-created content — texts, reels, sources.
// Uses an explicit 3-column grid (CardGrid's responsive columns collapse below
// 3 at the card viewport) and a square, width-bounded VideoCard thumbnail.
const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 16,
  alignItems: 'start',
  marginTop: 12,
};

export function WorkplaceRecent() {
  return (
    <div style={{ width: '100%' }}>
      <SectionHeader title="Zuletzt erstellt" />
      <div style={grid}>
        <ArticleCard
          url="#"
          title="Klimaschutz vor Ort stärken"
          excerpt="Pressemitteilung zum kommunalen Förderprogramm für Wärmepumpen und Dachbegrünung."
          source="Pressemitteilung"
          publishedAt="2026-06-24"
        />
        <VideoCard
          src=""
          poster="https://picsum.photos/seed/reel-gruen/480/480"
          title="Reel: Mehr Tempo beim Radwegeausbau"
          duration={32}
          aspect="square"
        />
        <DocumentCard
          title="Antrag: Solardächer auf kommunalen Gebäuden"
          excerpt="Entwurf · zuletzt bearbeitet gestern"
          sourceUrl="#"
          sourceName="Antrag"
          sourceColor="#5F8575"
        />
      </div>
    </div>
  );
}
