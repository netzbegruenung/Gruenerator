import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Citation } from './ProjectCitation';

import type { CitationProps } from './projectSchema';

function citation(over: Partial<CitationProps> = {}): CitationProps {
  return {
    id: 1,
    title: 'kommunal.de',
    url: 'https://kommunal.de/',
    snippet: 'Startseite',
    source: 'web',
    ...over,
  };
}

// #6103: the person has to see what the answer saw. A partly read page carries
// the same numbers the model was told in its source line.
describe('Citation coverage', () => {
  it('names a partly read source with the read share and the exact numbers on hover', () => {
    render(<Citation {...citation({ coverage: { readChars: 8_000, totalChars: 61_000 } })} />);
    const label = screen.getByText(/^nur 13\s% gelesen$/);
    expect(label).toHaveAttribute(
      'title',
      'In die Antwort sind 8.000 von 61.000 Zeichen dieser Quelle eingeflossen.'
    );
  });

  it('adds nothing for a fully read source or one without coverage', () => {
    const { rerender } = render(
      <Citation {...citation({ coverage: { readChars: 900, totalChars: 900 } })} />
    );
    expect(screen.queryByText(/gelesen/)).toBeNull();
    rerender(<Citation {...citation()} />);
    expect(screen.queryByText(/gelesen/)).toBeNull();
  });
});
