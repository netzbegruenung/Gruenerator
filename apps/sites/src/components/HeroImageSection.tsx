import type { HeroImageSection as HeroImageSectionType } from '@/types/candidate';

interface HeroImageSectionProps {
  data: HeroImageSectionType;
}

export function HeroImageSection({ data }: HeroImageSectionProps) {
  if (!data.imageUrl && !data.title) return null;

  return (
    <section
      className="hero-image-section"
      style={data.imageUrl ? { backgroundImage: `url(${data.imageUrl})` } : undefined}
    >
      <div className="hero-image-overlay">
        <div className="hero-image-content">
          <h2 className="hero-image-title">{data.title}</h2>
          {data.subtitle && (
            <p className="hero-image-subtitle">{data.subtitle}</p>
          )}
        </div>
      </div>
    </section>
  );
}
