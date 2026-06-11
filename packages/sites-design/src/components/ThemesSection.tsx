import type { ThemesSection as ThemesSectionType } from '../types/candidate';
import { MarkdownContent } from '../utils/markdown';
import { Carousel, CarouselContent, CarouselItem, CarouselDots } from './ui/carousel';

interface ThemesSectionProps {
  data: ThemesSectionType;
}

export function ThemesSection({ data }: ThemesSectionProps) {
  return (
    <section className="bg-[var(--background-color-alt)] py-[var(--spacing-responsive-xxlarge)] md:py-16 px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)] overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] md:text-[length:var(--font-size-3xl)] font-bold text-[var(--link-color)] mb-[var(--spacing-responsive-large)] text-center">
          {data.title}
        </h2>

        <Carousel
          opts={{
            align: 'start',
            loop: false,
            skipSnaps: false,
          }}
        >
          <CarouselContent className="-ml-[var(--spacing-responsive-medium)] md:-ml-[var(--spacing-responsive-large)]">
            {data.themes.map((theme, index) => (
              <CarouselItem
                key={index}
                className="pl-[var(--spacing-responsive-medium)] md:pl-[var(--spacing-responsive-large)] basis-[85%] md:basis-1/2 lg:basis-1/3"
              >
                <article className="bg-[var(--background-color-pure)] rounded-[var(--radius-md)] overflow-hidden shadow-[var(--shadow-md)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] h-full">
                  {theme.imageUrl && (
                    <div className="aspect-[16/10] overflow-hidden">
                      <img
                        src={theme.imageUrl}
                        alt={theme.title}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="p-[var(--spacing-responsive-large)]">
                    <h3 className="text-[length:var(--font-size-lg)] font-semibold text-[var(--link-color)] mb-[var(--spacing-sm)]">
                      {theme.title}
                    </h3>
                    <MarkdownContent
                      content={theme.content}
                      className="text-[var(--font-color-muted)] text-[length:var(--font-size-base)] leading-relaxed"
                    />
                  </div>
                </article>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselDots />
        </Carousel>
      </div>
    </section>
  );
}
