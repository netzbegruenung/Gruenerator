import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Extended tailwind-merge configuration for custom theme tokens.
 * This ensures proper class deduplication for our custom spacing, colors, and sizing.
 *
 * Theme keys must match tailwind-merge's DefaultThemeGroupIds:
 * color, spacing, radius, shadow, text, font-weight, etc.
 */
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['xs', 'sm', 'base', 'lg', 'xl', '2xl'] }],
    },
    theme: {
      spacing: [
        'xxs',
        'xs',
        'sm',
        'md',
        'lg',
        'xl',
        '2xl',
        'header',
        'titlebar',
        'sidebar-collapsed',
        'sidebar-expanded',
      ],
      color: [
        'primary',
        'secondary',
        'grey',
        'neutral',
        'background',
        'background-pure',
        'background-alt',
        'background-sand',
        'foreground',
        'foreground-heading',
        'link',
        'error',
        'accent',
        'disabled',
        'button-bg',
        'button-text',
        'button-hover',
        'input-bg',
        'input-text',
        'input-placeholder',
        'text-green',
        'overlay-sm',
        'overlay-md',
        'overlay-lg',
        'hover-alt',
      ],
      radius: ['sm', 'md', 'lg'],
      shadow: ['sm', 'md', 'lg', 'xl', 'card-subtle', 'card-elevated', 'card-floating', 'card-dramatic'],
    },
  },
});

/**
 * Utility function to merge Tailwind CSS classes with proper precedence.
 * Combines clsx for conditional classes with tailwind-merge for deduplication.
 *
 * @example
 * cn('px-4 py-2', isActive && 'bg-primary-500', className)
 * cn('text-sm', { 'font-bold': isBold, 'text-red-500': hasError })
 * cn('p-md', isLarge && 'p-lg') // p-lg correctly overrides p-md
 */
export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
