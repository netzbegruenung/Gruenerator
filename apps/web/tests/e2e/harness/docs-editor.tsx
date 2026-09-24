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

// `?layout=docs` rebuilds the touch layout of `/office/:id` (DocsEditorPage: a
// `bn-scroll-container` root, top bar, nested scroll surface) around a
// document long enough to scroll.
const docsLayout = new URLSearchParams(location.search).get('layout') === 'docs';
const initialContent = docsLayout
  ? Array.from({ length: 40 }, (_, i) => `<p>Absatz ${i + 1}: Hallo Welt aus dem Harness</p>`).join(
      ''
    )
  : '<p>Hallo Welt aus dem Harness</p>';

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

  const editor = (
    <BlockNoteEditor
      documentId="harness"
      initialContent={initialContent}
      showComments={false}
      showDictationButton={false}
    />
  );

  return (
    <DocsProvider adapter={adapter}>
      {docsLayout ? (
        <div className="bn-scroll-container" style={{ display: 'flex', flexDirection: 'column' }}>
          <header style={{ height: 56, flexShrink: 0, borderBottom: '1px solid #ddd' }} />
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>{editor}</div>
          </div>
        </div>
      ) : (
        <>
          {editor}
          <ComposerStandIn />
        </>
      )}
    </DocsProvider>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
