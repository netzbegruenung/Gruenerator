import {
  buildSiteSnapshot,
  siteDraftFromSite,
  siteDraftToSnapshotSource,
  type SupportedLocale,
  type WebsiteContent,
} from '@gruenerator/contracts';
import { renderSitePage } from '@gruenerator/sites-design/server';
import { describe, expect, it } from 'vitest';

import { transformAiResponse } from './transform';

/**
 * The page the AI builder makes must stay exactly what it was before the block refactor. The
 * golden files were written on the old section model; a diff here is a regression in the
 * refactor, never a reason to rewrite them. Editor addressing attributes are stripped, because
 * they change form by design and the public page never reads them.
 */

const IMAGE = '/api/share/abc123/preview';

const FIXTURE: WebsiteContent = {
  hero: { heading: 'Anna Beispiel', text: 'Für ein grünes Musterstadt' },
  about: {
    title: 'Wer ich bin',
    content: 'Ich lebe seit zwanzig Jahren in Musterstadt.\n\nIch kandidiere für den Stadtrat.',
  },
  hero_image: {
    title: 'Gemeinsam für Musterstadt',
    subtitle: 'Am 8. März wählen',
    imageUrl: IMAGE,
  },
  themes: [
    { title: 'Klimaschutz', content: 'Solar auf jedes Dach.', imageUrl: IMAGE },
    { title: 'Mobilität', content: 'Busse alle zehn Minuten.', imageUrl: IMAGE },
    { title: 'Bildung', content: 'Sanierte Schulen.', imageUrl: '' },
  ],
  actions: [
    { text: 'Mitglied werden', link: 'https://www.gruene.de/mitglied-werden', imageUrl: IMAGE },
    { text: 'Spenden', link: 'https://example.org/spenden', imageUrl: IMAGE },
    { text: 'Termine', link: 'https://example.org/termine', imageUrl: '' },
  ],
  contact: { title: 'Kontakt', email: 'anna@example.org', backgroundImageUrl: IMAGE },
};

const LEGAL = {
  name: 'Anna Beispiel',
  street: 'Musterstraße 1',
  postal_code: '10115',
  city: 'Berlin',
  email: 'anna@example.org',
};

function sequentialIds() {
  let n = 0;
  return () => `id-${(n += 1)}`;
}

const EDITOR_ATTRIBUTES = /\sdata-(field|section|index|block-id|block-type|item-id)="[^"]*"/g;
const normaliseHtml = (html: string) => html.replace(EDITOR_ATTRIBUTES, '');

function generatedPage(locale: SupportedLocale): string {
  const generated = transformAiResponse(FIXTURE);
  const source = {
    site_title: generated.site_title,
    tagline: generated.tagline,
    contact_email: generated.contact_email,
    contact_phone: '',
    profile_image: IMAGE,
    social_links: {},
    theme: null,
    sections: generated.sections,
    legal: LEGAL,
  };
  const draft = siteDraftFromSite(source, sequentialIds());
  const built = buildSiteSnapshot(siteDraftToSnapshotSource(draft, LEGAL), locale);
  if (!built.ok) throw new Error(JSON.stringify(built.issues));
  return renderSitePage({
    snapshot: built.snapshot,
    handle: 'anna',
    document: 'home',
    origin: 'https://grsites.de',
    stylesheetHref: '/_site/site.css',
    fontUrl: (file) => `/api/fonts/${file}`,
    consentScriptSrc: '/_site/consent.js',
    reportEmail: 'melden@example.org',
    robots: 'noindex',
  }).html;
}

describe('generated page', () => {
  for (const locale of ['de-DE', 'de-AT'] as const) {
    it(`renders the same page as before the block refactor (${locale})`, async () => {
      await expect(normaliseHtml(generatedPage(locale))).toMatchFileSnapshot(
        `__golden__/generated-${locale}.html`
      );
    });
  }
});
