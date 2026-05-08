'use client';

import { Newspaper, Loader2 } from 'lucide-react';
import { PressemitteilungExamplesCard } from '../PressemitteilungExamplesCard';

interface PressemitteilungExamplesToolRenderProps {
  args: Record<string, unknown>;
  result?: unknown;
}

export function PressemitteilungExamplesToolRender({
  args,
  result,
}: PressemitteilungExamplesToolRenderProps) {
  const query = getString(args, 'query') ?? '';

  if (result != null) {
    return <PressemitteilungExamplesCard query={query} result={result} />;
  }

  return (
    <div className="border-section-border bg-primary/5 my-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Newspaper className="text-secondary-700 h-4 w-4 shrink-0" />
        <span className="text-foreground text-sm font-medium">Pressemitteilungen suchen</span>
        <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" />
      </div>
      {query && (
        <div className="text-foreground-muted mt-1 text-xs">
          &bdquo;{query.length > 80 ? query.slice(0, 80) + '…' : query}&ldquo;
        </div>
      )}
      <div className="text-foreground-muted mt-2 text-[11px]">
        Sucht in echten Pressemitteilungen aus den Landesverbänden als Inspiration.
      </div>
    </div>
  );
}

function getString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : null;
  }
  return null;
}
