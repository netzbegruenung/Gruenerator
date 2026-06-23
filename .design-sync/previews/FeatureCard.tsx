import { FeatureCard } from '@gruenerator/ui';

const Badge = ({ children }: { children: React.ReactNode }) => (
  <span
    style={{
      position: 'absolute',
      top: 12,
      right: 12,
      zIndex: 2,
      background: '#52907A',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      padding: '3px 10px',
      borderRadius: 999,
      letterSpacing: '0.02em',
    }}
  >
    {children}
  </span>
);

// Image-backed feature card: cover image, gradient overlay, label + badge.
export function ImageFeature() {
  return (
    <div style={{ width: 240 }}>
      <FeatureCard
        onClick={() => {}}
        label="Sharepic erstellen"
        description="Social-Media-Grafiken im Grünen Design"
        image="https://picsum.photos/seed/sharepic/600/600"
        badge={<Badge>Neu</Badge>}
      />
    </div>
  );
}

// Solid-color picker variant (gradient-dark) — centered label, no image asset.
export function ColorVariant() {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ width: 200 }}>
        <FeatureCard
          onClick={() => {}}
          label="Instagram Post"
          backgroundColor="#52907A"
          variant="gradient-dark"
        />
      </div>
      <div style={{ width: 200 }}>
        <FeatureCard
          onClick={() => {}}
          label="Story Format"
          backgroundColor="#3d6b5a"
          variant="gradient-dark"
        />
      </div>
    </div>
  );
}

// Default text card: title + description, hover-lift highlight (no image).
export function TextFeature() {
  return (
    <div style={{ display: 'flex', gap: 16, maxWidth: 560 }}>
      <FeatureCard
        onClick={() => {}}
        label="Pressemitteilung"
        description="Erstelle eine professionelle Pressemitteilung im Handumdrehen."
      />
      <FeatureCard
        onClick={() => {}}
        label="Antrag schreiben"
        description="Formuliere kommunalpolitische Anträge mit korrekter Struktur."
      />
    </div>
  );
}
