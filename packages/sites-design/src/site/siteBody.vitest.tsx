import { type PublishedSiteSnapshot, SITE_SECTION_IDS } from '@gruenerator/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type SiteLinks, sitePaths } from '../model/paths.js';
import { type SiteRenderMode } from '../model/visibility.js';
import { fullSnapshot, maxSnapshot, minimalSnapshot } from '../testing/fixtures.js';

import { SiteBody } from './SiteBody.js';
import { SiteLegalBody } from './SiteLegalBody.js';

const links: SiteLinks = { ...sitePaths('anna'), report: 'mailto:melden@example.org' };
const html = (s: PublishedSiteSnapshot, mode: SiteRenderMode = 'public') =>
  renderToStaticMarkup(<SiteBody snapshot={s} links={links} mode={mode} />);
const sections = (markup: string) =>
  [...markup.matchAll(/data-section="([a-zA-Z]+)"/g)].map((m) => m[1]);

describe('SiteBody', () => {
  it('renders the visible sections in page order with anchors', () => {
    const out = html(fullSnapshot());
    expect(sections(out)).toEqual([...SITE_SECTION_IDS]);
    expect(out).toContain('id="ueber-mich"');
    expect(out).toContain('<main id="inhalt" tabindex="-1"');
  });
  it('starts with the skip link', () =>
    expect(html(fullSnapshot())).toMatch(/^<div[^>]*><a href="#inhalt"/));
  it('has one h1 and moves rich-text headings below the section heading', () => {
    const out = html(fullSnapshot());
    expect(out.match(/<h1/g)).toHaveLength(1);
    const about = out.slice(
      out.indexOf('data-section="about"'),
      out.indexOf('data-section="heroImage"')
    );
    expect(about.match(/<h2/g)).toHaveLength(1);
    expect(about).toContain('<h3');
  });
  it('greets in the h1 and keeps the name editable as site_title', () => {
    const out = html({ ...fullSnapshot(), site_title: 'Lena Hoffmann' }, 'preview');
    expect(out).toContain('Hallo, ich bin <span data-field="site_title">Lena Hoffmann</span>!');
  });
  it('does not greet twice when the stored title already holds a greeting', () => {
    const out = html({ ...fullSnapshot(), site_title: 'Hallo, ich bin Lena Hoffmann!' });
    expect(out).toContain('Lena Hoffmann</span>!');
    expect(out).not.toMatch(/ich bin[^<]*ich bin/i);
  });
  it('escapes the name inside the greeting', () => {
    const out = html({ ...fullSnapshot(), site_title: '<b>x</b>' });
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
  it('minimal snapshot renders only the hero', () => {
    const out = html(minimalSnapshot());
    expect(sections(out)).toEqual(['hero']);
    expect(out).not.toContain('aria-label="Abschnitte"');
    expect(out).not.toContain('href="#mitmachen"');
    expect(out).not.toContain('data-empty');
  });
  it('preview mode marks every empty section with a placeholder', () => {
    const out = html(minimalSnapshot(), 'preview');
    for (const field of [
      'sections.about.content',
      'sections.themes',
      'sections.actions',
      'contact_email',
    ])
      expect(out).toMatch(
        new RegExp(`data-field="${field.replaceAll('.', '\\.')}"[^>]*data-empty`)
      );
  });
  it('drops hidden sections and their nav entries', () => {
    const out = html(fullSnapshot({ hidden_sections: ['themes', 'actions'] }));
    expect(sections(out)).not.toContain('themes');
    expect(out).not.toContain('href="#themen"');
    expect(out).not.toContain('href="#mitmachen"');
  });
  it('marks repeated cards with their index and path', () => {
    const out = html(fullSnapshot());
    expect(out).toContain('data-index="2"');
    expect(out).toContain('data-field="sections.themes.2.title"');
    expect(out).toContain('data-field="sections.actions.0.link"');
  });
  it('never links an unsafe action', () => {
    const s = fullSnapshot();
    const bad = {
      ...s,
      sections: {
        ...s.sections,
        actions: [{ imageUrl: '', text: 'Los', link: 'javascript:alert(1)' }],
      },
    };
    expect(html(bad, 'preview')).not.toContain('javascript:');
  });
  it('writes no inline style and no target blank', () => {
    const out = html(fullSnapshot());
    expect(out).not.toMatch(/ style="/);
    expect(out).not.toContain('target="_blank"');
  });
  it('loads the portrait eagerly with a srcset and the rest lazily', () => {
    const out = html(fullSnapshot());
    expect(out).toMatch(/<img[^>]*fetchpriority="high"[^>]*>/i);
    expect(out).toContain('?w=400&amp;fmt=webp 400w');
    expect(out.match(/loading="eager"/g)).toHaveLength(1);
    expect(out).not.toMatch(/<img(?![^>]*alt="")[^>]*>/);
  });
  it('wraps long words in the name, tagline and contact links', () => {
    const out = html(maxSnapshot());
    expect(out).toMatch(/<h1[^>]*class="[^"]*site:wrap-anywhere/);
    expect(out).toMatch(/href="mailto:[^"]*"[^>]*class="[^"]*site:wrap-anywhere/);
  });
  it('names the party by locale in the footer', () => {
    expect(html(fullSnapshot({ locale: 'de-AT' }))).toContain('Die Grünen – Die Grüne Alternative');
    expect(html(fullSnapshot())).toContain('Bündnis 90/Die Grünen');
  });
  it('renders the static consent block in public mode', () => {
    const out = html(fullSnapshot());
    expect(out).toContain('data-site-consent="instagram"');
    expect(out).toContain('data-embed-src="https://www.instagram.com/max.muster/embed"');
    expect(out).toContain('href="https://www.instagram.com/max.muster/"');
  });
  it('uses the editor slot in preview mode', () =>
    expect(
      renderToStaticMarkup(
        <SiteBody
          snapshot={fullSnapshot()}
          links={links}
          mode="preview"
          renderInstagram={(u) => <p>slot {u}</p>}
        />
      )
    ).toContain('<p>slot max.muster</p>'));
  it('builds a tel link from the phone', () =>
    expect(html(fullSnapshot({ contact_phone: '+49 30 123-45' }))).toContain(
      'href="tel:+493012345"'
    ));
  it('renders the Austrian Impressum with its paragraphs and the draft notice', () => {
    const out = renderToStaticMarkup(
      <SiteLegalBody
        snapshot={fullSnapshot({ locale: 'de-AT' })}
        links={links}
        document="impressum"
      />
    );
    expect(out).toContain('Angaben gemäß § 5 ECG');
    expect(out).toContain('Offenlegung gemäß § 25 MedienG');
    expect(out).toContain('role="note"');
    expect(out).toContain('<address');
  });
});
