import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SearchImagesSection } from './SearchImagesSection';

/**
 * The load-bearing assertion in this file is a NEGATIVE one: no `<img>`.
 *
 * A thumbnail here would make the reader's browser fetch a file from whatever
 * host the web search happened to turn up — the same trade we removed from the
 * citation glyphs, where a favicon request reported the user's IP and the page
 * they were about to open to a third party. "Render the images we found" is the
 * obvious next change someone will make to this component, and it is the one that
 * must not happen without a backend proxy. So it is pinned here rather than left
 * to a comment.
 */
describe('SearchImagesSection', () => {
  const images = [
    { title: 'Demo in Leipzig', url: 'https://zeit.de/bild-1.jpg', domain: 'zeit.de' },
    { title: 'Kundgebung am Markt', url: 'https://spiegel.de/foto.png', domain: 'spiegel.de' },
  ];

  it('renders no image element at all', () => {
    const { container } = render(<SearchImagesSection images={images} />);
    expect(container.querySelector('img')).toBeNull();
    // Also nothing that loads a remote asset by another route.
    expect(container.querySelector('picture, source, iframe')).toBeNull();
  });

  it('renders each hit as a link that opens safely in a new tab', () => {
    const { container } = render(<SearchImagesSection images={images} />);
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://zeit.de/bild-1.jpg',
      'https://spiegel.de/foto.png',
    ]);
    for (const link of links) {
      // `noopener` matters on a link to an arbitrary search-result host: without
      // it the opened page gets a handle on ours via window.opener.
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.getAttribute('target')).toBe('_blank');
    }
  });

  it('names the source domain next to each link', () => {
    const { container } = render(<SearchImagesSection images={images} />);
    expect(container.textContent).toContain('zeit.de');
    expect(container.textContent).toContain('spiegel.de');
  });

  it('says these are research material, not usable assets', () => {
    // The legal half of the design: a web image is context, not licensed
    // material, and the UI must not imply otherwise.
    const { container } = render(<SearchImagesSection images={images} />);
    expect(container.textContent).toMatch(/Recherchematerial/);
    expect(container.textContent).toMatch(/Rechte/);
  });

  it('uses the singular for a single hit', () => {
    const { container } = render(<SearchImagesSection images={[images[0]!]} />);
    expect(container.textContent).toContain('1 gefundene Bildquelle');
    expect(container.textContent).not.toContain('Bildquellen');
  });

  it('renders nothing when there are no hits', () => {
    const { container } = render(<SearchImagesSection images={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('marks the decorative icons hidden from assistive technology', () => {
    // The domain and title are always read out next to them, so announcing the
    // glyph would make a screen reader spell a letter it is about to hear as a
    // word. (`packages/chat` has no axe lane — apps/web owns that setup — so the
    // a11y expectations here are asserted directly.)
    const { container } = render(<SearchImagesSection images={images} />);
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('uses list semantics so the count is announced', () => {
    const { container } = render(<SearchImagesSection images={images} />);
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});
