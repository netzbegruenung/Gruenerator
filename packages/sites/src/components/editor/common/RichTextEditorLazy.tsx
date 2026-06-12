import { lazy, Suspense } from 'react';

import { type RichTextEditorProps } from './RichTextEditor';

// Tiptap + ProseMirror load in their own chunk, only when an editor mounts.
const LazyRichTextEditor = lazy(() => import('./RichTextEditor'));

export type { RichTextEditorProps };

export function RichTextEditor(props: RichTextEditorProps) {
  return (
    <Suspense
      fallback={
        <div
          className="border border-grey-300 dark:border-grey-700 rounded-md bg-background-pure animate-pulse"
          style={{ minHeight: `calc(${props.minHeight ?? '120px'} + 4rem)` }}
        />
      }
    >
      <LazyRichTextEditor {...props} />
    </Suspense>
  );
}
