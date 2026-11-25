'use client';

import { Popover as PopoverPrimitive } from 'radix-ui';
import { type ReactNode } from 'react';

interface MentionFloatingPanelProps {
  open: boolean;
  onDismiss?: () => void;
  width?: string;
  className?: string;
  role?: 'listbox' | 'dialog';
  ariaLabel?: string;
  children: ReactNode;
}

export function MentionFloatingPanel({
  open,
  onDismiss,
  width = 'w-72',
  className = '',
  role,
  ariaLabel,
  children,
}: MentionFloatingPanelProps) {
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss?.();
      }}
      modal={false}
    >
      {/* The anchor covers the whole composer (`.composer-root` is `relative`), so
          a flip from `top` to `bottom` lands below the composer instead of over
          the line being typed. A zero-height anchor at the top of the input made
          the start page (composer high on screen, no room above) cover it. */}
      <PopoverPrimitive.Anchor className="pointer-events-none absolute inset-0" />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          avoidCollisions
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => {
            const target = e.target as Element | null;
            if (target?.closest('.composer-root')) e.preventDefault();
          }}
          role={role}
          aria-label={ariaLabel}
          className={`mention-popover z-[1020] flex max-h-[min(22rem,var(--radix-popover-content-available-height))] max-w-(--radix-popover-content-available-width) flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg ${width} ${className}`.trim()}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
