import { type ReactNode, useEffect, useState } from 'react';

const DURATION_MS = 250;

/**
 * Height/opacity collapse in plain CSS (grid-template-rows 0fr -> 1fr), so the sidebar
 * does not pull `motion/react` into the entry. Children stay unmounted while closed,
 * like `AnimatePresence` did. Under `prefers-reduced-motion` the transition is off.
 */
export function SidebarCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(open);

  useEffect(() => {
    if (open) {
      // Let the collapsed state paint once so the transition has a start value.
      const frame = requestAnimationFrame(() => {
        setMounted(true);
        setExpanded(true);
      });
      return () => cancelAnimationFrame(frame);
    }
    const timer = setTimeout(() => {
      setMounted(false);
      setExpanded(false);
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open && !mounted) return null;
  const isExpanded = open && expanded;

  return (
    <div
      className={`grid transition-[grid-template-rows,opacity] duration-250 ease-in-out motion-reduce:transition-none ${
        isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
      }`}
    >
      {children}
    </div>
  );
}
