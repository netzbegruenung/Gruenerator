import { type SiteEditSlots } from '@gruenerator/sites-design';
import { lazy, Suspense, useMemo } from 'react';

import { useDraft, useSiteYdoc } from '../draft/SiteDraftContext';

import { richTextBinding } from './fieldBindings';
import { InlineText } from './InlineText';

// Tiptap + ProseMirror load in their own chunk, only when the page is edited.
const InlineRichTextEditor = lazy(() => import('./InlineRichTextEditor'));

function InlineRichText({ path, placeholder }: { path: string; placeholder: string }) {
  const binding = useMemo(() => richTextBinding(path), [path]);
  const ydoc = useSiteYdoc();
  const fragment = useDraft((d) => binding?.fragment(ydoc, d) ?? null);
  if (!binding || !fragment) return null;
  return (
    <Suspense fallback={null}>
      <InlineRichTextEditor
        fragment={fragment}
        placeholder={placeholder}
        maxLength={binding.maxLength}
      />
    </Suspense>
  );
}

/** The editor's widgets for `SiteBody`: every text field of the page becomes editable in place. */
export const SITE_EDIT_SLOTS: SiteEditSlots = {
  text: (field, placeholder) => <InlineText path={field} placeholder={placeholder} />,
  richText: (field, placeholder) => <InlineRichText path={field} placeholder={placeholder} />,
};
