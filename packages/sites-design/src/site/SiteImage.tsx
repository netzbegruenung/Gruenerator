import { type SiteImageSlot, siteImageAttrs } from '../model/images.js';

export function SiteImage({
  url,
  slot,
  field,
  className = '',
}: {
  url: string;
  slot: SiteImageSlot;
  field: string;
  className?: string;
}) {
  const attrs = siteImageAttrs(url, slot);
  if (!attrs) return null;
  return (
    <div data-field={field} className={`site:overflow-hidden ${className}`}>
      {/* <picture className="site:contents"> keeps React from hoisting its own preload <link> into the body markup. */}
      <picture>
        <img
          src={attrs.src}
          {...(attrs.srcSet ? { srcSet: attrs.srcSet, sizes: attrs.sizes } : {})}
          width={attrs.width}
          height={attrs.height}
          loading={attrs.loading}
          fetchPriority={attrs.fetchPriority}
          decoding="async"
          alt=""
          className="site:block site:size-full site:object-cover"
        />
      </picture>
    </div>
  );
}
