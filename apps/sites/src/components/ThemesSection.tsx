import { useRef, useState, useEffect, useCallback } from 'react';
import { MarkdownContent } from '@/utils/markdown';
import type { ThemesSection as ThemesSectionType } from '@/types/candidate';

interface ThemesSectionProps {
  data: ThemesSectionType;
}

export function ThemesSection({ data }: ThemesSectionProps) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(1);
  const [scrollPosition, setScrollPosition] = useState(0);

  const totalPositions = Math.max(1, data.themes.length - visibleCount + 1);
  const showPagination = totalPositions > 1;

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    const updateVisibleCount = () => {
      const firstCard = carousel.querySelector('.theme-card') as HTMLElement;
      if (!firstCard) return;

      const cardWidth = firstCard.getBoundingClientRect().width;
      const gap = parseFloat(getComputedStyle(carousel).gap) || 0;
      const containerWidth = carousel.clientWidth;

      const visible = Math.floor((containerWidth + gap) / (cardWidth + gap));
      setVisibleCount(Math.max(1, Math.min(visible, data.themes.length)));
    };

    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(carousel);

    updateVisibleCount();

    return () => observer.disconnect();
  }, [data.themes.length]);

  const handleScroll = useCallback(() => {
    const carousel = carouselRef.current;
    if (!carousel || totalPositions <= 1) return;

    const maxScroll = carousel.scrollWidth - carousel.clientWidth;
    if (maxScroll <= 0) return;

    const scrollPercent = carousel.scrollLeft / maxScroll;
    const newPosition = Math.round(scrollPercent * (totalPositions - 1));

    if (newPosition !== scrollPosition) {
      setScrollPosition(Math.max(0, Math.min(newPosition, totalPositions - 1)));
    }
  }, [totalPositions, scrollPosition]);

  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.addEventListener('scroll', handleScroll, { passive: true });
    return () => carousel.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToPosition = (position: number) => {
    const carousel = carouselRef.current;
    if (!carousel || totalPositions <= 1) return;

    const maxScroll = carousel.scrollWidth - carousel.clientWidth;
    const targetScroll = (position / (totalPositions - 1)) * maxScroll;

    carousel.scrollTo({ left: targetScroll, behavior: 'smooth' });
  };

  return (
    <section className="themes-section">
      <div className="section-container">
        <h2 className="section-title">{data.title}</h2>

        <div className="themes-carousel-wrapper">
          <div className="themes-carousel" ref={carouselRef}>
            {data.themes.map((theme, index) => (
              <article key={index} className="theme-card">
                {theme.imageUrl && (
                  <div className="theme-image-wrapper">
                    <img
                      src={theme.imageUrl}
                      alt={theme.title}
                      className="theme-image"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="theme-content">
                  <h3 className="theme-title">{theme.title}</h3>
                  <MarkdownContent content={theme.content} className="theme-description" />
                </div>
              </article>
            ))}
          </div>

          {showPagination && (
            <div className="themes-pagination" role="tablist" aria-label="Theme navigation">
              {Array.from({ length: totalPositions }, (_, i) => (
                <button
                  key={i}
                  className={`pagination-dot${scrollPosition === i ? ' active' : ''}`}
                  onClick={() => scrollToPosition(i)}
                  aria-label={`Go to position ${i + 1} of ${totalPositions}`}
                  aria-selected={scrollPosition === i}
                  role="tab"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
