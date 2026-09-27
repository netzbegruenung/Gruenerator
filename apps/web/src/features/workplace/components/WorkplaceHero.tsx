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
}: {
  title: ReactNode;
  /** Optional line under the heading — says what the surface is for. */
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4">
      <h1 className="mb-6 text-center font-[Raleway,PT_Sans,Arial,sans-serif] text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading [text-wrap:balance] [overflow-wrap:anywhere] max-sm:text-[21px]">
        {title}
      </h1>
      {subtitle && (
        <p className="mb-6 -mt-3 text-center text-[15px] text-grey-600 [text-wrap:balance] dark:text-grey-400 max-sm:text-sm">
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
