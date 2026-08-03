import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';

const SLIDE_W = 960;
const SLIDE_H = 540;

export interface ScaledSlideProps {
  children: ReactNode;
  className?: string;
  /**
   * `width` (default) fills the parent's width and derives the height from the
   * 16:9 ratio — the thumbnail case, where the parent constrains width only.
   *
   * `contain` fits the largest 16:9 box inside the parent's width AND height and
   * centres it. The editor canvas uses this: sizing on width alone overflows
   * every short viewport (a phone in landscape, a non-maximised window) and
   * wastes the lower half of a tall one. Requires a parent with a definite
   * height.
   */
  fit?: 'width' | 'contain';
}

/**
 * Scales the fixed 960×540 `SlideSurface` child to fit its parent. Used by the
 * editor canvas and the thumbnail rail so both render the real slide markup at
 * any size.
 */
export function ScaledSlide({ children, className, fit = 'width' }: ScaledSlideProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setScale(
        fit === 'contain'
          ? Math.min(el.clientWidth / SLIDE_W, el.clientHeight / SLIDE_H)
          : el.clientWidth / SLIDE_W
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const surface = (
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
  );

  if (fit === 'contain') {
    // The measured box fills the parent; the visible slide box is sized from the
    // resulting scale so borders, rounding and shadow hug the slide itself.
    return (
      <div ref={ref} className="flex h-full min-h-0 w-full items-center justify-center">
        <div
          className={className}
          style={{
            width: SLIDE_W * scale,
            height: SLIDE_H * scale,
            overflow: 'hidden',
            position: 'relative',
            flex: 'none',
          }}
        >
          {surface}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={className}
      style={{ aspectRatio: '16 / 9', overflow: 'hidden', position: 'relative', width: '100%' }}
    >
      {surface}
    </div>
  );
}
