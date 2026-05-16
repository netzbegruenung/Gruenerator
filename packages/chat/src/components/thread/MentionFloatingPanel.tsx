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
      <PopoverPrimitive.Anchor className="block h-0 w-full" />
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
          className={`mention-popover z-50 flex max-h-(--radix-popover-content-available-height) flex-col overflow-hidden rounded-xl border border-border bg-background shadow-lg ${width} ${className}`.trim()}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
