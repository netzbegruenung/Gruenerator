import {
  type PublishedSiteSnapshot,
  type SiteVariant,
  type SupportedLocale,
} from '@gruenerator/contracts';

export function siteRootAttributes(snapshot: PublishedSiteSnapshot): {
  lang: SupportedLocale;
  'data-site-locale': SupportedLocale;
  'data-site-variant': SiteVariant;
} {
  return {
    lang: snapshot.locale,
    'data-site-locale': snapshot.locale,
    'data-site-variant': snapshot.variant,
  };
}
