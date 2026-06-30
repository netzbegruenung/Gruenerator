import { decode as decodeBlurhash } from 'blurhash';
import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../lib/cn';

/** A `<source>` for the responsive `<picture>` (e.g. AVIF then WebP). */
export interface PreviewImageSource {
  srcSet: string;
  type: string;
  sizes?: string;
}

export interface PreviewImageProps {
  /** Fallback `<img>` src (a mid-width URL the browser always understands). */
  src: string;
  /** Legacy WebP-only fallback path (kept for back-compat callers). */
  fallbackSrc?: string;
  alt: string;
  /** Responsive sources rendered as `<source>` elements, most-preferred first. */
  sources?: PreviewImageSource[];
  /** BlurHash string painted as an instant placeholder behind the image. */
  blurhash?: string;
  /** Above-the-fold tiles: eager + high fetch priority (default lazy/low). */
  priority?: boolean;
  /** Background-image placeholder URL (legacy alternative to `blurhash`). */
  placeholder?: string;
  className?: string;
  width?: number;
  height?: number;
  sizes?: string;
}

const BLURHASH_SIZE = 32;

function BlurhashCanvas({ hash, className }: { hash: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    try {
      const pixels = decodeBlurhash(hash, BLURHASH_SIZE, BLURHASH_SIZE);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const imageData = ctx.createImageData(BLURHASH_SIZE, BLURHASH_SIZE);
      imageData.data.set(pixels);
      ctx.putImageData(imageData, 0, 0);
    } catch {
      // Invalid hash — leave the canvas blank (the bg colour shows through).
    }
  }, [hash]);
  return (
    <canvas
      ref={ref}
      width={BLURHASH_SIZE}
      height={BLURHASH_SIZE}
      aria-hidden="true"
      className={cn('absolute inset-0 h-full w-full object-cover', className)}
    />
  );
}

export function PreviewImage({
  src,
  fallbackSrc,
  alt,
  sources,
  blurhash,
  priority,
  placeholder,
  className,
  width,
  height,
  sizes,
}: PreviewImageProps) {
  const [loaded, setLoaded] = useState(false);
  const isWebp = useMemo(() => src.endsWith('.webp'), [src]);

  const imgClass = cn(
    'block h-full w-full object-cover transition-opacity duration-300',
    loaded ? 'opacity-100' : 'opacity-0'
  );

  const img = (
    <img
      src={fallbackSrc && isWebp && !sources ? fallbackSrc : src}
      alt={alt}
      className={cn(!sources && imgClass, className)}
      loading={priority ? 'eager' : 'lazy'}
      // @ts-expect-error fetchpriority is a valid DOM attribute not yet in React's types
      fetchpriority={priority ? 'high' : 'low'}
      decoding="async"
      width={width}
      height={height}
      sizes={sizes}
      onLoad={() => setLoaded(true)}
    />
  );

  // Build the responsive picture: explicit `sources` win; otherwise honour the
  // legacy single-WebP-source path so existing callers are unchanged.
  const picture =
    sources && sources.length > 0 ? (
      <picture className={imgClass}>
        {sources.map((s) => (
          <source key={s.type} srcSet={s.srcSet} type={s.type} sizes={s.sizes ?? sizes} />
        ))}
        {img}
      </picture>
    ) : isWebp && fallbackSrc ? (
      <picture className={imgClass}>
        <source srcSet={src} type="image/webp" />
        {img}
      </picture>
    ) : (
      img
    );

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={
        placeholder
          ? {
              backgroundImage: `url(${placeholder})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {blurhash && !loaded && <BlurhashCanvas hash={blurhash} />}
      {picture}
    </div>
  );
}
