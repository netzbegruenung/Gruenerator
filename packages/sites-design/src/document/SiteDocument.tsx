import { type PublishedSiteSnapshot } from '@gruenerator/contracts';

import { siteFontFaceCss, siteFontPreloads, type SiteFontFile } from '../model/fonts.js';
import { siteImageAttrs } from '../model/images.js';
import { type SiteDocumentKind, siteMeta } from '../model/meta.js';
import { type SiteLinks } from '../model/paths.js';
import { siteRootAttributes } from '../model/root.js';
import { SiteBody } from '../site/SiteBody.js';
import { SiteLegalBody } from '../site/SiteLegalBody.js';

export interface SiteDocumentProps {
  snapshot: PublishedSiteSnapshot;
  document: SiteDocumentKind;
  canonical: string;
  origin: string;
  links: SiteLinks;
  stylesheetHref: string;
  fontUrl: (file: SiteFontFile) => string;
  consentScriptSrc: string | null;
  robots: 'index' | 'noindex';
}

export function SiteDocument({
  snapshot,
  document,
  canonical,
  origin,
  links,
  stylesheetHref,
  fontUrl,
  consentScriptSrc,
  robots,
}: SiteDocumentProps) {
  const meta = siteMeta(snapshot, document);
  const portrait = siteImageAttrs(snapshot.profile_image, 'portrait');
  const image = snapshot.profile_image === '' ? null : `${origin}${snapshot.profile_image}`;

  return (
    <html {...siteRootAttributes(snapshot)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <meta
          name="robots"
          content={robots === 'noindex' ? 'noindex, nofollow' : 'index, follow'}
        />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={meta.title} />
        <meta property="og:description" content={meta.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:locale" content={meta.ogLocale} />
        {image && <meta property="og:image" content={image} />}
        <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
        {siteFontPreloads(snapshot.locale).map((file) => (
          <link
            key={file}
            rel="preload"
            as="font"
            type="font/woff2"
            href={fontUrl(file)}
            crossOrigin="anonymous"
          />
        ))}
        {document === 'home' && portrait && (
          <link
            rel="preload"
            as="image"
            href={portrait.src}
            {...(portrait.srcSet
              ? { imageSrcSet: portrait.srcSet, imageSizes: portrait.sizes }
              : {})}
            fetchPriority="high"
          />
        )}
        <link rel="stylesheet" href={stylesheetHref} />
        <style dangerouslySetInnerHTML={{ __html: siteFontFaceCss(snapshot.locale, fontUrl) }} />
      </head>
      <body>
        {document === 'home' ? (
          <SiteBody snapshot={snapshot} links={links} mode="public" />
        ) : (
          <SiteLegalBody snapshot={snapshot} links={links} document={document} />
        )}
        {consentScriptSrc && <script type="module" src={consentScriptSrc} />}
      </body>
    </html>
  );
}
