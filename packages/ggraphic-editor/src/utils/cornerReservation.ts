// SPDX-License-Identifier: MPL-2.0
import type * as React from 'react';

/**
 * Seam for "this bar occupies a screen corner" reporting. The editor measures
 * its bottom bar, but who else wants to stay clear of it (floating buttons,
 * feedback widgets) is the host's business: the host registers the hook that
 * feeds its own corner registry. Unregistered, the call does nothing. A hook
 * behind a module-level register is safe as long as it is registered once
 * at start-up, before any render.
 */
export type ScreenCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface MeasuredCornerReservation {
  corner: ScreenCorner | readonly ScreenCorner[];
  axis: 'vertical' | 'horizontal';
  blocked?: boolean;
  active?: boolean;
}

export type MeasuredCornerReservationHook = (
  ref: React.RefObject<HTMLElement | null>,
  options: MeasuredCornerReservation
) => void;

let registered: MeasuredCornerReservationHook = () => {};

export function registerMeasuredCornerReservation(impl: MeasuredCornerReservationHook): void {
  registered = impl;
}

export function useMeasuredCornerReservation(
  ref: React.RefObject<HTMLElement | null>,
  options: MeasuredCornerReservation
): void {
  registered(ref, options);
}
