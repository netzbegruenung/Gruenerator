import { Component, useCallback, useRef, type ReactNode } from 'react';

import { getLayoutByLayoutId } from '../layouts/index';

/**
 * Lightweight frontend safety net for slide data normalization.
 * Primary normalization happens in the backend before DB storage.
 * This catches edge cases for older data or direct DB edits.
 */
function normalizeSlideData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(normalizeSlideData);
  const obj = data as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 1 && 'text' in obj && typeof obj.text === 'string') return obj.text;
  if ('type' in obj && obj.type === 'text' && 'value' in obj && typeof obj.value === 'string')
    return obj.value;
  for (const k of ['items', 'list', 'points']) {
    if (k in obj && Array.isArray(obj[k])) return (obj[k] as unknown[]).map(normalizeSlideData);
  }
  if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
    return keys.sort((a, b) => Number(a) - Number(b)).map((k) => normalizeSlideData(obj[k]));
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = normalizeSlideData(value);
  }
  return result;
}

class SlideErrorBoundary extends Component<
  { children: ReactNode; layout: string; slideData?: Record<string, unknown> },
  { hasError: boolean; error: Error | null }
> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error) {
    console.error(
      `[slides-render] SlideErrorBoundary caught error in layout "${this.props.layout}":`,
      {
        errorMessage: error.message,
        errorStack: error.stack,
        slideDataKeys: this.props.slideData ? Object.keys(this.props.slideData) : 'N/A',
        slideDataSample: this.props.slideData
          ? JSON.stringify(this.props.slideData).slice(0, 500)
          : 'N/A',
      }
    );
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-grey-100 dark:bg-grey-800">
          <p className="text-grey-500 text-sm">Folie konnte nicht gerendert werden</p>
        </div>
      );
    }
    return this.props.children;
  }
}

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
    console.error(
      `[slides-render] SlideCanvas: layout NOT FOUND for id "${slide.layout}", layoutGroup: "${slide.layout_group}"`,
      {
        availableContent: Object.keys(slide.content),
      }
    );
    return (
      <div className="w-full aspect-video bg-grey-100 dark:bg-grey-800 rounded-lg flex items-center justify-center">
        <p className="text-grey-500">Layout &ldquo;{slide.layout}&rdquo; nicht gefunden</p>
      </div>
    );
  }

  const LayoutComponent = layout.component;
  const normalizedContent = normalizeSlideData(slide.content) as Record<string, unknown>;

  return (
    <div
      ref={containerRef}
      className="slide-container"
      data-theme="light"
      style={
        {
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: 1280,
          height: 720,
          /* Reset CSS variables so slides always render with their own theme,
           regardless of the app's dark/light mode setting */
          '--background-color': '#ffffff',
          '--background-color-pure': '#ffffff',
          '--font-color': '#464646',
          '--font-color-h': '#464646',
          '--grey-100': '#efefef',
          '--grey-200': '#dcdcdc',
          '--grey-300': '#bdbdbd',
          '--border-color': '#e5e7eb',
          '--card-background': '#ffffff',
          colorScheme: 'light',
        } as React.CSSProperties
      }
    >
      <SlideErrorBoundary layout={slide.layout} slideData={normalizedContent}>
        <LayoutComponent data={normalizedContent} />
      </SlideErrorBoundary>
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
