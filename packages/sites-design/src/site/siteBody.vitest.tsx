import { type PublishedSiteSnapshot, type SiteBlock } from '@gruenerator/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { type SiteLinks, sitePaths } from '../model/paths.js';
import { type SiteRenderMode } from '../model/visibility.js';
import {
  fullSnapshot,
  maxSnapshot,
  minimalSnapshot,
  withBlock,
  withBlocks,
} from '../testing/fixtures.js';

import { SiteBody } from './SiteBody.js';
import { SiteLegalBody } from './SiteLegalBody.js';

const links: SiteLinks = { ...sitePaths('anna'), report: 'mailto:melden@example.org' };
const html = (s: PublishedSiteSnapshot, mode: SiteRenderMode = 'public') =>
  renderToStaticMarkup(<SiteBody snapshot={s} links={links} mode={mode} />);
const sections = (markup: string) =>
  [...markup.matchAll(/data-block-type="([a-zA-Z]+)"/g)].map((m) => m[1]);
const grounds = (markup: string) =>
  [...markup.matchAll(/<section[^>]*data-ground="([a-z]+)"/g)].map((m) => m[1]);
const slice = (markup: string, from: string, to: string) =>
  markup.slice(
    markup.indexOf(`data-block-type="${from}"`),
    markup.indexOf(`data-block-type="${to}"`)
  );
const STANDARD = ['hero', 'about', 'heroImage', 'themes', 'actions', 'socialFeed', 'contact'];

