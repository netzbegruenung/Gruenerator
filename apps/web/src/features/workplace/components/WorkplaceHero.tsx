import { type ReactNode } from 'react';

/**
 * Shared hero header for the two workplace landing composers — Arbeiten
 * (`DocsPage` → `DocumentsContent`) and Wissen (`NotebookStartpage` omni). Both
 * render it inside a `PageContainer noPadTop`, so title size, wrapping and spacing
 * stay pixel-identical between the tabs instead of drifting.
 */
export function WorkplaceHero({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[860px] px-4 pb-2 pt-10 max-md:pt-4">
      <h1 className="mb-6 text-center font-[Raleway,PT_Sans,Arial,sans-serif] text-[30px] font-extrabold tracking-[-.02em] text-foreground-heading [text-wrap:balance] [overflow-wrap:anywhere] max-sm:text-[21px]">
        {title}
      </h1>
      {children}
    </div>
  );
}
