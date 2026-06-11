import type { HeroImageSection as HeroImageSectionType } from '../types/candidate';

interface HeroImageSectionProps {
  data: HeroImageSectionType;
}

export function HeroImageSection({ data }: HeroImageSectionProps) {
  if (!data.imageUrl && !data.title) return null;

  return (
    <section
      className="relative min-h-[40vh] md:min-h-[50vh] lg:min-h-[60vh] bg-cover bg-center bg-scroll lg:bg-fixed flex items-center justify-center"
      style={data.imageUrl ? { backgroundImage: `url(${data.imageUrl})` } : undefined}
    >
      <div className="absolute inset-0 bg-black/65 flex items-center justify-center">
        <div className="text-center p-[var(--spacing-responsive-large)] md:p-[var(--spacing-responsive-xlarge)] max-w-[800px]">
          <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-xl)] md:text-[length:var(--font-size-2xl)] lg:text-[length:var(--font-size-3xl)] xl:text-[length:var(--font-size-4xl)] font-bold text-white mb-[var(--spacing-md)] [text-shadow:0_2px_4px_rgba(0,0,0,0.3)]">
            {data.title}
          </h2>
          {data.subtitle && (
            <p className="text-[length:var(--font-size-lg)] text-[var(--neutral-600)]">
              {data.subtitle}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
