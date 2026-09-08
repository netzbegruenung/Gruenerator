import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CitationPreview } from './CitationPreview';

// `citedText` arrives with up to 1500 chars from projectCitation; unclamped,
// the popover grew past the viewport edge.
const longBody = Array(30)
  .fill('Empfehlenswert ist auch eine gemeinsame Klausur im Jahr.')
  .join(' ');

describe('CitationPreview', () => {
  it('clamps the body so a long cited text cannot outgrow the popover', () => {
    render(<CitationPreview title="Zusammenarbeit im Team" body={longBody} />);
    expect(screen.getByText(longBody)).toHaveClass('line-clamp-6');
  });

  it('lets a caller tighten the clamp without stacking both values', () => {
    render(
      <CitationPreview
        title="Zusammenarbeit im Team"
        body={longBody}
        bodyClassName="line-clamp-2"
      />
    );
    const paragraph = screen.getByText(longBody);
    expect(paragraph).toHaveClass('line-clamp-2');
    expect(paragraph).not.toHaveClass('line-clamp-6');
  });
});
