/**
 * Dev-only harness for `docs-mobile-toolbar.spec.ts`.
 *
 * Mounts the real `BlockNoteEditor` from packages/docs without a backend or
 * Hocuspocus: no Y.Doc, a stub adapter that answers every request empty. Next
 * to it sits a textarea wired to `useMobileKeyboardOffset`, standing in for the
 * chat composer that shares the docs page — that hook used to switch the
 * on-screen keyboard to overlay mode page-wide, which hid BlockNote's toolbar.
 *
 * Served by the Vite dev server at /tests/e2e/harness/docs-editor.html. It is
 * NOT part of the production build: `vite build` only walks index.html's graph.
 */
import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import {
  BlockNoteEditor,
  DocsProvider,
  type DocsAdapter,
} from '../../../../../packages/docs/src/mobile';
import { useMobileKeyboardOffset } from '../../../../../packages/shared/src/hooks/useMobileKeyboardOffset';

import './docsEditorHarness';

const adapter: DocsAdapter = {
  fetch: () => Promise.resolve(new Response('{}', { status: 200 })),
  getApiBaseUrl: () => '',
  getHocuspocusUrl: () => '',
  getHocuspocusToken: () => Promise.resolve(null),
  getAuthHeaders: () => Promise.resolve({}),
  onUnauthorized: () => {},
  navigateToDocument: () => {},
  navigateToHome: () => {},
  getDocumentUrl: (id) => `/docs/${id}`,
};

function ComposerStandIn() {
  const ref = useRef<HTMLTextAreaElement>(null);
  useMobileKeyboardOffset(ref);
  return <textarea ref={ref} aria-label="Composer" />;
}

function Harness() {
  useEffect(() => {
    window.__docsEditorHarness = {
      selectText: (text) => {
        const root = document.querySelector('.bn-editor');
        if (!root) return false;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const index = node.textContent?.indexOf(text) ?? -1;
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + text.length);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          return true;
        }
        return false;
      },
    };
  }, []);

  return (
    <DocsProvider adapter={adapter}>
      <BlockNoteEditor
        documentId="harness"
        initialContent="<p>Hallo Welt aus dem Harness</p>"
        showComments={false}
        showDictationButton={false}
      />
      <ComposerStandIn />
    </DocsProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
