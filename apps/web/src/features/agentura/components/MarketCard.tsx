import {
  CardActionsMenu,
  DropdownMenuItem,
  InteractiveCard,
  cn,
  interactiveCardControl,
} from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { PiCopySimple, PiPencilSimple, PiStar, PiStarFill } from 'react-icons/pi';

/**
 * Die Marktkachel — eine Form für Grüneratoren, Rezepte und wiederkehrende
 * Aufgaben, damit das flache Raster als ein Raster liest.
 *
 * Grün trägt hier genau zwei Dinge: den Favoritenstern und den Rand beim
 * Überfahren. Alles andere bleibt grau — auf einer Seite, die aus nichts als
 * Kacheln besteht, färbt ein großzügiger Akzent nicht das Wichtige ein,
 * sondern alles.
 *
 * Die Gattung steht als Wort in `meta` („Agent · 5 Tools · Wissen"), nicht mehr
 * als Badge: im Raster standen drei Badges nebeneinander und sagten weniger als
 * eine Zeile Text.
 */
interface MarketCardProps {
  icon: ReactNode;
  title: string;
  /** Meta-Zeile unter dem Titel — Gattung plus, was die Kachel sonst ausmacht. */
  meta: string;
  description: string;
  onSelect: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  /** Zusätzliche Bedienelemente unter der Beschreibung (z. B. Takt-Steuerung). */
  footer?: ReactNode;
}

export function MarketCard({
  icon,
  title,
  meta,
  description,
  onSelect,
  isFavorite,
  onToggleFavorite,
  onEdit,
  onDuplicate,
  onDelete,
  footer,
}: MarketCardProps) {
  return (
    <InteractiveCard
      label={title}
      onActivate={onSelect}
      className="group flex cursor-pointer flex-col gap-sm rounded-lg border border-grey-200 bg-card p-md shadow-xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-primary hover:shadow-md dark:border-grey-700"
    >
      <div className="flex items-start gap-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-background-alt text-xl text-foreground-heading">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-xs">
            <h3 className="m-0 min-w-0 text-base font-semibold leading-tight text-foreground-heading">
              {title}
            </h3>
            {isFavorite && (
              <PiStarFill
                aria-label="Favorit"
                className="h-3.5 w-3.5 shrink-0 text-primary"
              />
            )}
          </div>
          {meta && <p className="m-0 mt-0.5 text-[13px] text-foreground-muted">{meta}</p>}
        </div>
        {/* `interactiveCardControl` hebt das Menü über die unsichtbare Klickfläche
            der Karte; ohne das liegt der Auslöser darunter und ist mit der Maus
            nicht erreichbar. `CardActionsMenu` bringt preventDefault/stopPropagation
            schon mit. */}
        <CardActionsMenu
          className={cn('-mr-2 -mt-1.5', interactiveCardControl)}
          onDelete={onDelete}
        >
          {onToggleFavorite && (
            <DropdownMenuItem onClick={onToggleFavorite}>
              {isFavorite ? <PiStarFill /> : <PiStar />}
              {isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
            </DropdownMenuItem>
          )}
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <PiPencilSimple />
              Bearbeiten
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate}>
              <PiCopySimple />
              Duplizieren
            </DropdownMenuItem>
          )}
        </CardActionsMenu>
      </div>
      {description && (
        <p className="m-0 line-clamp-2 text-sm leading-relaxed text-foreground-muted">
          {description}
        </p>
      )}
      {footer}
    </InteractiveCard>
  );
}
