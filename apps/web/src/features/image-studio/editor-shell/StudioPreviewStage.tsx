import { type ReactNode } from 'react';

import { cn } from '../../../utils/cn';

interface StudioPreviewStageProps {
  /** One image, or the slides of a carousel in order. */
  images: readonly string[];
  /** Alt text of a single image; carousel slides are named „Folie n von m". */
  alt: string;
  /** Working on it. What is happening is said in the chat, not here. */
  busy: boolean;
  /** Width / height of what is coming, for the waiting card. */
  aspect: number;
  error?: string | null;
  /** Under the image, e.g. the versions. */
  footer?: ReactNode;
}

/** The light that runs over an image while it is being reworked. */
function Sheen() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <span className="studio-stage-sheen absolute inset-y-0 left-0 w-[45%]" />
    </span>
  );
}

/**
 * The preview side of a studio editor. Nothing yet: a breathing card in the shape of what is
 * coming. Reworking: the current image stays, dimmed, with a sheen running over it. Done: the
 * new image fades in.
 */
export function StudioPreviewStage({
  images,
  alt,
  busy,
  aspect,
  error = null,
  footer,
}: StudioPreviewStageProps) {
  let body: ReactNode = null;
  if (images.length === 0) {
    if (busy)
      body = (
        <div
          aria-hidden="true"
          className="studio-stage-skeleton relative max-w-full overflow-hidden rounded-xl shadow-lg"
          style={{ aspectRatio: aspect, height: `min(100cqh, calc(100cqw / ${aspect}), 640px)` }}
        >
          <Sheen />
        </div>
      );
  } else if (images.length === 1) {
    body = (
      <div className="relative w-fit overflow-hidden rounded-xl shadow-lg">
        <img
          key={images[0]}
          src={images[0]}
          alt={alt}
          className={cn(
            'studio-stage-reveal block max-h-[100cqh] max-w-[100cqw] object-contain transition-opacity',
            busy && 'opacity-60'
          )}
        />
        {busy && <Sheen />}
      </div>
    );
  } else {
    body = (
      <ol
        aria-label="Folien des Karussells"
        className="flex h-full max-h-[720px] w-full snap-x snap-mandatory items-center gap-md overflow-x-auto px-md"
      >
        {images.map((src, i) => (
          <li
            // eslint-disable-next-line react/no-array-index-key -- slides have no id; order is the identity
            key={i}
            className="relative h-full max-h-full shrink-0 snap-center overflow-hidden rounded-xl shadow-lg max-md:h-auto max-md:w-[85%]"
          >
            <img
              key={src}
              src={src}
              alt={`Folie ${i + 1} von ${images.length}`}
              className={cn(
                'studio-stage-reveal h-full w-auto transition-opacity max-md:h-auto max-md:w-full',
                busy && 'opacity-60'
              )}
            />
            {busy && <Sheen />}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <>
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center [container-type:size]">
        {body}
      </div>
      {footer}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </>
  );
}
