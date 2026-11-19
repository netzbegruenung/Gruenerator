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
  type SiteFontFile,
} from '@gruenerator/sites-design';
import siteCss from '@gruenerator/sites-design/site.css?inline';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { EditorInstagram } from './EditorInstagram';

const FRAME_DOC = '<!doctype html><html><head></head><body></body></html>';
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

const isBrandFont = (file: SiteFontFile): file is BrandFontFile => !file.startsWith('PTSans-');

const previewFontUrl = (file: SiteFontFile): string =>
  isBrandFont(file) ? brandFontUrl(API_BASE, file) : `/fonts/${file}`;

interface SitePreviewFrameProps {
  snapshot: PublishedSiteSnapshot;
  handle: string;
  title: string;
  className?: string;
}

export function SitePreviewFrame({ snapshot, handle, title, className }: SitePreviewFrameProps) {
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
    if (!frameDoc) return;
    for (const [name, value] of Object.entries(siteRootAttributes(snapshot))) {
      frameDoc.documentElement.setAttribute(name, value);
    }
  }, [frameDoc, snapshot]);

  useEffect(() => {
    if (!frameDoc) return;
    const stopNavigation = (event: Event) => {
      const anchor = (event.target as Element | null)?.closest?.('a[href]');
      if (anchor && !anchor.getAttribute('href')?.startsWith('#')) event.preventDefault();
    };
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
          />,
          frameDoc.body
        )}
    </>
  );
}
