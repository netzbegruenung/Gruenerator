import { type SiteVariant, type SupportedLocale } from '@gruenerator/contracts';
import { sampleBlockSnapshot, type SampleBlockType } from '@gruenerator/sites-design';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { SitePreviewFrame } from '../../preview/SitePreviewFrame';

/** The page width the block renders at before it is scaled down to the card. */
const VIEWPORT = 1200;

/**
 * A block as the page shows it, with example content in the site's variant and locale, scaled
 * to the card. Rendered once the card scrolls into view; hidden from assistive tech and focus,
 * the card's button carries the name.
 */
export function BlockThumbnail({
  type,
  locale,
  variant,
}: {
  type: SampleBlockType;
  locale: SupportedLocale;
  variant: SiteVariant;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // Without IntersectionObserver (tests, very old browsers) the card renders right away.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');

  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    const resize = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    resize.observe(element);
    if (typeof IntersectionObserver === 'undefined') return () => resize.disconnect();
    const view = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true);
      view.disconnect();
    });
    view.observe(element);
    return () => {
      resize.disconnect();
      view.disconnect();
    };
  }, []);

  const snapshot = useMemo(
    () => sampleBlockSnapshot(type, locale, variant),
    [type, locale, variant]
  );

  return (
    <div
      ref={box}
      aria-hidden="true"
      inert
      className="pointer-events-none relative h-36 w-full overflow-hidden bg-white"
    >
      {visible && width > 0 && (
        <div
          style={{ width: VIEWPORT, transform: `scale(${width / VIEWPORT})` }}
          className="origin-top-left"
        >
          <SitePreviewFrame
            snapshot={snapshot}
            handle="vorschau"
            title=""
            blockOnly
            className="block h-[720px] w-full border-0"
          />
        </div>
      )}
    </div>
  );
}
