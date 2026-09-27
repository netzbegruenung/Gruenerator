import * as React from 'react';

import { useScreenCornerReservation, type CornerReservation } from '../hooks/use-screen-corner';
import { cn } from '../lib/cn';

// Deckt sich mit dem Default-Anker unten: 1.5rem Abstand + 3rem Höhe.
const DEFAULT_RESERVATION: CornerReservation = {
  corner: 'bottom-right',
  vertical: 'calc(4.5rem + env(safe-area-inset-bottom))',
};

export interface FabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon element rendered inside the button (sized to ~22px via CSS). */
  icon: React.ReactNode;
  /** Highlighted state, e.g. when the panel the FAB toggles is open. */
  active?: boolean;
  /** Renders a small status dot in the top-right corner (e.g. disconnected). */
  showDot?: boolean;
  /**
   * Kanten-Anmeldung, damit frei schwebende Nachbarn (Feedback-Button) ausweichen
   * statt den FAB zu verdecken. `null`, wenn `className` den Anker verschiebt und
   * die Voreinstellung damit falsch wäre.
   */
  reserve?: CornerReservation | null;
}

/**
 * Floating action button — a fixed, glass-morphism circular button anchored at
 * the bottom-right. Shared across surfaces (docs editor, boards) so the toggle
 * affordance stays consistent. Position defaults to `fixed bottom-6 right-6`;
 * override via `className` if a surface needs a different anchor.
 */
export const Fab = React.forwardRef<HTMLButtonElement, FabProps>(function Fab(
  { icon, active = false, showDot = false, reserve, className, ...props },
  ref
) {
  const reservation = reserve === undefined ? DEFAULT_RESERVATION : reserve;
  useScreenCornerReservation({
    corner: reservation?.corner ?? 'bottom-right',
    vertical: reservation?.vertical,
    horizontal: reservation?.horizontal,
    blocked: reservation?.blocked,
    active: reservation != null && (reservation.active ?? true),
  });

  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        // Offset by the home-indicator inset so the button never sits under it.
        'fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] right-6 w-12 h-12 rounded-full flex items-center justify-center',
        'bg-white/85 dark:bg-grey-900/85 backdrop-blur-xl border border-black/8 dark:border-white/10',
        'shadow-lg cursor-pointer z-[150] transition-all hover:bg-white/95 dark:hover:bg-grey-800/95',
        'hover:shadow-xl active:scale-95',
        '[&_svg]:w-[22px] [&_svg]:h-[22px] [&_svg]:text-grey-700 dark:[&_svg]:text-grey-300',
        active &&
          'bg-secondary-100 dark:bg-secondary-600/25 border-secondary-400 dark:border-secondary-600 z-[250] [&_svg]:text-secondary-700 dark:[&_svg]:text-secondary-400',
        className
      )}
      {...props}
    >
      {icon}
      {showDot && (
        <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full border-[1.5px] border-white/90 dark:border-grey-900/90 bg-red-500" />
      )}
    </button>
  );
});
