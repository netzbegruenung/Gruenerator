import type { MouseEvent, ReactNode } from 'react';

import { cn } from '../lib/cn';
import { InteractiveCard, interactiveCardControl } from './interactive-card';

/**
 * Ruhige Schaufenster-Karte: oben eine 16:9-Bildfläche, darunter eine graue
 * Zeile, der Titel und zwei Zeilen Beschreibung. Alle Karten einer Reihe
 * stehen auf derselben Fläche; Farbe trägt nur die zarte Tönung der
 * Bildfläche, und die nur im Light Mode — dunkel teilen sich alle Tönungen
 * eine neutrale Fläche, sonst wirken sie trüb.
 *
 * Die Bildfläche füllt {@link ShowcaseCardImage} (Cover) oder
 * {@link ShowcaseCardIcons} (Icons, ohne Bild).
 */
export type ShowcaseTone = 'tanne' | 'klee' | 'sand';

const SURFACE: Record<ShowcaseTone, string> = {
  tanne: 'bg-primary-50 dark:bg-grey-800',
  klee: 'bg-primary-100/60 dark:bg-grey-800',
  sand: 'bg-background-sand dark:bg-grey-800',
};

/** Ghost-Icons stehen direkt auf der Tönung, in einem dunkleren Ton derselben Farbe. */
const GHOST_ICON: Record<ShowcaseTone, string> = {
  tanne: 'text-primary-600 dark:text-primary-300',
  klee: 'text-primary-700 dark:text-primary-300',
  sand: 'text-[#7d6a45] dark:text-grey-300',
};

export interface ShowcaseMediaProps {
  tone: ShowcaseTone;
  /** `compact`: a flatter 5:2 strip for lists, where 16:9 makes every card a poster. */
  size?: 'default' | 'compact';
  className?: string;
  children: ReactNode;
}

/** Die getönte 16:9-Fläche allein, z. B. für einen Seitenkopf neben dem Titel. */
export function ShowcaseMedia({ tone, size = 'default', className, children }: ShowcaseMediaProps) {
  return (
    <div
      className={cn(
        'relative flex max-w-full items-center justify-center gap-sm overflow-hidden rounded-xl',
        size === 'compact' ? 'aspect-[5/2] rounded-lg' : 'aspect-video',
        SURFACE[tone],
        className
      )}
    >
      {children}
    </div>
  );
}

export interface ShowcaseCredit {
  author: string;
  profileUrl: string;
  photoUrl: string;
  /** Wo das Foto herkommt, z. B. „Unsplash". */
  source: string;
}

export interface ShowcaseCardImageProps {
  src: string;
  srcSet?: string;
  sizes?: string;
  /** Leer lassen, wenn das Bild neben einem Titel nur schmückt. */
  alt: string;
  credit?: ShowcaseCredit | null;
  /** Über dem Seiteninhalt sofort laden, in einer Kartenreihe weiter unten lazy. */
  loading?: 'lazy' | 'eager';
  /** `high` für das Bild, das die Seite aufmacht (LCP). */
  fetchPriority?: 'high' | 'low' | 'auto';
  /** `contain` für Freisteller (Sticker), die beim Beschneiden ihre Form verlieren. */
  fit?: 'cover' | 'contain';
}

