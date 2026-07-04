import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

const SLIDE_W = 960;
const SLIDE_H = 540;

/**
 * Fills its parent's width, enforces a 16:9 box, and scales the fixed 960×540
 * `SlideSurface` child to fit exactly. Used by the editor canvas and the
 * thumbnail rail so both render the real slide markup at any size.
 */
export function ScaledSlide({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / SLIDE_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{ aspectRatio: '16 / 9', overflow: 'hidden', position: 'relative', width: '100%' }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          visibility: scale ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
