import { type SiteVariant, type SupportedLocale } from '@gruenerator/contracts';
import { sampleBlockSnapshot, type SampleBlockType } from '@gruenerator/sites-design';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { SitePreviewFrame } from '../../preview/SitePreviewFrame';

/** The page width the block renders at before it is scaled down to the card. */
const VIEWPORT = 1200;
/** How far beyond the scroll area a card stays mounted, so short scrolls do not flicker. */
const KEEP_ALIVE_MARGIN = '300px 0px';

/** The nearest scrolling ancestor: `rootMargin` only widens the observer's own root. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

/**
 * A block as the page shows it, with example content in the site's variant and locale, scaled
 * to the card. Mounted only while the card is near the visible part of the list; hidden from
 * assistive tech and focus, the card's button carries the name.
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
    // Live only near the visible part of the list: a card scrolled far away drops its frame
    // (the box keeps its height), so the cost stays at a screenful whatever the card count.
    const view = new IntersectionObserver(([entry]) => setVisible(entry?.isIntersecting ?? false), {
      root: scrollParent(element),
      rootMargin: KEEP_ALIVE_MARGIN,
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
