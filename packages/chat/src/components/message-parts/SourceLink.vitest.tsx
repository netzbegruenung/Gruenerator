/**
 * `[Titel](quelle:N)` must survive the real Streamdown pipeline with the real
 * component map — its harden layer strips unknown link schemes, which is why
 * the link becomes an element on the tree before hast — and then open the best
 * target the citation has.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Streamdown, defaultRemarkPlugins } from 'streamdown';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CitationProvider } from '../../context/CitationContext';
import { CitationPanelProvider, useCitationPanel } from '../../context/CitationPanelContext';
import { remarkSourceLinks } from '../../lib/remarkSourceLinks';
import { streamdownComponents } from '../../lib/streamdownComponents';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { axe } from '../../test-utils';

import { SourceLink } from './SourceLink';

import type { Citation } from '../../hooks/useChatGraphStream';

function citation(over: Partial<Citation> = {}): Citation {
  return {
    id: 1,
    title: 'Kohleausstieg vor 2038',
    url: 'https://gruene-brandenburg.de/kohleausstieg',
    snippet: '',
    source: 'gruenerator:brandenburg',
    ...over,
  };
}

function renderMarkdown(markdown: string, citations: Citation[]) {
  return render(
    <CitationPanelProvider>
      <CitationProvider citations={citations}>
        <Streamdown
          remarkPlugins={[...Object.values(defaultRemarkPlugins), remarkSourceLinks]}
          allowedTags={{ sourcelink: ['n'] }}
          components={streamdownComponents}
        >
          {markdown}
        </Streamdown>
      </CitationProvider>
    </CitationPanelProvider>
  );
}

afterEach(() => {
  useChatConfigStore.getState().configure();
});

describe('SourceLink', () => {
  it('opens a readable system document in the host reader', async () => {
    const openSourceDocument = vi.fn();
    useChatConfigStore.getState().configure({ onOpenSourceDocument: openSourceDocument });
    const user = userEvent.setup();
    renderMarkdown('- [Kohleausstieg vor 2038](quelle:1)', [
      citation({ readerCollectionId: 'brandenburg-system' }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Kohleausstieg vor 2038' }));

    expect(openSourceDocument).toHaveBeenCalledWith({
      collectionId: 'brandenburg-system',
      sourceUrl: 'https://gruene-brandenburg.de/kohleausstieg',
      query: '',
      title: 'Kohleausstieg vor 2038',
    });
  });

  it('opens a user document in the host reader, through its notebook', async () => {
    const openSourceDocument = vi.fn();
    useChatConfigStore.getState().configure({ onOpenSourceDocument: openSourceDocument });
    const user = userEvent.setup();
    renderMarkdown('[Antrag Radweg](quelle:1)', [
      citation({ url: '', readerDocument: { documentId: 'doc-1', notebookId: 'nb-uuid' } }),
    ]);

    await user.click(screen.getByRole('button', { name: 'Antrag Radweg' }));

    expect(openSourceDocument).toHaveBeenCalledWith({
      documentId: 'doc-1',
      notebookId: 'nb-uuid',
      query: '',
      title: 'Kohleausstieg vor 2038',
    });
  });

  it('opens a notebook chunk in the citation panel when there is no reader', async () => {
    const user = userEvent.setup();
    let panel: ReturnType<typeof useCitationPanel> | null = null;
    function PanelProbe() {
      panel = useCitationPanel();
      return null;
    }
    render(
      <CitationPanelProvider>
        <PanelProbe />
        <CitationProvider
          citations={[
            citation({ url: '', documentId: 'doc-1', collectionId: 'nb-uuid', chunkIndex: 2 }),
          ]}
        >
          <SourceLink n="1">Eigenes Dokument</SourceLink>
        </CitationProvider>
      </CitationPanelProvider>
    );

    await user.click(screen.getByRole('button', { name: 'Eigenes Dokument' }));

    expect(panel!.isOpen).toBe(true);
    expect(panel!.source?.documentId).toBe('doc-1');
  });

  it('falls back to the original URL without reader or panel', () => {
    renderMarkdown('[Webseite](quelle:1)', [citation()]);
    expect(screen.getByRole('link', { name: 'Webseite' })).toHaveAttribute(
      'href',
      'https://gruene-brandenburg.de/kohleausstieg'
    );
  });

  it('stays plain text while the citation has not arrived', () => {
    renderMarkdown('[Noch im Stream](quelle:1)', []);
    expect(screen.getByText('Noch im Stream')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('has no axe violations', async () => {
    useChatConfigStore.getState().configure({ onOpenSourceDocument: vi.fn() });
    const { container } = renderMarkdown('- [Kohleausstieg vor 2038](quelle:1)', [
      citation({ readerCollectionId: 'brandenburg-system' }),
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });
});
