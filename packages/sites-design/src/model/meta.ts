import { type PublishedSiteSnapshot } from '@gruenerator/contracts';

import { siteCopy } from './copy.js';

export type SiteDocumentKind = 'home' | 'impressum' | 'datenschutz';

const DESCRIPTION_MAX = 160;
const DESCRIPTION_CUT = 157;

function describe(tagline: string): string {
  if (tagline.length <= DESCRIPTION_MAX) return tagline;
  const head = tagline.slice(0, DESCRIPTION_CUT);
  const space = head.lastIndexOf(' ');
  return `${(space > 0 ? head.slice(0, space) : head).trimEnd()}…`;
}

export function siteMeta(
  snapshot: PublishedSiteSnapshot,
  document: SiteDocumentKind
): { title: string; description: string; ogLocale: 'de_DE' | 'de_AT' } {
  const copy = siteCopy(snapshot.locale);
  const name = snapshot.site_title;
  const title =
    document === 'home'
      ? `${name} – ${copy.partyShort}`
      : document === 'impressum'
        ? `${copy.impressum} – ${name}`
        : `${copy.datenschutzTitle} – ${name}`;
  const tagline = snapshot.tagline.trim();
  return {
    title,
    description: tagline === '' ? `${name} – ${copy.partyName}` : describe(tagline),
    ogLocale: snapshot.locale === 'de-AT' ? 'de_AT' : 'de_DE',
  };
}
