import { type KeyboardEvent, type ReactNode } from 'react';
import { PiPencilSimple, PiStar, PiStarFill, PiTrash } from 'react-icons/pi';

import { TypeBadge } from './cards';

const ICON_BTN = 'rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10';

function keyActivate(e: KeyboardEvent, onSelect: () => void) {
  if ((e.target as HTMLElement).closest('button')) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    onSelect();
  }
}

interface MarketCardProps {
  icon: ReactNode;
  title: string;
  kind: 'agent' | 'skill';
  description: string;
  onSelect: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  /** Meta line rendered below a divider (e.g. `<CapabilityTags>`). */
  footer?: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}

/**
 * Unified market card for agents and skills. Column layout: icon chip + title with
 * a type badge, a two-line description, and an optional meta footer. Mirrors the
 * Agentura design mockup; used only on the market page.
 */
export function MarketCard({
  icon,
  title,
  kind,
  description,
  onSelect,
  isFavorite,
  onToggleFavorite,
  footer,
  onEdit,
  onDelete,
}: MarketCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        onSelect();
      }}
      onKeyDown={(e) => keyActivate(e, onSelect)}
      className="group flex cursor-pointer flex-col gap-sm rounded-lg border border-grey-200 bg-card p-md shadow-xs transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-secondary-600/40 hover:shadow-md dark:border-grey-700"
    >
      <div className="flex items-start gap-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-secondary-600/10 text-2xl text-secondary-600">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-xs">
            <h3 className="m-0 text-base font-semibold leading-tight text-foreground-heading">
              {title}
            </h3>
            <TypeBadge kind={kind} />
          </div>
          <p className="m-0 mt-xs line-clamp-2 text-sm leading-relaxed text-foreground">
            {description}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {onToggleFavorite && (
            <button
              type="button"
              aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className={ICON_BTN}
            >
              {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              aria-label="Bearbeiten"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className={ICON_BTN}
            >
              <PiPencilSimple className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label="Löschen"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              onKeyDown={(e) => e.stopPropagation()}
              className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-600/10"
            >
              <PiTrash className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {footer && (
        <div className="border-t border-grey-100 pt-sm dark:border-grey-800">{footer}</div>
      )}
    </div>
  );
}
