import { useEffect, useRef, useCallback } from 'react';
import { useEditorStore, type SectionType, SECTION_ORDER } from '../stores/editorStore';

interface UseScrollSyncOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  enabled?: boolean;
}

export function useScrollSync({ containerRef, enabled = true }: UseScrollSyncOptions) {
  const { activeSection, setActiveSection, isScrollLocked, setScrollLocked, scrollSource, setScrollSource, pendingScrollTo, clearPendingScroll } = useEditorStore();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sectionRefs = useRef<Map<SectionType, HTMLElement>>(new Map());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const registerSection = useCallback((section: SectionType, element: HTMLElement | null) => {
    if (element) {
      sectionRefs.current.set(section, element);
    } else {
      sectionRefs.current.delete(section);
    }
  }, []);

  const scrollToSection = useCallback((section: SectionType, source: 'preview' | 'sidebar' = 'sidebar') => {
    const element = sectionRefs.current.get(section);
    if (!element || !containerRef.current) return;

    setScrollLocked(true);
    setScrollSource(source);

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setScrollLocked(false);
      setScrollSource(null);
    }, 500);
  }, [containerRef, setScrollLocked, setScrollSource]);

  useEffect(() => {
    if (!enabled || !containerRef.current) return;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      if (isScrollLocked || scrollSource === 'sidebar') return;

      const visibleSections = entries
        .filter(entry => entry.isIntersecting)
        .map(entry => ({
          section: entry.target.getAttribute('data-section-id') as SectionType,
          ratio: entry.intersectionRatio,
          top: entry.boundingClientRect.top,
        }))
        .filter(item => item.section && SECTION_ORDER.includes(item.section));

      if (visibleSections.length === 0) return;

      visibleSections.sort((a, b) => {
        if (Math.abs(a.ratio - b.ratio) > 0.3) {
          return b.ratio - a.ratio;
        }
        return a.top - b.top;
      });

      const mostVisible = visibleSections[0];
      if (mostVisible.section !== activeSection) {
        setActiveSection(mostVisible.section);
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersection, {
      root: containerRef.current,
      rootMargin: '-10% 0px -60% 0px',
      threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
    });

    sectionRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });

    return () => {
      observerRef.current?.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, containerRef, isScrollLocked, scrollSource, activeSection, setActiveSection]);

  useEffect(() => {
    if (!observerRef.current) return;

    sectionRefs.current.forEach((element) => {
      observerRef.current?.observe(element);
    });
  }, [sectionRefs.current.size]);

  useEffect(() => {
    if (pendingScrollTo && sectionRefs.current.has(pendingScrollTo)) {
      scrollToSection(pendingScrollTo, 'sidebar');
      clearPendingScroll();
    }
  }, [pendingScrollTo, scrollToSection, clearPendingScroll]);

  return {
    registerSection,
    scrollToSection,
    sectionRefs: sectionRefs.current,
  };
}
