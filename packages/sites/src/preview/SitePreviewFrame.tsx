import {
  brandFontUrl,
  type BrandFontFile,
  type PublishedSiteSnapshot,
} from '@gruenerator/contracts';
import {
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
}

export function SitePreviewFrame({
  snapshot,
  handle,
  title,
  className,
  editable = false,
  edit,
  onFrameDocument,
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
          <SiteBody
            snapshot={snapshot}
            mode="preview"
            links={links}
            renderInstagram={(username) => <EditorInstagram username={username} />}
            edit={edit}
          />,
          frameDoc.body
        )}
    </>
  );
}
