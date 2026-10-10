import { type ReactNode } from 'react';

import { cn } from '../../../utils/cn';

interface StudioPreviewStageProps {
  /** One image, or the slides of a carousel in order. */
  images: readonly string[];
  /** Alt text of a single image; carousel slides are named „Folie n von m". */
  alt: string;
  busy: boolean;
  /** What is happening while `busy`. The live region for it sits in the chat. */
  status: string | null;
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

function StatusPill({ text }: { text: string }) {
  return (
    <span
      aria-hidden="true"
      className="studio-stage-pulse pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-black/55 px-4 py-2 text-sm font-bold text-white shadow-lg backdrop-blur-sm"
    >
      {text}
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
  status,
  aspect,
  error = null,
  footer,
}: StudioPreviewStageProps) {
  const label = busy ? status : null;
  let body: ReactNode;
  if (images.length === 0) {
    body = busy ? (
      <div
        aria-hidden="true"
        className="studio-stage-skeleton relative max-w-full overflow-hidden rounded-xl shadow-lg"
        style={{ aspectRatio: aspect, height: `min(100cqh, calc(100cqw / ${aspect}), 640px)` }}
      >
        <Sheen />
        {label && <StatusPill text={label} />}
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">{status ?? ''}</p>
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
        {label && <StatusPill text={label} />}
      </div>
    );
  } else {
    body = (
      <>
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
        {label && <StatusPill text={label} />}
      </>
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
