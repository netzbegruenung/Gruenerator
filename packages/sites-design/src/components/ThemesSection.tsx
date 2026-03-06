import type { ThemesSection as ThemesSectionType } from '../types/candidate';
import { MarkdownContent } from '../utils/markdown';
import { Carousel, CarouselContent, CarouselItem, CarouselDots } from './ui/carousel';

interface ThemesSectionProps {
  data: ThemesSectionType;
}

export function ThemesSection({ data }: ThemesSectionProps) {
  return (
    <section className="bg-[var(--primary-50)] py-[var(--spacing-xxl-r)] md:py-[var(--spacing-xxxl-r)] overflow-hidden">
      <div className="max-w-[var(--container-max-width)] mx-auto px-[var(--spacing-md-r)]">
        <h2 className="text-[2rem] max-md:text-[1.75rem] font-bold text-[var(--primary-600)] mb-[var(--spacing-lg-r)] text-center">
          {data.title}
        </h2>

        <Carousel
          opts={{
            align: 'start',
            loop: false,
            skipSnaps: false,
          }}
        >
          <CarouselContent className="-ml-[var(--spacing-md-r)] md:-ml-[var(--spacing-lg-r)] lg:-ml-[var(--spacing-xl-r)]">
            {data.themes.map((theme, index) => (
              <CarouselItem
                key={index}
                className="pl-[var(--spacing-md-r)] md:pl-[var(--spacing-lg-r)] lg:pl-[var(--spacing-xl-r)] basis-[85%] md:basis-1/2 lg:basis-1/3"
              >
                <article className="bg-white rounded-[var(--radius-md)] overflow-hidden shadow-[var(--shadow-md)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)] h-full">
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
                  <div className="p-[var(--spacing-lg-r)]">
                    <h3 className="text-[var(--font-size-lg)] font-semibold text-[var(--primary-600)] mb-[var(--spacing-sm)]">
                      {theme.title}
                    </h3>
                    <MarkdownContent
                      content={theme.content}
                      className="text-[var(--grey-600)] text-[var(--font-size-base)] leading-relaxed"
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