describe('SiteBody', () => {
  it('lays the portrait under the hero text in the full-bleed layout', () => {
    const hero = (markup: string) => slice(markup, 'hero', 'about');
    const portrait = hero(html(fullSnapshot()));
    expect(portrait).not.toContain('data-ground="photo"');
    const s = withBlock(fullSnapshot(), 'hero', { layout: 'vollbild' });
    const full = hero(html(s));
    expect(full).toContain('data-ground="photo"');
    expect(full).toContain('fetchPriority="high"');
    expect(full).toContain('data-field="site_title"');
    const bare = hero(html({ ...s, profile_image: '' }, 'preview'));
    expect(bare).toContain('data-ground="deep"');
    expect(bare).toContain('data-field="profile_image" data-empty=""');
  });

  it('paints the header white in every variant, even when an old row asks for colour', () => {
    const header = (markup: string) => /<header data-ground="([a-z]+)"/.exec(markup)?.[1];
    for (const variant of ['dunkel', 'hell', 'leuchtend'] as const) {
      const s = { ...fullSnapshot(), variant };
      expect(header(html(s))).toBe('paper');
      expect(header(html({ ...s, sections: { ...s.sections, header: 'farbig' } }))).toBe('paper');
    }
  });

  it('hands every text field to the edit slots and keeps empty ones visible while editing', () => {
    const edit = {
      text: (field: string) => <i data-slot={field} />,
      richText: (field: string) => <i data-rich-slot={field} />,
    };
    const out = renderToStaticMarkup(
      <SiteBody
        snapshot={{ ...minimalSnapshot(), tagline: '' }}
        links={links}
        mode="preview"
        edit={edit}
      />
    );
    expect(out).toContain('data-slot="site_title"');
    expect(out).toContain('data-slot="tagline"');
    expect(out).not.toContain('data-rich-slot="blocks.');
    expect(html({ ...minimalSnapshot(), tagline: '' }, 'preview')).not.toContain('data-slot');
    const actions = renderToStaticMarkup(
      <SiteBody snapshot={fullSnapshot()} links={links} mode="preview" edit={edit} />
    );
    expect(actions).toContain('data-rich-slot="blocks.about.content"');
    const tiles = slice(actions, 'actions', 'socialFeed');
    expect(tiles).toContain('data-slot="blocks.actions.items.a1.text"');
    expect(tiles).not.toContain('data-field="blocks.actions.items.a1.link"');
  });
  it('renders the visible sections in page order with anchors', () => {
    const out = html(fullSnapshot());
    expect(sections(out)).toEqual(STANDARD);
    expect(out).toContain('id="ueber-mich"');
    expect(out).toContain('<main id="inhalt" tabindex="-1"');
  });
  it('starts with the skip link', () =>
    expect(html(fullSnapshot())).toMatch(/^<div[^>]*><a href="#inhalt"/));
  it('has one h1 and moves rich-text headings below the section heading', () => {
    const out = html(fullSnapshot());
    expect(out.match(/<h1/g)).toHaveLength(1);
    const about = slice(out, 'about', 'heroImage');
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
    const full = html(
      withBlocks(minimalSnapshot(), [
        { id: 'hero', type: 'hero' },
        { id: 'ab', type: 'about', title: '', content: { type: 'doc' } },
        { id: 'th', type: 'themes', items: [] },
        { id: 'ac', type: 'actions', items: [] },
        { id: 'co', type: 'contact', title: '', backgroundImageUrl: '' },
      ]),
      'preview'
    );
    expect(html(minimalSnapshot(), 'preview')).not.toContain('data-empty=""><');
    for (const field of ['blocks.ab.content', 'blocks.th', 'blocks.ac', 'contact_email'])
      expect(full).toMatch(
        new RegExp(`data-field="${field.replaceAll('.', '\\.')}"[^>]*data-empty`)
      );
  });
  it('drops blocks missing from the snapshot and their nav entries', () => {
    const out = html(
      withBlocks(
        fullSnapshot(),
        fullSnapshot().sections.blocks.filter((b) => b.type !== 'themes' && b.type !== 'actions')
      )
    );
    expect(sections(out)).not.toContain('themes');
    expect(out).not.toContain('href="#themen"');
    expect(out).not.toContain('href="#mitmachen"');
  });
  it('marks repeated cards with their index and path', () => {
    const out = html(fullSnapshot());
    expect(out).toContain('data-item-id="t3"');
    expect(out).toContain('data-field="blocks.themes.items.t3.title"');
    expect(out).toContain('data-field="blocks.actions.items.a2.link"');
  });
  it('never links an unsafe action', () => {
    const bad = withBlock(fullSnapshot(), 'actions', {
      items: [{ id: 'x', imageUrl: '', text: 'Los', link: 'javascript:alert(1)' }],
    });
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

describe('block list', () => {
  const twoThemes = (): PublishedSiteSnapshot => {
    const s = fullSnapshot();
    const themes = s.sections.blocks.find((b) => b.type === 'themes')!;
    const copy = {
      ...themes,
      id: 'themes2',
      items: themes.type === 'themes' ? themes.items.map((i) => ({ ...i, id: `${i.id}b` })) : [],
    } as SiteBlock;
    const blocks = [...s.sections.blocks];
    blocks.splice(blocks.indexOf(themes) + 1, 0, copy);
    return withBlocks(s, blocks);
  };

  it('paints the standard page with the grounds of each variant and locale', () => {
    const expected = {
      dunkel: ['deep', 'paper', 'photo', 'surface', 'paper', 'surface', 'photo'],
      hell: ['surface', 'paper', 'photo', 'paper', 'surface', 'paper', 'photo'],
      leuchtend: ['vivid', 'paper', 'photo', 'deep', 'paper', 'surface', 'photo'],
    } as const;
    for (const variant of ['dunkel', 'hell', 'leuchtend'] as const) {
      expect(grounds(html(fullSnapshot({ variant })))).toEqual(expected[variant]);
    }
    expect(grounds(html(fullSnapshot({ variant: 'hell', locale: 'de-AT' })))[1]).toBe('tint');
  });

  it('gives a second block of the same type its own ground and anchor', () => {
    const out = html(twoThemes());
    const [first, second] = [...out.matchAll(/<section[^>]*data-block-type="themes"[^>]*>/g)].map(
      (m) => m[0]
    );
    expect(first).toContain('id="themen"');
    expect(second).toContain('id="themen-2"');
    expect(/data-ground="([a-z]+)"/.exec(first!)?.[1]).not.toBe(
      /data-ground="([a-z]+)"/.exec(second!)?.[1]
    );
  });

  it('never repeats an id on the page', () => {
    const ids = [...html(twoThemes()).matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(10);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('links the navigation to the first block of a type', () => {
    const out = html(twoThemes());
    expect(out).toContain('href="#themen"');
    expect(out).not.toContain('href="#themen-2"');
  });

  it('marks a hidden block while editing and keeps the other grounds', () => {
    const edit = { text: () => null, richText: () => null };
    const s = withBlock(fullSnapshot(), 'about', { hidden: true });
    const editing = renderToStaticMarkup(
      <SiteBody snapshot={s} links={links} mode="preview" edit={edit} />
    );
    expect(editing).toMatch(/<section[^>]*data-block-type="about"[^>]*data-editor-hidden=""/);
    expect(grounds(editing)).toEqual(grounds(html(fullSnapshot())));
    expect(sections(html(s, 'preview'))).not.toContain('about');
    expect(sections(html(s))).not.toContain('about');
  });

  it('renders blocks in the order of the list', () => {
    const s = fullSnapshot();
    const [hero, ...rest] = s.sections.blocks;
    const out = html(withBlocks(s, [hero!, ...rest.reverse()]));
    expect(sections(out)).toEqual(['hero', ...STANDARD.slice(1).reverse()]);
  });
});
