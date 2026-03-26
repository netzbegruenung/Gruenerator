import { useCallback, useRef } from 'react';

import { getLayoutByLayoutId } from '../layouts/index';

interface SlideCanvasProps {
  slide: {
    layout: string;
    layout_group?: string;
    content: Record<string, unknown>;
    properties?: Record<string, unknown>;
  };
  isEditMode?: boolean;
  scale?: number;
}

/**
 * Renders a single slide at 1280x720 base resolution, scaled to fit container.
 * Resolves the layout component from the registry and passes slide content as data.
 */
export function SlideCanvas({ slide, isEditMode = false, scale = 1 }: SlideCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const layout = getLayoutByLayoutId(slide.layout);

  if (!layout) {
    return (
      <div className="w-full aspect-video bg-grey-100 dark:bg-grey-800 rounded-lg flex items-center justify-center">
        <p className="text-grey-500">Layout &ldquo;{slide.layout}&rdquo; nicht gefunden</p>
      </div>
    );
  }

  const LayoutComponent = layout.component;

  return (
    <div
      ref={containerRef}
      className="slide-container"
      style={{
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        width: 1280,
        height: 720,
      }}
    >
      <LayoutComponent data={slide.content as Record<string, unknown>} />
    </div>
  );
}

/**
 * Wrapper that auto-scales the slide to fit its parent container width.
 */
export function SlideCanvasAutoScale({
  slide,
  isEditMode = false,
  className = '',
}: Omit<SlideCanvasProps, 'scale'> & { className?: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const getScale = useCallback(() => {
    if (!wrapperRef.current) return 0.5;
    const parentWidth = wrapperRef.current.clientWidth;
    return parentWidth / 1280;
  }, []);

  return (
    <div ref={wrapperRef} className={`overflow-hidden ${className}`}>
      <div style={{ aspectRatio: '16/9' }}>
        <SlideCanvas slide={slide} isEditMode={isEditMode} scale={getScale()} />
      </div>
    </div>
  );
}
