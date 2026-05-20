import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

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
      shadow: [
        'sm',
        'md',
        'lg',
        'xl',
        'card-subtle',
        'card-elevated',
        'card-floating',
        'card-dramatic',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
