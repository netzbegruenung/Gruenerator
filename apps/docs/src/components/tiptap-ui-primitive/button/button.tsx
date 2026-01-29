import { forwardRef, Fragment, useMemo } from 'react';

// --- Tiptap UI Primitive ---
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/tiptap-ui-primitive/tooltip';

// --- Lib ---
import { cn, parseShortcutKeys } from '@/lib/tiptap-utils';

import '@/components/tiptap-ui-primitive/button/button-colors.scss';
import '@/components/tiptap-ui-primitive/button/button-group.scss';
import '@/components/tiptap-ui-primitive/button/button.scss';

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  className?: string;
  showTooltip?: boolean;
  tooltip?: React.ReactNode;
  shortcutKeys?: string;
  variant?: 'default' | 'ghost' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export const ShortcutDisplay: React.FC<{ shortcuts: string[] }> = ({ shortcuts }) => {
  if (shortcuts.length === 0) return null;

  return (
    <div>
      {shortcuts.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && <kbd>+</kbd>}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </div>
  );
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      tooltip,
      showTooltip = true,
      shortcutKeys,
      variant,
      size,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const shortcuts = useMemo<string[]>(() => parseShortcutKeys({ shortcutKeys }), [shortcutKeys]);

    if (!tooltip || !showTooltip) {
      return (
        <button
          className={cn('tiptap-button', className)}
          ref={ref}
          aria-label={ariaLabel}
          data-variant={variant}
          data-size={size}
          {...props}
        >
          {children}
        </button>
      );
    }

    return (
      <Tooltip delay={200}>
        <TooltipTrigger
          className={cn('tiptap-button', className)}
          ref={ref}
          aria-label={ariaLabel}
          data-variant={variant}
          data-size={size}
          {...props}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>
          {tooltip}
          <ShortcutDisplay shortcuts={shortcuts} />
        </TooltipContent>
      </Tooltip>
    );
  }
);

Button.displayName = 'Button';

export const ButtonGroup = forwardRef<
  HTMLDivElement,
  React.ComponentProps<'div'> & {
    orientation?: 'horizontal' | 'vertical';
  }
>(({ className, children, orientation = 'vertical', ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('tiptap-button-group', className)}
      data-orientation={orientation}
      role="group"
      {...props}
    >
      {children}
    </div>
  );
});
ButtonGroup.displayName = 'ButtonGroup';

export default Button;
