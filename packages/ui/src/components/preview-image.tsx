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

// Variant endpoints (e.g. /share/<token>/preview) generate lazily on first
// request and can momentarily 202/404 before the image exists, yet their
// successful responses are cached `immutable`. So a retry must cache-bust, and
// the buster has to reach every URL in a srcSet, not just the fallback src.
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [500, 1500, 3500];

function withCacheBust(url: string, attempt: number): string {
  if (attempt <= 0) return url;
  return `${url}${url.includes('?') ? '&' : '?'}_r=${attempt}`;
}

function bustSrcSet(srcSet: string, attempt: number): string {
  if (attempt <= 0) return srcSet;
  return srcSet
    .split(',')
    .map((entry) => {
      const [url, ...descriptor] = entry.trim().split(/\s+/);
      return [withCacheBust(url ?? '', attempt), ...descriptor].join(' ');
    })
    .join(', ');
}

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
  const [retry, setRetry] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isWebp = useMemo(() => src.endsWith('.webp'), [src]);

  // A changed src is a new image: drop the loaded/retry state so it fades in
  // fresh and gets its own retry budget.
  useEffect(() => {
    setLoaded(false);
    setRetry(0);
  }, [src]);

  useEffect(() => () => clearTimeout(retryTimer.current ?? undefined), []);

  const handleError = () => {
    if (retry >= MAX_RETRIES) return;
    clearTimeout(retryTimer.current ?? undefined);
    retryTimer.current = setTimeout(
      () => setRetry((n) => n + 1),
      RETRY_DELAYS_MS[retry] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
    );
  };

  const imgClass = cn(
    'block h-full w-full object-cover transition-opacity duration-300',
    loaded ? 'opacity-100' : 'opacity-0'
  );

  const baseSrc = fallbackSrc && isWebp && !sources ? fallbackSrc : src;

  const img = (
    <img
      src={withCacheBust(baseSrc, retry)}
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
      onError={handleError}
    />
  );

  // Build the responsive picture: explicit `sources` win; otherwise honour the
  // legacy single-WebP-source path so existing callers are unchanged.
  const picture =
    sources && sources.length > 0 ? (
      <picture className={imgClass}>
        {sources.map((s) => (
          <source
            key={s.type}
            srcSet={bustSrcSet(s.srcSet, retry)}
            type={s.type}
            sizes={s.sizes ?? sizes}
          />
        ))}
        {img}
      </picture>
    ) : isWebp && fallbackSrc ? (
      <picture className={imgClass}>
        <source srcSet={withCacheBust(src, retry)} type="image/webp" />
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
