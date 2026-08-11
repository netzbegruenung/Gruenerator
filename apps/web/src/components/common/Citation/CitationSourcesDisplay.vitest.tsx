import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import CitationSourcesDisplay, { type Citation } from './CitationSourcesDisplay';

const citations: Citation[] = [
  { document_id: 'a', document_title: 'Beschluss A', cited_text: 'Zitat A', index: 1 },
  { document_id: 'b', document_title: 'Beschluss B', cited_text: 'Zitat B', index: 2 },
];

describe('CitationSourcesDisplay', () => {
  it('renders the sources open by default', () => {
    render(<CitationSourcesDisplay citations={citations} />);
    expect(screen.getByText('Beschluss A')).toBeVisible();
  });

  it('folds them behind a summary carrying the count when collapsible', () => {
    const { container } = render(<CitationSourcesDisplay citations={citations} collapsible />);

    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    expect(screen.getByText('Quellen und Zitate')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });
});
