'use client';

import { ShimmerText } from './ShimmerText';

const DOTS = Array.from({ length: 64 }, (_, i) => i);

/**
 * Pulsing dot grid shown inside the image frame while a generation (or the
 * browser decode of the finished image) is still running. Adapted from the
 * assistant-ui Elements "Image generation" component; the diagonal stagger
 * (row + col) makes the pulse sweep from the top-left corner. Both call sites
 * mount it only while loading, so it always animates.
 */
export function ImageGenerationDots() {
  return (
    <div className="absolute inset-0 grid grid-cols-8 place-items-center p-6" aria-hidden>
      {DOTS.map((dot) => {
        const row = Math.floor(dot / 8);
        const col = dot % 8;
        return (
          <span
            key={dot}
            className="size-1 animate-pulse rounded-full bg-foreground/20 motion-reduce:animate-none"
            style={{ animationDelay: `${(row + col) * 90}ms` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Placeholder frame rendered while the backend is still generating the image —
 * before any pixels exist. Swapped for GeneratedImageDisplay (same frame
 * language, image resolves out of a blur) once the payload arrives.
 */
export function ImageGenerationFrame() {
  return (
    <div className="mb-3 flex w-56 flex-col gap-2.5" role="status">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-border bg-background-secondary">
        <ImageGenerationDots />
      </div>
      <p className="min-w-0 truncate text-xs text-foreground-muted">
        <ShimmerText>Bild wird generiert …</ShimmerText>
      </p>
    </div>
  );
}
