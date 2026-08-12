'use client';

import * as React from 'react';

/**
 * Shared open/close logic for hover-triggered citation popovers.
 *
 * One implementation for every citation surface (inline chip, stacked list,
 * overflow indicator, numbered badge) — the delay keeps the popover from
 * flickering while the pointer crosses the gap between trigger and content,
 * and the focus/blur pair makes the same affordance reachable by keyboard.
 */
export function useHoverPopover(delay = 100) {
  const [open, setOpen] = React.useState(false);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseEnter = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), delay);
  }, [delay]);

  const handleMouseLeave = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), delay);
  }, [delay]);

  const handleFocus = React.useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  }, []);

  const handleBlur = React.useCallback(
    (e: React.FocusEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      if (containerRef.current?.contains(relatedTarget)) {
        return;
      }
      if (relatedTarget?.closest('[data-radix-popper-content-wrapper]')) {
        return;
      }
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setOpen(false), delay);
    },
    [delay]
  );

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return {
    open,
    setOpen,
    containerRef,
    handleMouseEnter,
    handleMouseLeave,
    handleFocus,
    handleBlur,
  };
}