/** Die Fotonennung, klein oben rechts auf dem Bild; ihre Links bleiben über der Klickfläche bedienbar. */
function CreditPill({ credit }: { credit: ShowcaseCredit }) {
  return (
    <span
      // Above the card's click overlay (z-1), but still `absolute`:
      // `interactiveCardControl` would make it `relative` and centre it.
      className="absolute top-2 right-2 z-[2] rounded-full bg-black/45 px-[7px] py-1 text-[10.5px] leading-none text-white opacity-85 backdrop-blur-sm transition-opacity duration-150 ease-out group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none"
    >
      Foto:{' '}
      <a
        href={credit.profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-inherit no-underline hover:underline focus-visible:underline"
      >
        {credit.author}
      </a>{' '}
      /{' '}
      <a
        href={credit.photoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-inherit no-underline hover:underline focus-visible:underline"
      >
        {credit.source}
      </a>
    </span>
  );
}

/** Ein Cover über die ganze Bildfläche, die Fotonennung klein oben rechts. */
export function ShowcaseCardImage({
  src,
  srcSet,
  sizes,
  alt,
  credit,
  loading = 'lazy',
  fetchPriority,
  fit = 'cover',
}: ShowcaseCardImageProps) {
  return (
    <>
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        className={cn(
          'absolute inset-0 size-full',
          fit === 'contain' ? 'object-contain p-[8%]' : 'object-cover'
        )}
      />
      {credit && <CreditPill credit={credit} />}
    </>
  );
}

export interface ShowcaseCardPosterProps {
  title: string;
  titleFont?: string;
}

/**
 * Ein gezeichnetes Blatt mit dem Titel darauf — die Vorschau für eine Vorlage,
 * die kein eigenes Bild hat. Rein schmückend: der Titel steht unter der Fläche.
 */
export function ShowcaseCardPoster({ title, titleFont }: ShowcaseCardPosterProps) {
  return (
    <span
      aria-hidden
      className="flex aspect-[3/4] h-[78%] flex-col justify-between rounded-[6px] bg-white p-[8%] shadow-[0_6px_18px_-8px_rgba(0,0,0,0.25)] dark:bg-grey-900"
    >
      <span
        className="line-clamp-4 text-[13px] leading-tight font-semibold text-balance text-foreground-heading"
        style={titleFont ? { fontFamily: titleFont } : undefined}
      >
        {title}
      </span>
      <span className="h-1.5 w-1/3 rounded-full bg-primary-200 dark:bg-primary-700" />
    </span>
  );
}

export interface ShowcaseCardIconsProps {
  tone: ShowcaseTone;
  icons: readonly { key: string; icon: ReactNode }[];
  /** `solid`: weiße Kacheln nebeneinander; `ghost`: ein großes Icon direkt auf der Tönung. */
  variant?: 'solid' | 'ghost';
  size?: 'default' | 'compact';
}

/** Icons statt Bild — für Inhalte ohne Cover. Rein schmückend. */
export function ShowcaseCardIcons({
  tone,
  icons,
  variant = 'solid',
  size = 'default',
}: ShowcaseCardIconsProps) {
  if (variant === 'ghost') {
    const first = icons[0];
    return first ? (
      <span
        aria-hidden
        className={cn(size === 'compact' ? 'text-[30px]' : 'text-[44px]', GHOST_ICON[tone])}
      >
        {first.icon}
      </span>
    ) : null;
  }
  return (
    <>
      {icons.slice(0, 4).map(({ key, icon }) => (
        <span
          key={key}
          aria-hidden
          className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-white text-[22px] text-primary-700 dark:bg-grey-900 dark:text-primary-300"
        >
          {icon}
        </span>
      ))}
    </>
  );
}

export interface ShowcaseCardProps {
  /** Zugänglicher Name der Karte — in aller Regel der Titel. */
  label: string;
  onActivate?: () => void;
  href?: string;
  tone: ShowcaseTone;
  /** Inhalt der Bildfläche: {@link ShowcaseCardImage} oder {@link ShowcaseCardIcons}. */
  media: ReactNode;
  /** Die graue Zeile über dem Titel, z. B. „Zum Einstieg · 8 Einträge". */
  meta?: string;
  title: string;
  description?: string | null;
  /** Eigenständige Bedienelemente neben dem Titel, z. B. ein Aktionsmenü. */
  actions?: ReactNode;
  /** Die Ebene des Titels unter der Abschnittsüberschrift. */
  headingLevel?: 2 | 3 | 4;
  /** Schrift der Titelzeile; ohne Angabe die der Seite. */
  titleFont?: string;
  /** `compact` für Listen: flachere Bildfläche, kleinerer Titel, weniger Abstand. */
  size?: 'default' | 'compact';
  /** Abweichendes Seitenverhältnis der Bildfläche, z. B. `aspect-[4/3]` für Bildvorschauen. */
  mediaClassName?: string;
  className?: string;
}

export function ShowcaseCard({
  label,
  onActivate,
  href,
  tone,
  media,
  meta,
  title,
  description,
  actions,
  headingLevel = 3,
  titleFont,
  size = 'default',
  mediaClassName,
  className,
}: ShowcaseCardProps) {
  const Heading = `h${headingLevel}` as const;
  const compact = size === 'compact';
  return (
    <InteractiveCard
      label={label}
      onActivate={onActivate}
      href={href}
      className={cn(
        'group flex h-full cursor-pointer flex-col rounded-2xl border border-grey-200 bg-card p-sm transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none dark:border-grey-700',
        compact ? 'gap-sm rounded-xl p-xs' : 'gap-md',
        className
      )}
    >
      <ShowcaseMedia tone={tone} size={size} className={cn('w-full', mediaClassName)}>
        {media}
      </ShowcaseMedia>
      <div className="flex items-start gap-xs px-xs pb-xs">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {meta && <span className="text-[13px] text-foreground-muted">{meta}</span>}
          <Heading
            className={cn(
              'm-0 leading-tight font-semibold tracking-[-0.01em] text-balance text-foreground-heading',
              compact ? 'text-base' : 'text-xl'
            )}
            style={titleFont ? { fontFamily: titleFont } : undefined}
          >
            {title}
          </Heading>
          {description && (
            <p className="m-0 line-clamp-2 text-sm leading-relaxed text-foreground-muted">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className={cn('-mt-1 -mr-1 shrink-0', interactiveCardControl)}>{actions}</div>
        )}
      </div>
    </InteractiveCard>
  );
}

export interface ShowcasePhotoCardProps {
  /** Der einzige Text auf der Karte, zugleich ihr zugänglicher Name. */
  title: string;
  /** Ein dezentes Etikett oben links, z. B. „Dein Landesverband"; gehört zum zugänglichen Namen. */
  badge?: string | null;
  /** Die kleine Zeile über dem Titel, z. B. „Agents & Rezepte". */
  kicker?: string;
  /** Ein, zwei Sätze unter dem Titel; mit ihr wird der Titel größer. */
  description?: string;
  credit?: ShowcaseCredit | null;
  href: string;
  /** Für Client-Routing: `event.preventDefault()` und selbst navigieren. */
  onActivate?: (event: MouseEvent<HTMLElement>) => void;
  src: string;
  srcSet?: string;
  sizes?: string;
  loading?: 'lazy' | 'eager';
  headingLevel?: 2 | 3 | 4;
  titleFont?: string;
  className?: string;
}

/**
 * Ein Foto über die ganze Karte, unten der Titel, auf Wunsch mit Zeile darüber
 * und Beschreibung darunter. Der schwarze Verlauf trägt den weißen Text auf
 * jedem Foto über 4.5:1 — er liegt unter dem Text bei 84 % Deckung und läuft
 * erst darüber aus. In beiden Modi gleich: das Foto ist die Fläche.
 */
export function ShowcasePhotoCard({
  title,
  badge,
  kicker,
  description,
  credit,
  href,
  onActivate,
  src,
  srcSet,
  sizes,
  loading = 'lazy',
  headingLevel = 3,
  titleFont,
  className,
}: ShowcasePhotoCardProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <InteractiveCard
      label={badge ? `${title}, ${badge}` : title}
      href={href}
      onActivate={onActivate}
      className={cn(
        'group aspect-[3/4] overflow-hidden rounded-2xl bg-grey-800 transition-transform duration-150 ease-out active:scale-[0.98] motion-reduce:transition-none',
        className
      )}
    >
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt=""
        loading={loading}
        decoding="async"
        className="absolute inset-0 size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
      />
      <span
        aria-hidden
        className={cn(
          'absolute inset-0',
          description
            ? 'bg-[linear-gradient(to_top,rgba(0,0,0,0.84)_0%,rgba(0,0,0,0.6)_34%,rgba(0,0,0,0)_68%)]'
            : 'bg-[linear-gradient(to_top,rgba(0,0,0,0.82)_0%,rgba(0,0,0,0.55)_28%,rgba(0,0,0,0)_58%)]'
        )}
      />
      {badge && (
        <span
          aria-hidden
          className="absolute top-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-primary-800 backdrop-blur-sm"
        >
          {badge}
        </span>
      )}
      {credit && <CreditPill credit={credit} />}
      <div
        className={cn(
          'absolute flex flex-col gap-1.5 text-white',
          description ? 'inset-x-6 bottom-5' : 'inset-x-4 bottom-4'
        )}
      >
        {kicker && (
          <span className="text-[13px] font-bold tracking-[0.06em] uppercase">{kicker}</span>
        )}
        <Heading
          className={cn(
            // White on the heading itself: the global heading colour beats an inherited one.
            'm-0 font-bold text-balance text-white',
            description
              ? 'text-[1.75rem] leading-[1.05] tracking-[-0.02em]'
              : 'text-xl leading-[1.15] tracking-[-0.01em]'
          )}
          style={titleFont ? { fontFamily: titleFont } : undefined}
        >
          {title}
        </Heading>
        {description && (
          <p className="m-0 line-clamp-2 max-w-[30rem] text-[15px] leading-snug">{description}</p>
        )}
      </div>
    </InteractiveCard>
  );
}
