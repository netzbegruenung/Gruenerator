import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SourceGlyph } from './SourceGlyph';

/**
 * The regression this component exists for is a NETWORK request, not a pixel:
 * every displayed source used to make the user's browser call
 * `google.com/s2/favicons`, handing a third party their IP and the domain they
 * were about to read. So the load-bearing assertion here is that nothing in the
 * rendered output points anywhere at all.
 */
describe('SourceGlyph', () => {
  it('renders no image and no remote URL', () => {
    const { container } = render(<SourceGlyph domain="klimawandelanpassung.at" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toMatch(/https?:\/\//);
  });

  it('shows the domain initial', () => {
    const { container } = render(<SourceGlyph domain="www.bmk.gv.at" />);
    expect(container.textContent).toBe('B');
  });

  it('falls back to a globe when there is no domain', () => {
    // URL-less sources (private Wolke files) have no letter to show, and
    // inventing one would label the source wrongly.
    const { container } = render(<SourceGlyph domain={null} />);
    expect(container.textContent).toBe('');
    expect(container.querySelector('svg')).not.toBeNull();
  });

  /**
   * Decorative on purpose: the domain name is always rendered next to the
   * glyph, so announcing the letter would make a screen reader read "B,
   * bmk.gv.at".
   */
  it('is hidden from assistive technology', () => {
    const { container } = render(<SourceGlyph domain="gruene.de" />);
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('keeps one domain on one hue across renders', () => {
    const a = render(<SourceGlyph domain="gruene.de" />).container.innerHTML;
    const b = render(<SourceGlyph domain="www.GRUENE.de" />).container.innerHTML;
    expect(a).toBe(b);
  });
});
