import { cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';

/**
 * Shared hero header for the two workplace landing composers — Arbeiten
 * (`DocsPage` → `DocumentsContent`) and Wissen (`NotebookStartpage` omni). Both
 * render it inside a `PageContainer noPadTop`, so title size, wrapping and spacing
 * stay pixel-identical between the tabs instead of drifting.
 */
export function WorkplaceHero({
  title,
  subtitle,
  children,
  textHiddenOnPhone = false,
}: {
  title: ReactNode;
  /** Optional line under the heading — says what the surface is for. */
  subtitle?: ReactNode;
  children?: ReactNode;
  /** Phones start straight with the content (the tab bar names the page); the h1 stays for screen readers. */
  textHiddenOnPhone?: boolean;
}) {
  return (
    // Left-aligned on the same edge as the sections below: one reading axis, not a
    // centred block over a left-aligned page. Search ends 40 px above the first
    // section, the same rhythm as between sections.
    <div className={cn('pb-4 sm:pt-4', textHiddenOnPhone && 'max-md:pb-0')}>
      <h1
        className={cn(
          'm-0 font-[Raleway,PT_Sans,Arial,sans-serif] text-[26px] font-bold leading-[1.15] tracking-[-.02em] text-foreground-heading [text-wrap:balance] [overflow-wrap:anywhere] sm:text-[32px] lg:text-[36px]',
          textHiddenOnPhone && 'max-md:sr-only'
        )}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          className={cn(
            'm-0 mt-2 text-base text-grey-600 [text-wrap:pretty] dark:text-grey-400',
            textHiddenOnPhone && 'max-md:hidden'
          )}
        >
          {subtitle}
        </p>
      )}
      {/* The composer brings its own centring margins (mt-10 mx-auto); here it sits under the text. */}
      {children != null && (
        <div
          className={cn(
            'mt-5 max-w-[640px] sm:mt-6 [&>*]:mx-0 [&>*]:mt-0',
            textHiddenOnPhone && 'max-md:mt-0'
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
