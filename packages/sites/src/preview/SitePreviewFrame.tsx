import {
  brandFontUrl,
  type BrandFontFile,
  type PublishedSiteSnapshot,
} from '@gruenerator/contracts';
import {
  SiteBlockPreview,
  SiteBody,
  siteFontFaceCss,
  siteRootAttributes,
  sitePaths,
  type SiteEditSlots,
  type SiteFontFile,
} from '@gruenerator/sites-design';
import siteCss from '@gruenerator/sites-design/site.css?inline';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { EditorInstagram } from './EditorInstagram';
import { keepLinksInFrame } from './keepLinksInFrame';

const FRAME_DOC = '<!doctype html><html><head></head><body></body></html>';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

const isBrandFont = (file: SiteFontFile): file is BrandFontFile => !file.startsWith('PTSans-');

const previewFontUrl = (file: SiteFontFile): string =>
  isBrandFont(file) ? brandFontUrl(API_BASE, file) : `/fonts/${file}`;

const EDITOR_FRAME_CSS = `
[data-field] { cursor: pointer; }
[data-field]:hover { outline: 2px dashed #46962b; outline-offset: 2px; }
[data-editor-active] { outline: 2px solid #46962b; outline-offset: 2px; }
[data-block-id][data-editor-selected] { outline: 2px solid #46962b; outline-offset: -2px; }
[data-item-id][data-editor-selected] { outline: 3px solid #46962b; outline-offset: 3px; }
/* A hidden block stays on the canvas so it can be shown again: its content dimmed, the note not. */
[data-editor-hidden] { position: relative; }
[data-editor-hidden] > * { opacity: 0.4; }
[data-editor-hidden]::before {
  content: 'Ausgeblendet'; position: absolute; top: 12px; left: 12px; z-index: 30;
  padding: 4px 10px; border-radius: 999px; background: #ffffff; color: #1f1f1f;
  font: 600 14px/1.4 system-ui, sans-serif; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}
/* Where a block from the picker would land: a line under the block it follows, with its name. */
[data-editor-insert-after] { position: relative; box-shadow: inset 0 -4px 0 #46962b; }
[data-editor-insert-after]::after {
  content: attr(data-editor-insert-after); position: absolute; bottom: 12px; left: 50%; z-index: 30;
  transform: translateX(-50%); padding: 4px 12px; border-radius: 999px; background: #2e6b1f;
  color: #ffffff; font: 600 14px/1.4 system-ui, sans-serif; white-space: nowrap;
}
@media (prefers-reduced-motion: no-preference) {
  [data-field] { transition: outline-color 0.15s ease; }
}
@media (prefers-reduced-motion: reduce) {
  [data-field] { transition: none; }
}
[data-inline-edit] { outline: none; cursor: text; }
span[data-inline-edit] { display: inline-block; min-width: 1ch; white-space: pre-wrap; }
span[data-inline-edit]:empty::before { content: attr(data-placeholder); opacity: 0.55; }
[data-field]:has([data-inline-edit]:focus) { outline: 2px solid #46962b; outline-offset: 2px; }
.ProseMirror { white-space: pre-wrap; word-wrap: break-word; min-height: 1.5em; }
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder); float: left; height: 0; pointer-events: none; opacity: 0.55;
}
`;

interface SitePreviewFrameProps {
  snapshot: PublishedSiteSnapshot;
  handle: string;
  title: string;
  className?: string;
  editable?: boolean;
  /** Edits the page in place: the text fields render as editable widgets. */
  edit?: SiteEditSlots;
  onFrameDocument?: (doc: Document | null) => void;
  /** Renders only the snapshot's first block, without header and footer (block picker cards). */
  blockOnly?: boolean;
}

export function SitePreviewFrame({
  snapshot,
  handle,
  title,
  className,
  editable = false,
  edit,
  onFrameDocument,
  blockOnly = false,
}: SitePreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameDoc, setFrameDoc] = useState<Document | null>(null);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onLoad = () => setFrameDoc(frame.contentDocument);
    frame.addEventListener('load', onLoad);
    return () => frame.removeEventListener('load', onLoad);
  }, []);

  useEffect(() => {
    if (!onFrameDocument) return;
    onFrameDocument(frameDoc);
    return () => onFrameDocument(null);
  }, [frameDoc, onFrameDocument]);

  useEffect(() => {
    if (!frameDoc) return;
    for (const [name, value] of Object.entries(siteRootAttributes(snapshot))) {
      frameDoc.documentElement.setAttribute(name, value);
    }
  }, [frameDoc, snapshot]);

  useEffect(() => {
    if (!frameDoc) return;
    const stopNavigation = (event: Event) => keepLinksInFrame(frameDoc, event);
    frameDoc.addEventListener('click', stopNavigation);
    return () => frameDoc.removeEventListener('click', stopNavigation);
  }, [frameDoc]);

  const fontCss = useMemo(
    () => siteFontFaceCss(snapshot.locale, previewFontUrl),
    [snapshot.locale]
  );
  const links = useMemo(() => ({ ...sitePaths(handle || 'vorschau'), report: null }), [handle]);

  return (
    <>
      <iframe title={title} srcDoc={FRAME_DOC} ref={frameRef} className={className} />
      {frameDoc &&
        createPortal(
          <>
            <style>{siteCss}</style>
            <style>{fontCss}</style>
            {editable && <style>{EDITOR_FRAME_CSS}</style>}
          </>,
          frameDoc.head
        )}
      {frameDoc &&
        createPortal(
          blockOnly ? (
            <SiteBlockPreview snapshot={snapshot} />
          ) : (
            <SiteBody
              snapshot={snapshot}
              mode="preview"
              links={links}
              renderInstagram={(username) => <EditorInstagram username={username} />}
              edit={edit}
            />
          ),
          frameDoc.body
        )}
    </>
  );
}
