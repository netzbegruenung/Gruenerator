import { CardActionsMenu, InteractiveCard, cn, interactiveCardControl } from '@gruenerator/ui';
import { type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

/** Die vier Töne einer Kachel, je mit Light- und Dark-Klasse (siehe `toolTheme.ts`). */
export interface TileTone {
  tile: string;
  icon: string;
  title: string;
  desc: string;
}

interface TileCardProps {
  href: string;
  title: string;
  tone: TileTone;
  /** CSS-Variablen einer gewählten Projektfarbe (`--tile-*`). */
  style?: CSSProperties;
  /** Inhalt des runden Abzeichens oben links (Avatar, Initialen, Icon). */
  badge: ReactNode;
  /** Kleine Zeilen unter dem Titel (Mitglieder, Herkunft, Datum …). */
  meta: string[];
  description?: string | null;
  /** Einträge im „…"-Menü oben rechts; ohne Einträge und ohne `onDelete` kein Menü. */
  menu?: ReactNode;
  onDelete?: () => void;
}

/**
 * Die Kachel auf `/projekte` — dieselbe breite Karte für Projekte und Rezepte. Ganzflächig klickbar über `InteractiveCard` (ein Tabstopp, Menü
 * eigenständig bedienbar); navigiert im Router, Modifier-Klicks gehen an den
 * Browser (neuer Tab).
 */
export function TileCard({
  href,
  title,
  tone,
  style,
  badge,
  meta,
  description,
  menu,
  onDelete,
}: TileCardProps) {
  const navigate = useNavigate();
  const activate = (e: MouseEvent<HTMLElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void navigate(href);
  };

  return (
    <InteractiveCard
      href={href}
      label={title}
      onActivate={activate}
      style={style}
      className={cn(
        'flex flex-col justify-between gap-2 rounded-2xl p-4',
        'transition-shadow duration-150 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]',
        'dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.30)]',
        'min-h-[148px]',
        tone.tile
      )}
    >
      <span className="flex items-start justify-between gap-sm">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/70 dark:bg-white/10',
            tone.icon
          )}
        >
          {badge}
        </span>
        <CardActionsMenu
          onDelete={onDelete}
          // Der Auslöser trägt sonst Grau, das auf den Tönen zu schwach wird.
          className={cn(
            '-mr-2 -mt-1',
            interactiveCardControl,
            tone.desc,
            '[&_button]:text-current'
          )}
        >
          {menu}
        </CardActionsMenu>
      </span>
      <span className="min-w-0">
        <span
          className={cn(
            'block text-[15px] font-bold leading-tight line-clamp-2 sm:text-[16px]',
            tone.title
          )}
        >
          {title}
        </span>
        {meta.map((line, i) => (
          <span
            key={line}
            className={cn(
              'block truncate text-[12px] leading-snug sm:text-[13px]',
              i === 0 && 'mt-0.5',
              tone.desc
            )}
          >
            {line}
          </span>
        ))}
        {description && (
          <span className={cn('mt-1 block text-[13px] leading-snug line-clamp-2', tone.desc)}>
            {description}
          </span>
        )}
      </span>
    </InteractiveCard>
  );
}
