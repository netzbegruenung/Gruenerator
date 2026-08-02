import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Ganzflächig klickbare Karte mit genau **einem** Tabstopp.
 *
 * Das naheliegende `<div role="button" tabIndex={0}>` verletzt WCAG 4.1.2:
 * der Container meldet sich als eine Schaltfläche, seine fokussierbaren Kinder
 * (Menü, Favorit) sind trotzdem einzeln anfahrbar — axe meldet das als
 * `nested-interactive`. Das `role` einfach zu entfernen macht die Karte per
 * Tastatur unerreichbar.
 *
 * Hier liegt stattdessen ein echtes Bedienelement als unsichtbare Fläche über
 * der Karte (*stretched link*). Kind-Bedienelemente liegen mit
 * {@link interactiveCardControl} eine Ebene darüber und bleiben eigenständig
 * bedienbar.
 */
type InteractiveCardProps = {
  /** Zugänglicher Name des Bedienelements — in aller Regel der Kartentitel. */
  label: string;
  onActivate?: (event: React.MouseEvent<HTMLElement>) => void;
  /** Gesetzt, wenn die Karte navigiert: erzeugt einen echten Link statt einer Schaltfläche. */
  href?: string;
  disabled?: boolean;
  /** Für Auswahlmodi — landet als `aria-pressed` auf dem Bedienelement. */
  pressed?: boolean;
  className?: string;
  children?: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick' | 'children' | 'className'>;

/**
 * Auf jedes Kind-Bedienelement einer {@link InteractiveCard} setzen, sonst
 * liegt es unter der Klickfläche und ist mit der Maus nicht erreichbar.
 */
export const interactiveCardControl = 'relative z-[2]';

export const InteractiveCard = React.forwardRef<HTMLDivElement, InteractiveCardProps>(
  function InteractiveCard(
    { label, onActivate, href, disabled, pressed, className, children, ...rest },
    ref
  ) {
    const overlay = cn(
      'absolute inset-0 z-[1] rounded-[inherit] outline-none',
      disabled && 'pointer-events-none'
    );

    return (
      <div
        ref={ref}
        className={cn(
          'relative',
          'has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-400',
          className
        )}
        {...rest}
      >
        {href ? (
          <a
            href={href}
            aria-label={label}
            aria-disabled={disabled || undefined}
            className={overlay}
            onClick={onActivate}
          >
            <span className="sr-only">{label}</span>
          </a>
        ) : (
          <button
            type="button"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            className={overlay}
            onClick={onActivate}
          >
            <span className="sr-only">{label}</span>
          </button>
        )}
        {children}
      </div>
    );
  }
);
