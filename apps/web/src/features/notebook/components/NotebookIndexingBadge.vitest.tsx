/**
 * Ein Notizbuch, dessen Quellen noch verarbeitet werden, sah in der Übersicht
 * exakt aus wie ein fertiges — man öffnete es und bekam auf jede Frage "nichts
 * gefunden". Diese Tests halten fest, dass der Unterschied sichtbar ist, und
 * dass ein fertiges Notizbuch dabei kein Rauschen bekommt.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import NotebookIndexingBadge from './NotebookIndexingBadge';

describe('NotebookIndexingBadge', () => {
  it('sagt an, dass noch indexiert wird', () => {
    render(<NotebookIndexingBadge state="indexing" />);

    expect(screen.getByText('Wird indexiert')).toBeInTheDocument();
  });

  it('unterscheidet teilweise von gar nicht durchsuchbar', () => {
    const { unmount } = render(<NotebookIndexingBadge state="partial" />);
    expect(screen.getByText('Teilweise indexiert')).toBeInTheDocument();
    unmount();

    render(<NotebookIndexingBadge state="failed" />);
    expect(screen.getByText('Nicht durchsuchbar')).toBeInTheDocument();
  });

  it('bleibt bei fertigen und leeren Notizbüchern stumm', () => {
    // `empty` sagt die Meta-Zeile der Karte bereits ("0 Quellen"); ein zweites
    // Abzeichen dafür wäre Doppelung.
    const { container, unmount } = render(<NotebookIndexingBadge state="ready" />);
    expect(container).toBeEmptyDOMElement();
    unmount();

    const { container: emptyContainer } = render(<NotebookIndexingBadge state="empty" />);
    expect(emptyContainer).toBeEmptyDOMElement();
  });

  it('rendert nichts, solange der Zustand unbekannt ist', () => {
    // Ältere Antworten ohne `indexing_state` dürfen keine Falschmeldung erzeugen.
    const { container } = render(<NotebookIndexingBadge state={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('ist frei von Verstößen gegen die Zugänglichkeit', async () => {
    const { container } = render(<NotebookIndexingBadge state="failed" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
