/**
 * #3133: das Modal war ein handgebautes Overlay ohne Rolle, ohne Namen, ohne
 * Fokusfalle. Die drei Zusicherungen hier sind genau das, dessen Fehlen das
 * Issue meldet — und sie sind ALLE gegen die alte Fassung rot (Step 2), was
 * die Bedingung dafür ist, dass sie etwas bewachen.
 *
 * Zwei Fallen dieser Lane (apps/web/CLAUDE-testing.md:84-92):
 *  - Radix läuft hier nur, weil server.deps.inline das SCHIRMPAKET `radix-ui`
 *    trifft, nicht `@radix-ui/*`.
 *  - Radix setzt für die Dauer des Dialogs `body { pointer-events: none }`;
 *    user-event verweigert deshalb jeden Klick AUSSERHALB des Inhalts.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import useCitationStore from '../../../stores/citationStore';
import { axe } from '../../../test-utils';

import CitationModal from './CitationModal';

const CITATION = {
  index: 1,
  document_title: 'Grundsatzprogramm',
  cited_text: 'Ein Beispielzitat aus dem Programm.',
  similarity_score: 0.87,
};

function openCitation(citation: Record<string, unknown> = CITATION) {
  act(() => {
    useCitationStore.setState({ selectedCitation: citation });
  });
}

afterEach(() => {
  act(() => {
    useCitationStore.setState({
      selectedCitation: null,
      contextData: null,
      contextError: null,
      isLoadingContext: false,
    });
  });
});

describe('CitationModal — Dialog-Semantik (#3133)', () => {
  it('meldet sich als Dialog mit dem Zitat und dem Dokumenttitel als Namen', async () => {
    render(<CitationModal />);
    openCitation();

    expect(
      await screen.findByRole('dialog', { name: /Zitat \[1\] — Grundsatzprogramm/ })
    ).toBeInTheDocument();
  });

  it('nennt sich ohne Dokumenttitel nur nach der Zitatnummer', async () => {
    render(<CitationModal />);
    openCitation({ index: 3, cited_text: 'Ohne Titel.' });

    expect(await screen.findByRole('dialog', { name: 'Zitat [3]' })).toBeInTheDocument();
  });

  it('rendert nichts, solange kein Zitat gewählt ist', () => {
    render(<CitationModal />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('legt den Fokus in den Textbereich, nicht auf den Schliessen-Knopf', async () => {
    render(<CitationModal />);
    openCitation();

    const region = await screen.findByRole('region', { name: 'Zitat im Zusammenhang' });
    await waitFor(() => expect(region).toHaveFocus());
    expect(screen.getByRole('button', { name: /Schließen/i })).not.toHaveFocus();
  });

  it('schliesst per Escape und gibt den Fokus an das auslösende Element zurück', async () => {
    const user = userEvent.setup();
    render(
      <>
        {/* Stellvertreter für das Zitat-Badge (CitationBadge.tsx:54-71): es ist
            fokussierbar und beim Schliessen noch im DOM, weil Renderer und Modal
            auf der Monitor-Seite Geschwister sind (MonitorThemenPage.tsx:86 / :283). */}
        <button type="button">Zitat 1</button>
        <CitationModal />
      </>
    );

    const badge = screen.getByRole('button', { name: 'Zitat 1' });
    badge.focus();
    expect(badge).toHaveFocus();

    openCitation();
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useCitationStore.getState().selectedCitation).toBeNull();
    await waitFor(() => expect(badge).toHaveFocus());
  });
});

const CONTEXT_DATA = {
  documentId: 'doc-1',
  centerChunkIndex: 4,
  centerChunk: { text: 'Der zitierte Satz.', chunkIndex: 4 },
  contextChunks: [
    { text: 'Davor.', chunkIndex: 3, isCenter: false },
    { text: 'Der zitierte Satz.', chunkIndex: 4, isCenter: true },
    { text: 'Danach.', chunkIndex: 5, isCenter: false },
  ],
};

describe('CitationModal — die drei Zustände', () => {
  it('sagt den Ladezustand als Statusmeldung an', async () => {
    render(<CitationModal />);
    act(() => {
      useCitationStore.setState({ selectedCitation: CITATION, isLoadingContext: true });
    });

    // Genau EINE Live-Region — Laden und Fehler teilen sich jetzt eine
    // dauerhaft montierte Statuszeile statt je einer eigenen, die mit ihrem
    // Text ein- und aushängt.
    const statuses = await screen.findAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent('Kontext wird geladen...');
  });

  it('zeigt die Fehlermeldung des Stores — nicht nur das Zitat', async () => {
    // Der Kern von #3133s Nebenbefund: der Fehlerzweig rendert bisher
    // `cited_text` und wirft `contextError` (citationStore.ts:181/:186) weg.
    render(<CitationModal />);
    act(() => {
      useCitationStore.setState({
        selectedCitation: CITATION,
        contextError: 'Kontext konnte nicht geladen werden',
      });
    });

    const statuses = await screen.findAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent('Kontext konnte nicht geladen werden');
    // Was man trotzdem hat, bleibt sichtbar.
    expect(screen.getByText(/Ein Beispielzitat aus dem Programm\./)).toBeInTheDocument();
  });

  it('markiert im Kontext den zitierten Chunk und dämpft die Nachbarn per Farbtoken', async () => {
    render(<CitationModal />);
    act(() => {
      useCitationStore.setState({ selectedCitation: CITATION, contextData: CONTEXT_DATA });
    });

    const region = await screen.findByRole('region', { name: 'Zitat im Zusammenhang' });
    expect(region).toHaveTextContent('Der zitierte Satz.');
    expect(region.querySelector('.citation-highlight')).not.toBeNull();
    // docs/CLAUDE-a11y.md:48-52 — Deckkraft frisst den Kontrast von allem darin.
    expect(region.querySelector('.opacity-70')).toBeNull();
    expect(region.querySelector('.text-muted-foreground')).not.toBeNull();
  });
});

describe('CitationModal — axe je Zustand', () => {
  /**
   * Geprüft wird der DIALOG, nicht `container`: Radix portaliert Overlay und
   * Inhalt als direkte <body>-Kinder (dialog.tsx:51-56), RTLs container ist
   * also leer — `axe(container)` wäre grün ohne eine einzige Prüfung.
   * `axe` kommt aus src/test-utils.tsx:15, nie direkt aus vitest-axe
   * (apps/web/CLAUDE-testing.md:32-35).
   */
  async function axeOnDialog() {
    return axe(await screen.findByRole('dialog'));
  }

  it('Laden', async () => {
    render(<CitationModal />);
    act(() => {
      useCitationStore.setState({ selectedCitation: CITATION, isLoadingContext: true });
    });

    expect(await axeOnDialog()).toHaveNoViolations();
  });

  it('Fehler', async () => {
    render(<CitationModal />);
    act(() => {
      useCitationStore.setState({ selectedCitation: CITATION, contextError: 'Kaputt' });
    });

    expect(await axeOnDialog()).toHaveNoViolations();
  });

  it('geladener Kontext', async () => {
    render(<CitationModal />);
    act(() => {
      useCitationStore.setState({ selectedCitation: CITATION, contextData: CONTEXT_DATA });
    });

    expect(await axeOnDialog()).toHaveNoViolations();
  });
});
