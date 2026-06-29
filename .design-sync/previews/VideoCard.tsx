import { VideoCard } from '@gruenerator/ui';

const PlayBadge = () => (
  <div
    style={{
      position: 'absolute',
      top: 8,
      right: 8,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      background: 'rgba(0,0,0,0.55)',
      color: '#fff',
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 999,
    }}
  >
    <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
    Reel
  </div>
);

// A single vertical reel card: poster thumbnail, gradient title + duration overlay.
export function Reel() {
  return (
    <div style={{ width: 200 }}>
      <VideoCard
        src="#"
        poster="https://picsum.photos/seed/klimakampagne/400/720"
        title="Klimaschutz fängt vor der Haustür an"
        duration={42}
        aspect="9/16"
      />
    </div>
  );
}

// A row of reel cards with an overlay badge — as in the workplace reels section.
export function ReelGrid() {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <VideoCard
        src="#"
        poster="https://picsum.photos/seed/windkraft/400/720"
        title="Windkraft schneller ausbauen"
        duration={28}
        aspect="9/16"
        overlay={<PlayBadge />}
        style={{ width: 180 }}
      />
      <VideoCard
        src="#"
        poster="https://picsum.photos/seed/nahverkehr/400/720"
        title="49-Euro-Ticket dauerhaft sichern"
        duration={55}
        aspect="9/16"
        overlay={<PlayBadge />}
        style={{ width: 180 }}
      />
    </div>
  );
}

// Square aspect with a footer slot below the thumbnail.
export function SquareWithFooter() {
  return (
    <div style={{ width: 260 }}>
      <VideoCard
        src="#"
        poster="https://picsum.photos/seed/wahlkampf/400/400"
        title="Rückblick auf den Parteitag"
        duration={94}
        aspect="square"
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>Kampagnen-Team</span>
            <span style={{ opacity: 0.6 }}>vor 2 Tagen</span>
          </div>
        }
      />
    </div>
  );
}
