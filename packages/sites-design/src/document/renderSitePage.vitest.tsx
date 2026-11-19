import { publishedSiteSnapshotSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { fullSnapshot } from '../testing/fixtures.js';

import { renderSitePage, type RenderSitePageInput } from '../server.js';

const base = (overrides: Partial<RenderSitePageInput> = {}): RenderSitePageInput => ({
  snapshot: fullSnapshot(),
  handle: 'anna',
  document: 'home',
  origin: 'https://grsites.de',
  stylesheetHref: '/_site/site.abc.css',
  fontUrl: (f) => `/api/fonts/${f}`,
  consentScriptSrc: '/_site/consent.abc.js',
  reportEmail: 'melden@example.org',
  robots: 'noindex',
  ...overrides,
});
const page = (o?: Partial<RenderSitePageInput>) => renderSitePage(base(o)).html;

describe('renderSitePage', () => {
  it('starts with one doctype', () => expect(page().match(/<!doctype html>/gi)).toHaveLength(1));

  it('writes the head', () => {
    const out = page();
    expect(out).toContain(`<title>${fullSnapshot().site_title} – Bündnis 90/Die Grünen</title>`);
    expect(out).toContain('<link rel="canonical" href="https://grsites.de/anna"/>');
    expect(out).toContain('<meta name="robots" content="noindex, nofollow"/>');
    expect(out).toContain('property="og:url" content="https://grsites.de/anna"');
    expect(out).toContain('<link rel="stylesheet" href="/_site/site.abc.css"/>');
    expect(out).toContain('url("/api/fonts/GrueneTypeNeue-Regular.woff2") format("woff2")');
  });

  it('preloads the hero portrait with the sizes the hero renders', () => {
    const out = page();
    expect(out).toMatch(/<link[^>]+rel="preload"[^>]+as="image"[^>]+imagesrcset="[^"]*w=400/i);
    expect(out).toMatch(/<link[^>]+as="image"[^>]+imagesizes="\(min-width: 64rem\) 30rem/i);
    expect(out).toMatch(/<link[^>]+as="image"[^>]+fetchpriority="high"/i);
    const head = out.slice(0, out.indexOf('</head>'));
    expect(head).toMatch(/as="image"/);
    expect(out.slice(out.indexOf('</head>'))).not.toMatch(/rel="preload"/);
  });

  it('sets lang for Austria', () =>
    expect(page({ snapshot: fullSnapshot({ locale: 'de-AT' }) })).toContain('<html lang="de-AT"'));

  it('escapes user text', () => {
    const out = page({
      snapshot: fullSnapshot({
        site_title: '<script>alert(1)</script>',
        tagline: '"><img src=x onerror=alert(1)>',
      }),
    });
    expect(out).not.toContain('<script>alert(1)');
    expect(out).not.toContain('<img src=x');
    expect(out).toContain('&lt;script&gt;');
  });

  it('has no javascript: href anywhere', () => {
    const s = fullSnapshot();
    const evil = {
      ...s,
      social_links: { instagram: 'javascript:alert(1)' },
      sections: {
        ...s.sections,
        actions: [{ imageUrl: '', text: 'x', link: 'javascript:alert(1)' }],
      },
    };
    expect(page({ snapshot: evil })).not.toMatch(/href="\s*javascript:/i);
  });

  it('references only the consent script, and only with a feed', () => {
    expect(page().match(/<script/g)).toEqual(['<script']);
    expect(page()).toContain('<script type="module" src="/_site/consent.abc.js"></script>');
    expect(page({ snapshot: fullSnapshot({ hidden_sections: ['socialFeed'] }) })).not.toContain(
      '<script'
    );
  });

  it('a hidden feed leaves no script and no Instagram URL', () => {
    const s = fullSnapshot();
    for (const snap of [
      fullSnapshot({ hidden_sections: ['socialFeed'] }),
      {
        ...s,
        sections: {
          ...s.sections,
          socialFeed: { title: 'x', instagramUsername: 'max.muster', showFeed: false },
        },
      },
    ]) {
      const out = page({ snapshot: snap });
      expect(out).not.toContain('<script');
      expect(out).not.toContain('www.instagram.com');
    }
  });

  it('leaves out hidden sections', () =>
    expect(page({ snapshot: fullSnapshot({ hidden_sections: ['about'] }) })).not.toContain(
      'data-section="about"'
    ));

  it('renders the legal documents with their canonical URL and no script', () => {
    const out = page({ document: 'impressum' });
    expect(out).toContain('href="https://grsites.de/anna/impressum"');
    expect(out).toContain('Angaben gemäß § 5 DDG');
    expect(out).not.toContain('<script');
  });

  it('an Austrian page references only Austrian fonts', () => {
    const out = page({ snapshot: fullSnapshot({ locale: 'de-AT' }) });
    expect(out).toContain('GothamNarrow-Book.woff2');
    expect(out).not.toMatch(/PTSans|GrueneType/);
  });

  it('renders a phase-1 snapshot', () => {
    const { variant: _v, hidden_sections: _h, ...old } = fullSnapshot();
    const out = page({ snapshot: publishedSiteSnapshotSchema.parse(old) });
    expect(out).toContain('data-site-variant="dunkel"');
    expect(out).toContain('data-section="themes"');
  });

  it('links the report address with the page URL', () =>
    expect(page()).toContain(
      'href="mailto:melden@example.org?subject=Meldung%20einer%20Website&amp;body=https%3A%2F%2Fgrsites.de%2Fanna"'
    ));

  it.each(['../x', 'API', ''])('refuses the handle %j', (handle) =>
    expect(() => page({ handle })).toThrow('invalid site handle')
  );

  it.each(['grsites.de', 'https://grsites.de/', 'javascript:x'])(
    'refuses the origin %j',
    (origin) => expect(() => page({ origin })).toThrow('invalid origin')
  );

  describe('public mode hides editor placeholders', () => {
    it('renders an about block with only a title without the placeholder', () => {
      const snapshot = fullSnapshot();
      const out = page({
        snapshot: fullSnapshot({
          sections: {
            ...snapshot.sections,
            about: { title: 'Wer ich bin', content: { type: 'doc', content: [] } },
          },
        }),
      });
      expect(out).toContain('Wer ich bin');
      expect(out).not.toContain('data-empty');
      expect(out).not.toContain('Erzähl hier, wer du bist.');
    });

    it('hides a contact section whose only data is a digitless phone', () => {
      const out = page({
        snapshot: fullSnapshot({
          contact_email: '',
          contact_phone: '--',
          social_links: {},
          hidden_sections: [],
        }),
      });
      expect(out).not.toContain('data-empty');
      expect(out).not.toContain('Noch keine Kontaktangaben');
      expect(out).not.toContain('id="kontakt"');
    });

    it('drops an action tile link to a section that is not on the page', () => {
      const withContact = page();
      expect(withContact).toContain('href="#kontakt"');
      const out = page({ snapshot: fullSnapshot({ hidden_sections: ['contact'] }) });
      expect(out).not.toContain('id="kontakt"');
      expect(out).not.toContain('href="#kontakt"');
      expect(out).toContain('Kontakt aufnehmen');
    });
  });

  it('renders a focal point as a class and never as a style attribute', () => {
    const snapshot = fullSnapshot();
    snapshot.sections.profileImageFocus = { x: 25, y: 75 };
    snapshot.sections.heroImage!.imageFocus = { x: 100, y: 0 };
    snapshot.sections.themes![0]!.imageFocus = { x: 0, y: 50 };
    const out = page({ snapshot });
    expect(out).toMatch(/<img[^>]+class="[^"]*site-focus-25-75/);
    expect(out).toMatch(/<img[^>]+class="[^"]*site-focus-100-0/);
    expect(out).toMatch(/<img[^>]+class="[^"]*site-focus-0-50/);
    expect(out).not.toMatch(/<[a-z][^>]*\sstyle=/i);
    expect(page()).not.toContain('site-focus-');
  });
});
