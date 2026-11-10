/**
 * The Seiten the page picker suggests: a grid of the catalogue's single pages
 * that fit the design, picked with one click. Which ones and what a pick does
 * decides the picker (`pageSuggestions.ts`); this only draws them.
 */
import { cn } from '@ggraphic/editor/internal/utils/cn';
import { sharepicSeiteThumbPath } from '@gruenerator/contracts';

import { templateCardBase } from './TemplatePickerFlyout';

import type { SharepicFormat, SharepicSeite } from '@gruenerator/contracts';

interface PagePickerSeitenProps {
  heading: string;
  /** Null while the catalogue loads. */
  seiten: readonly SharepicSeite[] | null;
  format: SharepicFormat;
  /** The Seite being placed, if any; every tile waits meanwhile. */
  busyId: string | null;
  /** While anything in the picker runs. */
  disabled: boolean;
  /** The accessible name of a tile's button. */
  pickLabel: (titel: string) => string;
  onPick: (seite: SharepicSeite) => void;
}

const PLACEHOLDERS = 4;

export function PagePickerSeiten({
  heading,
  seiten,
  format,
  busyId,
  disabled,
  pickLabel,
  onPick,
}: PagePickerSeitenProps) {
  const aspect = format === 'post-portrait-tall' ? 'aspect-[3/4]' : 'aspect-[4/5]';
  return (
    <section aria-label={heading} aria-busy={seiten === null} className="mb-3">
      <h4 className="m-0 mb-2 text-[13px] font-semibold text-foreground">{heading}</h4>
      <ul className="m-0 grid list-none grid-cols-4 gap-1.5 p-0 max-[480px]:grid-cols-3 max-[480px]:gap-2">
        {seiten === null
          ? Array.from({ length: PLACEHOLDERS }, (_, i) => (
              <li key={i} aria-hidden="true">
                <span
                  className={cn('block w-full animate-pulse rounded bg-background-alt', aspect)}
                />
              </li>
            ))
          : seiten.map((seite) => (
              <li key={seite.id}>
                <button
                  type="button"
                  className={cn(
                    templateCardBase,
                    'w-full disabled:cursor-wait disabled:opacity-60'
                  )}
                  aria-label={pickLabel(seite.titel)}
                  aria-busy={busyId === seite.id}
                  disabled={disabled}
                  onClick={() => onPick(seite)}
                >
                  <span
                    className={cn('relative mb-1 block w-full overflow-hidden rounded', aspect)}
                  >
                    <img
                      src={sharepicSeiteThumbPath(seite.id, format, seite.thumbVersion)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    {busyId === seite.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="size-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      </span>
                    )}
                  </span>
                  <span className="line-clamp-1 text-center text-[10px] font-medium leading-tight text-foreground">
                    {seite.titel}
                  </span>
                </button>
              </li>
            ))}
      </ul>
    </section>
  );
}
