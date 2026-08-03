import { render, screen } from '@testing-library/react';
import { type Slide } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { SlideSurface } from './SlideSurface.js';

function slide(partial: Partial<Slide>): Slide {
  return {
    id: 's1',
    layout: 'content',
    title: '',
    body: '',
    notes: '',
    background: null,
    transition: null,
    fragments: false,
    autoAnimate: false,
    hidden: false,
    codeLanguage: null,
    variant: 0,
    fontSize: 'm',
    ...partial,
  };
}

const TABLE = ['| Quelle | Datum |', '| --- | --- |', '| Rat der EU | 05.03.2026 |'].join('\n');

describe('SlideSurface tables', () => {
  it('renders a markdown table as a table', () => {
    render(<SlideSurface slide={slide({ body: TABLE })} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(2);
    expect(screen.getByRole('cell', { name: 'Rat der EU' })).toBeInTheDocument();
  });

  // A markdown table renders `<th>` with no scope, which leaves a screen reader
  // announcing values with no column to attach them to.
  it('gives every header cell a column scope', () => {
    render(<SlideSurface slide={slide({ body: TABLE })} />);
    for (const th of screen.getAllByRole('columnheader')) {
      expect(th).toHaveAttribute('scope', 'col');
    }
  });

  it('scopes headers outside present mode too — the viewer and the PDF use this path', () => {
    render(<SlideSurface slide={slide({ body: TABLE })} presenting={false} />);
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute('scope', 'col');
  });
});

describe('SlideSurface images', () => {
  it('renders a body image with its alt text', () => {
    render(<SlideSurface slide={slide({ body: '![Ein Diagramm](https://example.org/x.png)' })} />);
    const img = screen.getByAltText('Ein Diagramm');
    expect(img).toHaveAttribute('src', 'https://example.org/x.png');
  });

  it('renders prose and image from one mixed body', () => {
    render(<SlideSurface slide={slide({ body: 'Davor\n\n![Bild](https://example.org/x.png)' })} />);
    expect(screen.getByText('Davor')).toBeInTheDocument();
    expect(screen.getByAltText('Bild')).toBeInTheDocument();
  });
});
