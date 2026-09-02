import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const state = vi.hoisted(() => ({
  citations: [] as Record<string, unknown>[],
}));

vi.mock('../../context/CitationContext', () => ({
  useCitationContext: () => ({
    citations: state.citations,
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
    state.citations = [
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
    ];
    const { container } = render(<SourceCard {...baseProps} />);
    expect(screen.getByText(/S\. 12/)).toBeInTheDocument();
    expect(screen.getByText(/78\s%/)).toBeInTheDocument();
    // Geschütztes Leerzeichen: die Metazeile wird abgeschnitten, Zahl und
    // Einheit dürfen dabei nicht auseinanderbrechen. `getByText` normalisiert
    // das weg, `textContent` nicht.
    expect(container.textContent).toContain('78\u00a0%');
  });

  // Ein Wert von 0 ist kein Beleg, sondern ein fehlender Score (der Rerank
  // ist ausgefallen oder die Quelle kam ohne Treffer herein); „0 % Relevanz"
  // liest sich als Urteil, nicht als Lücke.
  it('omits the relevance when the score is zero', () => {
    state.citations = [
      {
        id: 1,
        title: 'Wahlprogramm',
        url: '',
        snippet: 'x',
        source: 'grundsatz',
        collectionName: 'Grundsatz',
        similarityScore: 0,
      },
    ];
    render(<SourceCard {...baseProps} />);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  /**
   * Eine Quelle ohne Seite und ohne Relevanz darf weder ein leeres „S." noch
   * ein nacktes „%" zeigen — und schon gar keinen doppelten Trenner, den die
   * abgeschnittene Metazeile als Rest eines fehlenden Feldes hinterliesse.
   */
  it('omits page and relevance when the citation carries neither', () => {
    state.citations = [
      {
        id: 1,
        title: 'Wahlprogramm',
        url: '',
        snippet: 'x',
        source: 'grundsatz',
        collectionName: 'Grundsatz',
        domain: 'gruene.de',
      },
    ];
    const { container } = render(<SourceCard {...baseProps} />);
    expect(screen.queryByText(/S\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(container.textContent).not.toContain(' ·  · ');
    expect(container.textContent).not.toMatch(/·\s*$/);
  });
});
