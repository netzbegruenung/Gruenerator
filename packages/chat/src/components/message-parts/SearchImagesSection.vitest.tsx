import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SearchImagesSection } from './SearchImagesSection';

/**
 * This component has two modes and the difference between them is a privacy
 * property, not a layout preference.
 *
 * With a `proxyUrl` the thumbnail is served from OUR origin. Without one it must
 * fall back to a plain link — because the alternative, `<img src={image.url}>`,
 * makes the reader's browser announce their IP and the page they are reading to
 * whatever host a search engine returned. That is the pattern we removed from the
 * citation glyphs, and "the proxy secret is unset in this environment" must not be
 * the thing that quietly brings it back.
 *
 * So the load-bearing assertion is negative and appears in both modes: no element
 * anywhere may point at a third-party host.
 */
describe('SearchImagesSection', () => {
  /** No proxy configured — the link fallback. */
  const images = [
    { title: 'Demo in Leipzig', url: 'https://zeit.de/bild-1.jpg', domain: 'zeit.de' },
    { title: 'Kundgebung am Markt', url: 'https://spiegel.de/foto.png', domain: 'spiegel.de' },
  ];

  /** Proxy configured — thumbnails, served same-origin. */
  const proxied = images.map((image, i) => ({
    ...image,
    proxyUrl: `/api/search-image?url=x${i}&exp=1&sig=s`,
  }));

  it('renders no image element when there is no proxy', () => {
    const { container } = render(<SearchImagesSection images={images} />);
    expect(container.querySelector('img')).toBeNull();
    // Also nothing that loads a remote asset by another route.
    expect(container.querySelector('picture, source, iframe')).toBeNull();
  });

  it('renders thumbnails through the proxy, never from the source host', () => {
    const { container } = render(<SearchImagesSection images={proxied} />);
    const imgs = Array.from(container.querySelectorAll('img'));
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      const src = img.getAttribute('src') ?? '';
      // Same-origin path only. This is the assertion the whole PR exists for.
      expect(src.startsWith('/api/search-image?')).toBe(true);
      expect(src).not.toMatch(/^https?:\/\//);
    }
    // And no element anywhere points at zeit.de/spiegel.de except the <a href>.
    const remote = Array.from(container.querySelectorAll('[src]')).filter((el) =>
      (el.getAttribute('src') ?? '').includes('://')
    );
    expect(remote).toHaveLength(0);
  });

  it('keeps every thumbnail linked to its source and described for screen readers', () => {
    const { container } = render(<SearchImagesSection images={proxied} />);
    expect(container.querySelectorAll('a')).toHaveLength(2);
    for (const img of Array.from(container.querySelectorAll('img'))) {
      expect(img.getAttribute('alt')).toBeTruthy();
      expect(img.getAttribute('loading')).toBe('lazy');
    }
  });

  it('falls back to a link when a thumbnail fails to load', () => {
    // The proxy legitimately fails (source 404, over the size cap, refused
    // type). A broken-image icon would leave the user with nothing, so the tile
    // degrades to the same link the no-proxy path renders.
    const { container } = render(<SearchImagesSection images={[proxied[0]!]} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).toBe(proxied[0]!.url);
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
