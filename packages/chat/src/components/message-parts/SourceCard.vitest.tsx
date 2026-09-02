import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../context/CitationContext', () => ({
  useCitationContext: () => ({
    citations: [
      {
        id: 1,
        title: 'Wahlprogramm',
        url: '',
        snippet: 'x',
        source: 'grundsatz',
        collectionName: 'Grundsatz',
        pageNumber: 12,
        similarityScore: 0.78,
      },
    ],
    fetchFullText: undefined,
  }),
}));

import { SourceCard } from './SourceCard';

import type { SourceMessagePartProps } from '@assistant-ui/react';

// SourceMessagePartProps = MessagePartState & SourceMessagePart — the "url"
// variant needs `type`/`sourceType`/`status` beyond what the brief's minimal
// JSX shows; SourceCard only ever reads `id`, `title` and `url`.
const baseProps: SourceMessagePartProps = {
  type: 'source',
  sourceType: 'url',
  status: { type: 'complete' },
  id: 'source-1',
  title: '',
  url: '',
};

describe('SourceCard meta line', () => {
  it('shows page and relevance when present', () => {
    render(<SourceCard {...baseProps} />);
    expect(screen.getByText(/S\. 12/)).toBeInTheDocument();
    expect(screen.getByText(/78 %/)).toBeInTheDocument();
  });
});
