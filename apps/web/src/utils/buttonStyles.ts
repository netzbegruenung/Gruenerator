/**
 * Tailwind-based button style utilities.
 * Replaces the legacy button.css global stylesheet.
 *
 * Usage:
 *   import { btn } from '@/utils/buttonStyles';
 *   <button className={cn(btn.primary, 'extra-classes')}>...</button>
 */

const base =
  'inline-flex items-center justify-center gap-2 rounded-full cursor-pointer font-medium transition-all duration-200 no-underline text-sm disabled:cursor-not-allowed focus:outline-2 focus:outline-offset-2';

export const btn = {
  primary: `${base} bg-secondary-600 text-white border-none px-6 py-3 h-10 hover:not-disabled:bg-secondary-700 hover:not-disabled:-translate-y-px hover:not-disabled:shadow-lg focus:outline-secondary-600 disabled:bg-grey-300 disabled:text-grey-500`,

  secondary: `${base} bg-background text-foreground border border-grey-200 dark:border-grey-700 px-6 py-3 h-10 hover:not-disabled:bg-background-alt hover:not-disabled:-translate-y-px focus:outline-secondary-600 disabled:opacity-50`,

  danger: `${base} bg-[#D32F2F] text-white border-none px-6 py-3 h-10 hover:not-disabled:bg-[#b71c1c] hover:not-disabled:-translate-y-px hover:not-disabled:shadow-lg focus:outline-[#D32F2F] disabled:opacity-50`,

  ghost: `${base} bg-transparent text-foreground border-none px-6 py-3 h-10 hover:not-disabled:bg-background-alt focus:outline-secondary-600 disabled:opacity-50`,

  /** Size modifier — medium (48px height) */
  sizeM: 'px-8 py-4 h-12 text-base',

  /** Size modifier — small tag for explicit small size */
  sizeS: 'px-4 py-2 h-8 text-xs',
};

export const btnIcon = {
  primary: `inline-flex items-center justify-center size-12 min-w-12 min-h-12 p-0 rounded-full bg-secondary-600 text-white border-none cursor-pointer transition-all duration-200 shadow-sm hover:not-disabled:bg-secondary-700 hover:not-disabled:-translate-y-px hover:not-disabled:shadow-lg focus:outline-2 focus:outline-secondary-600 focus:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-xl [&_svg]:shrink-0`,

  secondary: `inline-flex items-center justify-center size-12 min-w-12 min-h-12 p-0 rounded-full bg-background text-foreground border border-grey-200 dark:border-grey-700 cursor-pointer transition-all duration-200 hover:not-disabled:bg-background-alt hover:not-disabled:-translate-y-px focus:outline-2 focus:outline-secondary-600 focus:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:text-xl [&_svg]:shrink-0`,

  sizeS: 'size-9 min-w-9 min-h-9 [&_svg]:text-base',
};

/** Container for a row of action buttons */
export const actionButtons = 'flex gap-md w-full mb-md';

/** Container for three-button layout with responsive wrapping */
export const actionButtonsThree = `${actionButtons} mt-md max-md:flex-wrap max-md:gap-3 [&>.button-wrapper]:flex-1 max-md:[&>.button-wrapper]:basis-full max-md:[&>.button-wrapper:nth-child(n+2)]:basis-[calc(50%-0.375rem)]`;

/** Wrapper for individual button inside action-buttons */
export const buttonWrapper = 'flex items-center flex-1';

/** Legacy copy button style */
export const copyButton =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 border-none rounded-[5px] bg-secondary-600 text-white cursor-pointer text-base no-underline transition-all duration-200 hover:bg-secondary-700';

/** Legacy download button style */
export const downloadButton =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 border-none rounded-[5px] bg-secondary-600 text-white cursor-pointer text-base no-underline transition-all duration-200 hover:bg-secondary-700';
